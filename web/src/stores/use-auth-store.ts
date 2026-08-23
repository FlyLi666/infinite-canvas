import { create } from "zustand";
import { persist } from "zustand/middleware";

import i18n from "@/i18n";
import {
    createApiKey,
    fetchPublicSettings,
    fetchUserProfile,
    listApiKeys,
    listAvailableGroups,
    loginWithPassword,
    loginWithTotp,
    pickYanluMediaGroupId,
    pickYanluTextGroupId,
    refreshTokenPair,
    Sub2ApiError,
    updateApiKeyGroup,
    type AuthUser,
    type LoginResult,
    type ProvisionedKey,
    type PublicSettings,
    type TokenPair,
} from "@/services/api/sub2api";
import { applyYanluManagedChannel, removeYanluManagedChannel } from "@/stores/use-config-store";

export const AUTH_STORE_KEY = "rigel-ai:auth";
const CANVAS_MEDIA_KEY_NAME = "RIGEL-图像";
const CANVAS_TEXT_KEY_NAME = "RIGEL-文本";
const EXPIRY_SKEW_MS = 60_000;

type AuthStore = {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    user: AuthUser | null;
    loginOpen: boolean;
    openLogin: () => void;
    closeLogin: () => void;
    probePublicSettings: () => Promise<PublicSettings>;
    login: (email: string, password: string, turnstileToken?: string) => Promise<LoginResult>;
    complete2fa: (tempToken: string, totpCode: string) => Promise<void>;
    refresh: () => Promise<boolean>;
    fetchProfile: () => Promise<void>;
    provision: (options?: { adoptDefaults?: boolean }) => Promise<void>;
    bootstrap: () => Promise<void>;
    logout: () => void;
};

let refreshPromise: Promise<boolean> | null = null;
let provisionPromise: Promise<void> | null = null;
let profilePromise: Promise<void> | null = null;

/** 带登录态调用：token 过期先刷新；调用中遇到登录态失效则刷新后重试一次，仍失败就登出。 */
async function withValidToken<T>(run: (token: string) => Promise<T>): Promise<T> {
    const store = useAuthStore.getState();
    if (!store.accessToken) throw new Sub2ApiError(i18n.t("auth.errors.sessionExpired"), { status: 401, tokenInvalid: true });
    if (store.expiresAt && Date.now() > store.expiresAt - EXPIRY_SKEW_MS) {
        if (!(await store.refresh())) throw new Sub2ApiError(i18n.t("auth.errors.sessionExpired"), { status: 401, tokenInvalid: true });
    }
    try {
        return await run(useAuthStore.getState().accessToken);
    } catch (error) {
        if (error instanceof Sub2ApiError && error.tokenInvalid) {
            if (await useAuthStore.getState().refresh()) {
                return run(useAuthStore.getState().accessToken);
            }
            useAuthStore.getState().logout();
        }
        throw error;
    }
}

async function ensureNamedKey(token: string, keys: ProvisionedKey[], name: string, idempotencyKey: string, groupId: number | null) {
    const existing = keys.find((item) => item.name === name && item.key && item.status !== "disabled");
    if (existing) {
        if (groupId && existing.id && existing.groupId !== groupId) await updateApiKeyGroup(token, existing.id, groupId);
        return existing.key;
    }
    const created = await createApiKey(token, name, idempotencyKey, groupId ?? undefined);
    if (!created.key) throw new Sub2ApiError(i18n.t("auth.provisionFailed"));
    return created.key;
}

