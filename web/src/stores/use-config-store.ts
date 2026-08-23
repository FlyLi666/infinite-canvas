import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { nanoid } from "nanoid";

import i18n from "@/i18n";
import { isYanluSameOriginProxyHost, YANLU_CN_API_BASE_URL, YANLU_IMG_API_BASE_URL } from "@/lib/yanlu-endpoints";
import { useAuthStore } from "@/stores/use-auth-store";

export type ApiCallFormat = "openai" | "gemini";
export type ModelCapability = "image" | "video" | "text";
export type ReasoningEffort = "auto" | "low" | "medium" | "high" | "xhigh";

export type ChannelModel = {
    name: string;
    capability: ModelCapability;
    script?: string;
};

export type ModelChannel = {
    id: string;
    name: string;
    baseUrl: string;
    apiKey: string;
    /** 研路AI 文本走 Codex 分组的独立 Key；生图/视频仍用 apiKey。 */
    textApiKey?: string;
    apiFormat: ApiCallFormat;
    models: ChannelModel[];
};

export type AiConfig = {
    channelMode: "remote" | "local";
    baseUrl: string;
    apiKey: string;
    apiFormat: ApiCallFormat;
    channels: ModelChannel[];
    model: string;
    imageModel: string;
    videoModel: string;
    textModel: string;
    videoSeconds: string;
    vquality: string;
    videoGenerateAudio: string;
    videoWatermark: string;
    systemPrompt: string;
    reasoningEffort: ReasoningEffort;
    models: string[];
    quality: string;
    size: string;
    background: string;
    count: string;
    canvasImageCount: string;
};

export type WebdavSyncConfig = {
    url: string;
    username: string;
    password: string;
    directory: string;
    lastSyncedAt: string;
};
export type ConfigTabKey = "channels" | "preferences" | "prompt-sources" | "webdav" | "local-storage";

export const CONFIG_STORE_KEY = "infinite-canvas:ai_config_store";
const CHANNEL_MODEL_SEPARATOR = "::";
const OPENAI_BASE_URL = "https://api.openai.com";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";

export const defaultConfig: AiConfig = {
    channelMode: "local",
    baseUrl: OPENAI_BASE_URL,
    apiKey: "",
    apiFormat: "openai",
    channels: [
        {
            id: "default",
            name: i18n.t("config.channels.defaultName"),
            baseUrl: OPENAI_BASE_URL,
            apiKey: "",
            apiFormat: "openai",
            models: [
                { name: "gpt-image-2", capability: "image" },
                { name: "grok-imagine-video-1.5", capability: "video" },
                { name: "gpt-5.5", capability: "text" },
            ],
        },
    ],
    model: "default::gpt-image-2",
    imageModel: "default::gpt-image-2",
    videoModel: "default::grok-imagine-video-1.5",
    textModel: "default::gpt-5.5",
    videoSeconds: "6",
    vquality: "720",
    videoGenerateAudio: "true",
    videoWatermark: "false",
    systemPrompt: "",
    reasoningEffort: "auto",
    models: ["default::gpt-image-2", "default::grok-imagine-video-1.5", "default::gpt-5.5"],
    quality: "auto",
    size: "1:1",
    background: "",
    count: "1",
    canvasImageCount: "1",
};

export const defaultWebdavSyncConfig: WebdavSyncConfig = {
    url: "",
    username: "",
    password: "",
    directory: "infinite-canvas",
    lastSyncedAt: "",
};

type ConfigStore = {
    config: AiConfig;
    webdav: WebdavSyncConfig;
    isConfigOpen: boolean;
    configTab: ConfigTabKey;
    shouldPromptContinue: boolean;
    updateConfig: <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;
    updateWebdavConfig: <K extends keyof WebdavSyncConfig>(key: K, value: WebdavSyncConfig[K]) => void;
    isAiConfigReady: (config: AiConfig, model: string) => boolean;
    openConfigDialog: (shouldPromptContinue?: boolean, tab?: ConfigTabKey) => void;
    setConfigDialogOpen: (isOpen: boolean) => void;
    clearPromptContinue: () => void;
};

