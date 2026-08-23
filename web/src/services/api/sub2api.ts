// 研路AI 账号服务（Sub2API）客户端：负责 {code:0,data} 信封解包和错误到中文文案的映射。
// 这里的函数不读全局状态，token 由调用方（auth store）显式传入。

import i18n from "@/i18n";
import { sub2apiBaseUrl } from "@/lib/yanlu-endpoints";

const authText = (key: string) => i18n.t(`auth.errors.${key}`);

export class Sub2ApiError extends Error {
    status: number;
    reason?: string;
    /** 中间件返回的字符串 code（TOKEN_EXPIRED / INVALID_TOKEN 等），代表登录态失效，可尝试刷新后重试。 */
    tokenInvalid: boolean;

    constructor(message: string, options: { status?: number; reason?: string; tokenInvalid?: boolean } = {}) {
        super(message);
        this.name = "Sub2ApiError";
        this.status = options.status ?? 0;
        this.reason = options.reason;
        this.tokenInvalid = options.tokenInvalid ?? false;
    }
}

export type PublicSettings = {
    turnstileEnabled: boolean;
    turnstileSiteKey: string;
};

export type AuthUser = {
    id: string;
    email: string;
    username: string;
    balance: number;
    frozenBalance: number;
};

export type TokenPair = {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    user?: AuthUser;
};

export type LoginResult = { requires2fa: false; tokens: TokenPair } | { requires2fa: true; tempToken: string; maskedEmail: string };

export type ProvisionedKey = {
    id: string;
    key: string;
    name: string;
    status: string;
    groupId: number | null;
};

export type AvailableGroup = {
    id: number;
    name: string;
    platform: string;
    rateMultiplier: number;
};

const REASON_MESSAGE_KEYS: Record<string, string> = {
    INVALID_CREDENTIALS: "invalidCredentials",
    USER_NOT_ACTIVE: "userNotActive",
    TURNSTILE_VERIFICATION_FAILED: "turnstileFailed",
};

type RawUser = {
    id?: number | string;
    email?: string;
    username?: string;
    balance?: number | string;
    frozen_balance?: number | string;
};

type RawTokenPair = {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    user?: RawUser;
};

type RequestConfig = {
    method?: string;
    token?: string;
    body?: unknown;
    headers?: Record<string, string>;
};

async function sub2apiRequest<T>(path: string, config: RequestConfig = {}): Promise<T> {
    let response: Response;
    try {
        response = await fetch(`${sub2apiBaseUrl()}${path}`, {
            method: config.method || "GET",
            headers: {
                ...(config.body !== undefined ? { "Content-Type": "application/json" } : {}),
                ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
                ...config.headers,
            },
            body: config.body !== undefined ? JSON.stringify(config.body) : undefined,
        });
    } catch {
        throw new Sub2ApiError(authText("network"));
    }
    let payload: Record<string, unknown> | null = null;
    try {
        payload = (await response.json()) as Record<string, unknown>;
    } catch {
        payload = null;
    }
    // 登录限流（20 次/分钟/IP）返回 {"error","message"}，没有业务信封。
    if (response.status === 429) throw new Sub2ApiError(authText("rateLimited"), { status: 429 });
    const code = payload?.code;
    const serverMessage = typeof payload?.message === "string" ? payload.message : "";
    // 鉴权中间件的错误 code 是字符串（TOKEN_EXPIRED / INVALID_TOKEN 等），与业务信封的数字 code 区分开。
    if (typeof code === "string" && code) {
        throw new Sub2ApiError(authText("sessionExpired"), { status: response.status || 401, reason: code, tokenInvalid: true });
    }
    if (typeof code === "number") {
        if (code === 0) return payload?.data as T;
        const reason = typeof payload?.reason === "string" ? payload.reason : "";
        const messageKey = REASON_MESSAGE_KEYS[reason];
        throw new Sub2ApiError(messageKey ? authText(messageKey) : serverMessage || authText("requestFailed"), { status: response.status, reason });
    }
    if (response.status === 401) throw new Sub2ApiError(authText("sessionExpired"), { status: 401, tokenInvalid: true });
    throw new Sub2ApiError(serverMessage || authText("requestFailed"), { status: response.status });
}