export const useAuthStore = create<AuthStore>()(
    persist(
        (set, get) => {
            const applyTokens = (tokens: TokenPair) =>
                set({
                    accessToken: tokens.accessToken,
                    refreshToken: tokens.refreshToken,
                    expiresAt: Date.now() + tokens.expiresIn * 1000,
                    ...(tokens.user ? { user: tokens.user } : {}),
                });

            const completeLogin = async (tokens: TokenPair) => {
                applyTokens(tokens);
                if (!tokens.user) await get().fetchProfile();
                try {
                    await get().provision({ adoptDefaults: true });
                } catch {
                    throw new Sub2ApiError(i18n.t("auth.provisionFailed"));
                }
            };

            return {
                accessToken: "",
                refreshToken: "",
                expiresAt: 0,
                user: null,
                loginOpen: false,
                openLogin: () => set({ loginOpen: true }),
                closeLogin: () => set({ loginOpen: false }),
                probePublicSettings: () => fetchPublicSettings(),
                login: async (email, password, turnstileToken) => {
                    const result = await loginWithPassword(email.trim(), password, turnstileToken);
                    if (!result.requires2fa) await completeLogin(result.tokens);
                    return result;
                },
                complete2fa: async (tempToken, totpCode) => {
                    await completeLogin(await loginWithTotp(tempToken, totpCode));
                },
                refresh: () => {
                    if (refreshPromise) return refreshPromise;
                    const { refreshToken } = get();
                    if (!refreshToken) return Promise.resolve(false);
                    const request = refreshTokenPair(refreshToken)
                        .then((tokens) => {
                            applyTokens(tokens);
                            return true;
                        })
                        .catch((error: unknown) => {
                            // 网络类失败保留会话，等下次再试；只有服务端明确判定 token 无效才登出。
                            if (error instanceof Sub2ApiError && (error.tokenInvalid || error.status === 401)) get().logout();
                            return false;
                        })
                        .finally(() => {
                            refreshPromise = null;
                        });
                    refreshPromise = request;
                    return request;
                },
                fetchProfile: () => {
                    if (profilePromise) return profilePromise;
                    if (!get().accessToken) return Promise.resolve();
                    const request = withValidToken((token) => fetchUserProfile(token))
                        .then((user) => {
                            set({ user });
                        })
                        .catch(() => undefined)
                        .finally(() => {
                            profilePromise = null;
                        });
                    profilePromise = request;
                    return request;
                },
                provision: (options) => {
                    if (provisionPromise) return provisionPromise;
                    const request = withValidToken(async (token) => {
                        const userId = get().user?.id || "user";
                        const keys = await listApiKeys(token);
                        const groups = await listAvailableGroups(token);
                        const mediaGroupId = pickYanluMediaGroupId(groups);
                        const textGroupId = pickYanluTextGroupId(groups);
                        if (!textGroupId) throw new Sub2ApiError(i18n.t("auth.provisionFailed"));
                        const mediaKey = await ensureNamedKey(token, keys, CANVAS_MEDIA_KEY_NAME, `rigel-image-key-${userId}`, mediaGroupId);
                        const textKey = await ensureNamedKey(token, keys, CANVAS_TEXT_KEY_NAME, `rigel-text-key-${userId}`, textGroupId);
                        return { mediaKey, textKey };
                    })
                        .then(({ mediaKey, textKey }) => {
                            applyYanluManagedChannel(mediaKey, { ...options, textApiKey: textKey });
                        })
                        .finally(() => {
                            provisionPromise = null;
                        });
                    provisionPromise = request;
                    return request;
                },
                bootstrap: async () => {
                    const state = get();
                    if (!state.accessToken && !state.refreshToken) return;
                    if (!state.accessToken || (state.expiresAt && Date.now() > state.expiresAt - EXPIRY_SKEW_MS)) {
                        if (!(await get().refresh())) return;
                    }
                    await Promise.allSettled([get().fetchProfile(), get().provision().catch(() => undefined)]);
                },
                logout: () => {
                    set({ accessToken: "", refreshToken: "", expiresAt: 0, user: null });
                    removeYanluManagedChannel();
                },
            };
        },
        {
            name: AUTH_STORE_KEY,
            partialize: (state) => ({
                accessToken: state.accessToken,
                refreshToken: state.refreshToken,
                expiresAt: state.expiresAt,
                user: state.user,
            }),
        },
    ),
);