const VIDEO_KEYWORDS = ["video", "sora", "veo", "kling", "wan", "hailuo"];

export function boolConfig(value: string, fallback: boolean) {
    return value ? value === "true" : fallback;
}
const IMAGE_KEYWORDS = ["seedream", "gpt-image", "grok-imagine", "image", "dall-e", "dalle", "imagen", "flux", "sdxl", "stable-diffusion", "midjourney"];
const TTS_KEYWORDS = ["tts", "speech", "whisper", "gpt-4o-mini-tts"];

/** Best-effort default capability for a freshly fetched model name; user can override in the channel editor. */
export function guessCapability(name: string): ModelCapability {
    const value = name.toLowerCase();
    if (VIDEO_KEYWORDS.some((keyword) => value.includes(keyword))) return "video";
    if (IMAGE_KEYWORDS.some((keyword) => value.includes(keyword))) return "image";
    return "text";
}

function isRemovedTtsModel(name: string, capability?: string) {
    if (capability === "audio") return true;
    const value = name.toLowerCase();
    return TTS_KEYWORDS.some((keyword) => value.includes(keyword));
}

function findChannelModel(config: AiConfig, value: string): { channel: ModelChannel; model: ChannelModel } | null {
    const decoded = decodeChannelModel(value);
    const name = decoded?.model || value;
    const channel = decoded ? config.channels.find((item) => item.id === decoded.channelId) : config.channels.find((item) => item.models.some((model) => model.name === name));
    const model = channel?.models.find((item) => item.name === name);
    return channel && model ? { channel, model } : null;
}

export function modelCapabilityOf(config: AiConfig, value: string): ModelCapability | undefined {
    return findChannelModel(config, value)?.model.capability;
}

export function modelMatchesCapability(config: AiConfig, value: string, capability?: ModelCapability) {
    if (!capability) return true;
    return modelCapabilityOf(config, value) === capability;
}

export function resolveModelForCapability(config: AiConfig, currentModel: string | undefined, capability: ModelCapability) {
    const defaultModel = capability === "image" ? config.imageModel : capability === "video" ? config.videoModel : config.textModel;
    const fallbackModel = capability === "image" ? defaultConfig.imageModel : capability === "video" ? defaultConfig.videoModel : defaultConfig.textModel;
    if (currentModel && modelMatchesCapability(config, currentModel, capability)) return currentModel;
    if (defaultModel && modelMatchesCapability(config, defaultModel, capability)) return defaultModel;
    return yanluManagedModel(capability) && config.channels.some((channel) => channel.id === YANLU_CHANNEL_ID) ? yanluManagedModel(capability) : fallbackModel;
}

export function selectableModelsByCapability(config: AiConfig, capability?: ModelCapability) {
    if (!capability) return config.models;
    return config.channels.flatMap((channel) => channel.models.filter((model) => model.capability === capability).map((model) => encodeChannelModel(channel.id, model.name)));
}

/** The user script (if any) attached to a model; empty string means use the system default call. */
export function resolveModelScript(config: AiConfig, value: string) {
    return findChannelModel(config, value)?.model.script?.trim() || "";
}

function isAiConfigReady(config: AiConfig, model: string) {
    const request = resolveModelRequestConfig(config, model);
    return Boolean(model.trim() && request.baseUrl.trim() && request.apiKey.trim());
}