function mapUser(raw: RawUser | undefined): AuthUser | undefined {
    if (!raw) return undefined;
    return {
        id: String(raw.id ?? ""),
        email: String(raw.email || ""),
        username: String(raw.username || ""),
        balance: Number(raw.balance ?? 0) || 0,
        frozenBalance: Number(raw.frozen_balance ?? 0) || 0,
    };
}

function mapTokenPair(raw: RawTokenPair): TokenPair {
    if (!raw?.access_token || !raw.refresh_token) throw new Sub2ApiError(authText("requestFailed"));
    return {
        accessToken: raw.access_token,
        refreshToken: raw.refresh_token,
        expiresIn: Number(raw.expires_in) > 0 ? Number(raw.expires_in) : 86400,
        user: mapUser(raw.user),
    };
}

export async function fetchPublicSettings(): Promise<PublicSettings> {
    const data = await sub2apiRequest<{ turnstile_enabled?: boolean; turnstile_site_key?: string }>("/settings/public");
    return {
        turnstileEnabled: Boolean(data?.turnstile_enabled),
        turnstileSiteKey: String(data?.turnstile_site_key || ""),
    };
}

export async function loginWithPassword(email: string, password: string, turnstileToken?: string): Promise<LoginResult> {
    const data = await sub2apiRequest<RawTokenPair & { requires_2fa?: boolean; temp_token?: string; user_email_masked?: string }>("/auth/login", {
        method: "POST",
        body: { email, password, ...(turnstileToken ? { turnstile_token: turnstileToken } : {}) },
    });
    if (data?.requires_2fa) {
        return { requires2fa: true, tempToken: String(data.temp_token || ""), maskedEmail: String(data.user_email_masked || "") };
    }
    return { requires2fa: false, tokens: mapTokenPair(data) };
}

export async function loginWithTotp(tempToken: string, totpCode: string): Promise<TokenPair> {
    const data = await sub2apiRequest<RawTokenPair>("/auth/login/2fa", {
        method: "POST",
        body: { temp_token: tempToken, totp_code: totpCode },
    });
    return mapTokenPair(data);
}

export async function refreshTokenPair(refreshToken: string): Promise<TokenPair> {
    const data = await sub2apiRequest<RawTokenPair>("/auth/refresh", {
        method: "POST",
        body: { refresh_token: refreshToken },
    });
    return mapTokenPair(data);
}

export async function fetchUserProfile(token: string): Promise<AuthUser> {
    const data = await sub2apiRequest<RawUser>("/user/profile", { token });
    const user = mapUser(data);
    if (!user) throw new Sub2ApiError(authText("requestFailed"));
    return user;
}

export async function listApiKeys(token: string): Promise<ProvisionedKey[]> {
    const data = await sub2apiRequest<{ items?: Array<{ id?: number | string; key?: string; name?: string; status?: string; group_id?: number | null }> }>("/keys?page=1&page_size=100", { token });
    return (data?.items || []).map(mapProvisionedKey);
}

export async function listAvailableGroups(token: string): Promise<AvailableGroup[]> {
    const data = await sub2apiRequest<Array<{ id?: number; name?: string; platform?: string; rate_multiplier?: number }>>("/groups/available", { token });
    return (Array.isArray(data) ? data : []).flatMap((item) => {
        const id = Number(item?.id);
        if (!Number.isFinite(id) || id <= 0) return [];
        return [
            {
                id,
                name: String(item.name || ""),
                platform: String(item.platform || ""),
                rateMultiplier: Number(item.rate_multiplier) || 0,
            },
        ];
    });
}