export const useConfigStore = create<ConfigStore>()(
    persist(
        (set, get) => ({
            config: defaultConfig,
            webdav: defaultWebdavSyncConfig,
            isConfigOpen: false,
            configTab: "channels",
            shouldPromptContinue: false,
            updateConfig: (key, value) =>
                set((state) => ({
                    config: {
                        ...state.config,
                        [key]: value,
                    },
                })),
            updateWebdavConfig: (key, value) =>
                set((state) => ({
                    webdav: {
                        ...state.webdav,
                        [key]: value,
                    },
                })),
            // 产品规则：所有生成/编辑动作必须先登录研路AI账号，未登录一律视为未就绪（即使本地渠道可用），
            // 各生成入口随后调用 openConfigDialog(true)，由下方拦截统一弹登录框；登录后才走真实配置检查。
            isAiConfigReady: (config, model) => Boolean(useAuthStore.getState().accessToken) && isAiConfigReady(config, model),
            openConfigDialog: (shouldPromptContinue = false, configTab = "channels") => {
                // 登录墙：生成/编辑动作因配置未就绪走到这里（shouldPromptContinue=true）时，
                // 未登录用户改为弹研路AI登录，登录后由托管渠道自动接管；已登录用户按原逻辑打开配置。
                if (shouldPromptContinue) {
                    const auth = useAuthStore.getState();
                    if (!auth.accessToken) {
                        auth.openLogin();
                        return;
                    }
                    if (!get().config.channels.some((channel) => channel.id === YANLU_CHANNEL_ID)) void auth.provision().catch(() => undefined);
                }
                set({ isConfigOpen: true, shouldPromptContinue, configTab });
            },
            setConfigDialogOpen: (isConfigOpen) => set({ isConfigOpen }),
            clearPromptContinue: () => set({ shouldPromptContinue: false }),
        }),
        {
            name: CONFIG_STORE_KEY,
            partialize: (state) => ({ config: state.config, webdav: state.webdav }),
            merge: (persisted, current) => {
                const persistedState = (persisted || {}) as Partial<ConfigStore>;
                const persistedConfig = (persistedState.config || {}) as Partial<AiConfig>;
                const persistedWebdav = (persistedState.webdav || {}) as Partial<WebdavSyncConfig>;
                const config = { ...defaultConfig, ...persistedConfig };
                if (!Array.isArray(persistedConfig.channels)) config.channels = [];
                const channels = retainPublicChannels(normalizeChannels(config));
                const models = modelOptionsFromChannels(channels);
                return {
                    ...current,
                    webdav: { ...defaultWebdavSyncConfig, ...persistedWebdav },
                    config: {
                        ...config,
                        ...resolvePublicModelSelection(config, channels),
                        apiFormat: normalizeApiFormat(config.apiFormat),
                        channels,
                        models,
                        reasoningEffort: config.reasoningEffort || "auto",
                        videoSeconds: config.videoSeconds || "6",
                        vquality: config.vquality || "720",
                        videoGenerateAudio: config.videoGenerateAudio || "true",
                        videoWatermark: config.videoWatermark || "false",
                        canvasImageCount: config.canvasImageCount || "1",
                    },
                };
            },
        },
    ),
);

export function useEffectiveConfig() {
    const config = useConfigStore((state) => state.config);
    const channelMode = config.channels.some((channel) => channel.id === YANLU_CHANNEL_ID) ? ("remote" as const) : ("local" as const);
    return useMemo(() => ({ ...config, channelMode }), [channelMode, config]);
}

/** Normalize a mixed list of raw model names or model objects into deduped ChannelModel entries. */
export function normalizeChannelModels(models: Array<string | ChannelModel> | undefined): ChannelModel[] {
    const seen = new Set<string>();
    const result: ChannelModel[] = [];
    for (const item of models || []) {
        const name = (typeof item === "string" ? item : item?.name || "").trim();
        const rawCapability = typeof item === "string" ? "" : String(item?.capability || "");
        if (!name || seen.has(name) || isRemovedTtsModel(name, rawCapability)) continue;
        seen.add(name);
        const capability = typeof item === "string" ? guessCapability(name) : item.capability || guessCapability(name);
        const script = typeof item === "string" ? undefined : item.script?.trim() || undefined;
        result.push({ name, capability, script });
    }
    return result;
}

export type ModelChannelInput = Partial<Omit<ModelChannel, "models">> & { models?: Array<string | ChannelModel> };

export function createModelChannel(channel?: ModelChannelInput): ModelChannel {
    const apiFormat = normalizeApiFormat(channel?.apiFormat);
    return {
        id: channel?.id?.trim() || nanoid(),
        name: channel?.name?.trim() || i18n.t("config.channels.newName"),
        baseUrl: channel?.baseUrl?.trim() || defaultBaseUrlForApiFormat(apiFormat),
        apiKey: channel?.apiKey || "",
        ...(channel?.textApiKey?.trim() ? { textApiKey: channel.textApiKey.trim() } : {}),
        apiFormat,
        models: normalizeChannelModels(channel?.models),
    };
}

export function encodeChannelModel(channelId: string, model: string) {
    return `${channelId}${CHANNEL_MODEL_SEPARATOR}${model.trim()}`;
}

export function isChannelModelValue(value: string) {
    return value.includes(CHANNEL_MODEL_SEPARATOR);
}

export function decodeChannelModel(value: string) {
    const index = value.indexOf(CHANNEL_MODEL_SEPARATOR);
    if (index < 0) return null;
    return { channelId: value.slice(0, index), model: value.slice(index + CHANNEL_MODEL_SEPARATOR.length) };
}

export function modelOptionName(value: string) {
    return decodeChannelModel(value)?.model || value;
}

export function modelOptionLabel(config: AiConfig, value: string) {
    const decoded = decodeChannelModel(value);
    if (!decoded) return value;
    const channel = config.channels.find((item) => item.id === decoded.channelId);
    return channel ? `${decoded.model}（${channel.name}）` : decoded.model;
}

export function modelOptionsFromChannels(channels: ModelChannel[]) {
    return uniqueModelOptions(channels.flatMap((channel) => channel.models.map((model) => encodeChannelModel(channel.id, model.name))));
}

export function normalizeModelOptionValue(value: string | undefined, channels: ModelChannel[]) {
    const model = (value || "").trim();
    if (!model) return "";
    const decoded = decodeChannelModel(model);
    if (decoded) {
        const channel = channels.find((item) => item.id === decoded.channelId);
        return channel && channel.models.some((item) => item.name === decoded.model) ? model : "";
    }
    const channel = channels.find((item) => item.models.some((entry) => entry.name === model)) || channels[0];
    return channel && channel.models.some((item) => item.name === model) ? encodeChannelModel(channel.id, model) : model;
}

export function resolveModelChannel(config: AiConfig, value: string) {
    const decoded = decodeChannelModel(value);
    const model = decoded?.model || value;
    const matched = decoded ? config.channels.find((channel) => channel.id === decoded.channelId) : config.channels.find((channel) => channel.models.some((item) => item.name === model));
    return matched || config.channels[0] || createModelChannel({ id: "default", name: i18n.t("config.channels.defaultName"), baseUrl: config.baseUrl, apiKey: config.apiKey, apiFormat: config.apiFormat, models: config.models.map(modelOptionName).map((name) => ({ name, capability: guessCapability(name) })) });
}

export function resolveModelRequestConfig(config: AiConfig, value: string) {
    const channel = resolveModelChannel(config, value);
    const model = modelOptionName(value || config.model);
    return {
        ...config,
        model,
        baseUrl: resolveManagedModelBaseUrl(channel, model),
        apiKey: resolveManagedModelApiKey(channel, model),
        apiFormat: channel.apiFormat,
    };
}

/** gpt-image 走异步生图服务；托管渠道里的 Grok Imagine 图/视频走对话入口。 */
function resolveManagedModelBaseUrl(channel: ModelChannel, model: string) {
    if (channel.id !== YANLU_CHANNEL_ID) return channel.baseUrl;
    return model.startsWith("gpt-image-") ? YANLU_IMG_API_BASE_URL : YANLU_CN_API_BASE_URL;
}