/** 文本密钥优先绑 RIGEL-文本，其次稳定 Codex 分组，最后才退回其它可用文本组。 */
export function pickYanluTextGroupId(groups: AvailableGroup[]) {
    const reserved = groups.filter(isReservedCanvasTextGroup).toSorted((a, b) => a.rateMultiplier - b.rateMultiplier || a.id - b.id);
    if (reserved[0]) return reserved[0].id;
    const stable = groups.filter(isYanluStableTextGroup).toSorted((a, b) => a.rateMultiplier - b.rateMultiplier || a.id - b.id);
    if (stable[0]) return stable[0].id;
    const ranked = groups.filter(isYanluTextGroup).toSorted((a, b) => a.rateMultiplier - b.rateMultiplier || a.id - b.id);
    return ranked[0]?.id ?? null;
}

/** 生图/视频密钥优先绑 RIGEL-图像；没有同名分组时再退回 Grok 分组。 */
export function pickYanluMediaGroupId(groups: AvailableGroup[]) {
    const reserved = groups.filter(isReservedCanvasMediaGroup).toSorted((a, b) => a.rateMultiplier - b.rateMultiplier || a.id - b.id);
    if (reserved[0]) return reserved[0].id;
    const grok = groups.filter(isYanluGrokGroup).toSorted((a, b) => a.rateMultiplier - b.rateMultiplier || a.id - b.id);
    return grok[0]?.id ?? null;
}

export async function createApiKey(token: string, name: string, idempotencyKey: string, groupId?: number): Promise<ProvisionedKey> {
    const data = await sub2apiRequest<{ id?: number | string; key?: string; name?: string; status?: string; group_id?: number | null }>("/keys", {
        method: "POST",
        token,
        body: { name, ...(groupId ? { group_id: groupId } : {}) },
        headers: { "Idempotency-Key": idempotencyKey },
    });
    return mapProvisionedKey({ ...data, name: data?.name || name });
}

export async function updateApiKeyGroup(token: string, keyId: string, groupId: number): Promise<void> {
    await sub2apiRequest(`/keys/${encodeURIComponent(keyId)}`, {
        method: "PUT",
        token,
        body: { group_id: groupId },
    });
}

function mapProvisionedKey(item: { id?: number | string; key?: string; name?: string; status?: string; group_id?: number | null } | null | undefined): ProvisionedKey {
    const groupId = Number(item?.group_id);
    return {
        id: String(item?.id ?? ""),
        key: String(item?.key || ""),
        name: String(item?.name || ""),
        status: String(item?.status || ""),
        groupId: Number.isFinite(groupId) && groupId > 0 ? groupId : null,
    };
}

function isYanluTextGroup(group: AvailableGroup) {
    const name = group.name.toLowerCase();
    if (group.platform.toLowerCase() === "grok") return false;
    if (name.includes("grok")) return false;
    if (name.includes("监控") || name.includes("内部") || name.includes("自用")) return false;
    if (group.rateMultiplier >= 50) return false;
    return group.platform.toLowerCase() === "openai" || name.includes("codex") || name.includes("gpt");
}

function isReservedCanvasTextGroup(group: AvailableGroup) {
    const name = normalizeGroupName(group.name);
    if (name.includes("监控") || name.includes("内部")) return false;
    return name === "rigel-文本" || name === "rigel文本";
}

function isYanluStableTextGroup(group: AvailableGroup) {
    if (!isYanluTextGroup(group)) return false;
    return group.name.includes("稳定");
}

function isReservedCanvasMediaGroup(group: AvailableGroup) {
    const name = normalizeGroupName(group.name);
    if (name.includes("监控") || name.includes("内部")) return false;
    return name === "rigel-图像" || name === "rigel图像" || name === "rigel" || name === "rigel画布";
}

function normalizeGroupName(name: string) {
    return name.trim().toLowerCase().replace(/\s+/g, "");
}

function isYanluGrokGroup(group: AvailableGroup) {
    const name = group.name.toLowerCase();
    if (name.includes("监控") || name.includes("内部")) return false;
    return group.platform.toLowerCase() === "grok" || name.includes("grok");
}