/** 文本走 RIGEL-文本 Key；生图/Grok 走 RIGEL-图像 Key。两边都是当前登录用户自己的托管密钥。 */
function resolveManagedModelApiKey(channel: ModelChannel, model: string) {
    if (channel.id !== YANLU_CHANNEL_ID) return channel.apiKey;
    if (model.startsWith("gpt-image-") || model.startsWith("grok-")) return channel.apiKey;
    return channel.textApiKey?.trim() || "";
}

function normalizeChannels(config: AiConfig) {
    const persistedChannels = Array.isArray(config.channels) ? config.channels : [];
    const channels = persistedChannels.map((channel, index) =>
        createModelChannel({
            ...channel,
            id: channel.id || (index === 0 ? "default" : `channel-${index + 1}`),
            name: channel.name || (index === 0 ? i18n.t("config.channels.defaultName") : i18n.t("config.channels.indexedName", { index: index + 1 })),
            models: normalizeChannelModels(channel.models),
        }),
    );
    if (!channels.length) {
        channels.push(
            createModelChannel({
                id: "default",
                name: i18n.t("config.channels.defaultName"),
                baseUrl: config.baseUrl || defaultConfig.baseUrl,
                apiKey: config.apiKey || "",
                apiFormat: config.apiFormat || defaultConfig.apiFormat,
                models: normalizeChannelModels([config.model, config.imageModel, config.videoModel, config.textModel].map(modelOptionName)),
            }),
        );
    }
    return channels;
}

export function defaultBaseUrlForApiFormat(apiFormat: ApiCallFormat) {
    if (apiFormat === "gemini") return GEMINI_BASE_URL;
    return OPENAI_BASE_URL;
}

function normalizeApiFormat(apiFormat: unknown): ApiCallFormat {
    return apiFormat === "gemini" ? apiFormat : "openai";
}

function uniqueModelOptions(models: string[]) {
    return Array.from(new Set((models || []).map((model) => model.trim()).filter(Boolean)));
}

const YANLU_SAME_ORIGIN_PROXY: Record<string, string> = {
    "admin.flyli.cn": "/__rigel-ai/cpa",
    "api.flyli.cn": "/__rigel-ai/cpa",
    [new URL(YANLU_CN_API_BASE_URL).hostname]: "/__rigel-ai/chat",
    [new URL(YANLU_IMG_API_BASE_URL).hostname]: "/__rigel-ai/image",
};

function proxyYanluBaseUrl(apiBaseUrl: string) {
    // 只有本机 dev / preview 存在同源代理；生产构建直连线上域名。
    if (typeof window === "undefined" || !isYanluSameOriginProxyHost()) return apiBaseUrl;
    try {
        const parsed = new URL(apiBaseUrl, window.location.origin);
        const prefix = YANLU_SAME_ORIGIN_PROXY[parsed.hostname];
        if (!prefix) return apiBaseUrl;
        return `${window.location.origin}${prefix}${parsed.pathname}${parsed.search}`;
    } catch {
        return apiBaseUrl;
    }
}

export function buildApiUrl(baseUrl: string, path: string) {
    const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
    const lowerBaseUrl = normalizedBaseUrl.toLowerCase();
    const apiBaseUrl = lowerBaseUrl.endsWith("/v1") ? normalizedBaseUrl : `${normalizedBaseUrl}/v1`;
    return `${proxyYanluBaseUrl(apiBaseUrl)}${path}`;
}

export const YANLU_CHANNEL_ID = "yanlu";
export const YANLU_CHANNEL_NAME = "研路AI";

/** 对外只保留研路AI托管渠道；未登录时只留默认占位，丢掉用户自己加过的渠道。 */
export function retainPublicChannels(channels: ModelChannel[]): ModelChannel[] {
    const managed = channels.find((channel) => channel.id === YANLU_CHANNEL_ID);
    if (managed) return [managed];
    return [createModelChannel(defaultConfig.channels[0])];
}

const YANLU_IMAGE_MODEL_NAME = "gpt-image-2";
const YANLU_VIDEO_MODEL_NAME = "grok-imagine-video-1.5";
const YANLU_TEXT_MODEL_NAME = "gpt-5.6-sol";
const YANLU_MANAGED_MODELS: ChannelModel[] = [
    { name: "gpt-image-2", capability: "image" },
    { name: "grok-imagine-image", capability: "image" },
    { name: "grok-imagine-edit", capability: "image" },
    { name: "grok-imagine-video-1.5", capability: "video" },
    { name: "gpt-5.6-sol", capability: "text" },
    { name: "gpt-5.6-luna", capability: "text" },
    { name: "gpt-5.6-terra", capability: "text" },
];

function isYanluModelValue(value: string | undefined) {
    return (value || "").startsWith(`${YANLU_CHANNEL_ID}${CHANNEL_MODEL_SEPARATOR}`);
}

function yanluManagedModel(capability: ModelCapability) {
    if (capability === "image") return encodeChannelModel(YANLU_CHANNEL_ID, YANLU_IMAGE_MODEL_NAME);
    if (capability === "video") return encodeChannelModel(YANLU_CHANNEL_ID, YANLU_VIDEO_MODEL_NAME);
    return encodeChannelModel(YANLU_CHANNEL_ID, YANLU_TEXT_MODEL_NAME);
}

function yanluManagedSelection() {
    const imageModel = yanluManagedModel("image");
    return {
        channelMode: "remote" as const,
        imageModel,
        videoModel: yanluManagedModel("video"),
        textModel: yanluManagedModel("text"),
        model: imageModel,
    };
}

/** 已登录（存在 yanlu 渠道）时，默认三模型必须落在托管渠道；未登录维持本地 default 占位。 */
function resolvePublicModelSelection(config: AiConfig, channels: ModelChannel[]) {
    if (!channels.some((channel) => channel.id === YANLU_CHANNEL_ID)) {
        return {
            channelMode: "local" as const,
            imageModel: normalizeModelOptionValue(config.imageModel || config.model, channels),
            videoModel: normalizeModelOptionValue(config.videoModel, channels),
            textModel: normalizeModelOptionValue(config.textModel || config.model, channels),
            model: normalizeModelOptionValue(config.model || config.imageModel, channels),
        };
    }
    const defaults = yanluManagedSelection();
    const pick = (value: string | undefined, fallback: string) => {
        const normalized = normalizeModelOptionValue(value, channels);
        return isYanluModelValue(normalized) ? normalized : fallback;
    };
    return {
        channelMode: "remote" as const,
        imageModel: pick(config.imageModel || config.model, defaults.imageModel),
        videoModel: pick(config.videoModel, defaults.videoModel),
        textModel: pick(config.textModel || config.model, defaults.textModel),
        model: pick(config.model || config.imageModel, defaults.model),
    };
}

/**
 * 登录后写入 / 覆盖研路AI托管渠道（id 固定 yanlu，同名渠道一并覆盖），密钥由账号自动开通。
 * 默认模型仅在显式登录（adoptDefaults）或当前选择不是 yanlu:: 时切到托管模型，
 * 保证用户在托管渠道内换过的模型不会在每次启动时被抢走。
 */
function upsertYanluChannel(channels: ModelChannel[], managed: ModelChannel) {
    return [managed, ...channels.filter((channel) => channel.id !== YANLU_CHANNEL_ID)];
}

export function applyYanluManagedChannel(apiKey: string, options?: { adoptDefaults?: boolean; textApiKey?: string }) {
    useConfigStore.setState((state) => {
        const managed = createModelChannel({
            id: YANLU_CHANNEL_ID,
            name: YANLU_CHANNEL_NAME,
            baseUrl: YANLU_IMG_API_BASE_URL,
            apiKey,
            textApiKey: options?.textApiKey,
            apiFormat: "openai",
            models: YANLU_MANAGED_MODELS,
        });
        const channels = retainPublicChannels(upsertYanluChannel(state.config.channels, managed));
        const config = { ...state.config, channels, models: modelOptionsFromChannels(channels) };
        const selection = options?.adoptDefaults ? yanluManagedSelection() : resolvePublicModelSelection(config, channels);
        return {
            config: {
                ...config,
                ...selection,
            },
        };
    });
    void applyLocalChannelOverride();
}

/** 退出登录时移除托管渠道；指向它的默认模型会被清空，下次生成动作会重新弹登录。 */
export function removeYanluManagedChannel() {
    useConfigStore.setState((state) => {
        if (!state.config.channels.some((channel) => channel.id === YANLU_CHANNEL_ID)) return {};
        const channels = state.config.channels.filter((channel) => channel.id !== YANLU_CHANNEL_ID);
        if (!channels.length) channels.push(createModelChannel(defaultConfig.channels[0]));
        const config = { ...state.config, channels, models: modelOptionsFromChannels(channels) };
        return {
            config: {
                ...config,
                ...resolvePublicModelSelection(config, channels),
            },
        };
    });
}

export async function applyLocalChannelOverride() {
    try {
        const res = await fetch("/.local-channel.json", { cache: "no-store" });
        if (!res.ok) return false;
        const local = (await res.json()) as {
            name?: string;
            baseUrl?: string;
            apiKey?: string;
            models?: Array<string | ChannelModel>;
            imageModel?: string;
            videoModel?: string;
            textModel?: string;
            channels?: Partial<ModelChannel>[];
        };
        const sharedKey = String(local.apiKey || "").trim();
        const sharedBase = String(local.baseUrl || "").trim();
        const rawChannels: ModelChannelInput[] = Array.isArray(local.channels) && local.channels.length
            ? local.channels
            : [{ id: "default", name: local.name, baseUrl: sharedBase, apiKey: sharedKey, models: local.models }];
        const channels = rawChannels.map((channel, index) =>
            createModelChannel({
                ...channel,
                id: channel.id || (index === 0 ? "default" : `channel-${index + 1}`),
                name: channel.name || local.name || i18n.t("config.channels.defaultName"),
                baseUrl: channel.baseUrl || sharedBase,
                apiKey: channel.apiKey || sharedKey,
                apiFormat: channel.apiFormat || "openai",
                models: channel.models || local.models,
            }),
        );
        const localChannels = channels.filter((channel) => channel.id !== YANLU_CHANNEL_ID);
        if (!localChannels.length || localChannels.some((channel) => !channel.baseUrl.trim() || !channel.apiKey.trim())) return false;
        useConfigStore.setState((state) => {
            // 本地 override 不得再写入一份 yanlu；登录开通的托管渠道按 id 只保留一份。
            const managedChannel = state.config.channels.find((channel) => channel.id === YANLU_CHANNEL_ID);
            const mergedChannels = managedChannel ? upsertYanluChannel(localChannels, managedChannel) : localChannels;
            const imageValue = local.imageModel ? normalizeModelOptionValue(local.imageModel, mergedChannels) : "";
            const videoValue = local.videoModel ? normalizeModelOptionValue(local.videoModel, mergedChannels) : "";
            const textValue = local.textModel ? normalizeModelOptionValue(local.textModel, mergedChannels) : "";
            const keepManagedModel = (value: string, current: string) => (managedChannel && value && !isYanluModelValue(value) ? current : value || current);
            return {
                config: {
                    ...state.config,
                    baseUrl: channels[0].baseUrl,
                    apiKey: channels[0].apiKey,
                    apiFormat: "openai",
                    channels: mergedChannels,
                    models: modelOptionsFromChannels(mergedChannels),
                    ...resolvePublicModelSelection(
                        {
                            ...state.config,
                            imageModel: keepManagedModel(imageValue, state.config.imageModel),
                            videoModel: keepManagedModel(videoValue, state.config.videoModel),
                            textModel: keepManagedModel(textValue, state.config.textModel),
                            model: keepManagedModel(imageValue, state.config.model),
                        },
                        mergedChannels,
                    ),
                },
            };
        });
        return true;
    } catch {
        return false;
    }
}
