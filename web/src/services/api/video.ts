import axios from "axios";
import { nanoid } from "nanoid";

import i18n from "@/i18n";
import { humanizeGenerationError } from "@/lib/generation-errors";
import { dataUrlToFile } from "@/lib/image-utils";
import { uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { imageToDataUrl } from "@/services/image-storage";
import { refreshYanluBalance } from "@/stores/use-auth-store";
import { grokVideoRequestAspectRatio, modelCapabilities } from "@/lib/model-capabilities";
import { isBrowserReachableMediaUrl, mediaHostsFromBaseUrl } from "@/lib/reachable-media";
import { boolConfig, buildApiUrl, modelOptionName, resolveModelRequestConfig, resolveModelScript, type AiConfig } from "@/stores/use-config-store";
import { runModelPlugin } from "./model-plugin";
import type { ReferenceImage } from "@/types/image";

type VideoResponse = { id?: string; request_id?: string; status?: string; error?: { message?: string }; url?: string; result_url?: string; video_url?: string; video?: { url?: string } | null; content?: { video_url?: string; url?: string } | null };
type ApiVideoResponse = VideoResponse | { code?: number | string; data?: VideoResponse | null; msg?: string; message?: string; error?: { message?: string } };
type ApiEnvelope<T> = T | { code?: number | string; data?: T | null; msg?: string; message?: string; error?: { message?: string } };
type RequestOptions = { signal?: AbortSignal };
const apiText = (key: string, options?: Record<string, unknown>) => i18n.t(`apiErrors.${key}`, options);

export type VideoGenerationResult = { blob?: Blob; url?: string; mimeType?: string };
export type VideoGenerationTask = { id: string; provider: "openai" | "plugin"; model: string };
export type VideoGenerationTaskState = { status: "pending" } | { status: "completed"; result: VideoGenerationResult } | { status: "failed"; error: string };

/** Results for scripted (plugin) video models, which run their own create+poll in one shot at task creation. */
const pluginVideoResults = new Map<string, VideoGenerationResult>();

function aiApiUrl(config: AiConfig, path: string) {
    return buildApiUrl(config.baseUrl, path);
}

function aiHeaders(config: AiConfig, contentType?: string) {
    return {
        Authorization: `Bearer ${config.apiKey}`,
        ...(contentType ? { "Content-Type": contentType } : {}),
    };
}

export async function requestVideoGeneration(config: AiConfig, prompt: string, references: ReferenceImage[] = [], options?: RequestOptions): Promise<VideoGenerationResult> {
    try {
        const task = await createVideoGenerationTask(config, prompt, references, options);
        for (let attempt = 0; attempt < 120; attempt += 1) {
            if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
            const state = await pollVideoGenerationTask(config, task, options);
            if (state.status === "completed") return state.result;
            if (state.status === "failed") throw new Error(state.error);
            if (attempt === 119) throw new Error(apiText("videoTimeout", { provider: "" }));
            await delay(2500, options?.signal);
        }
        throw new Error(apiText("videoTimeout", { provider: "" }));
    } finally {
        refreshYanluBalance();
    }
}

export async function createVideoGenerationTask(config: AiConfig, prompt: string, references: ReferenceImage[] = [], options?: RequestOptions): Promise<VideoGenerationTask> {
    try {
        const selectedModel = (config.model || config.videoModel).trim();
        const requestConfig = resolveModelRequestConfig(config, selectedModel);
        const script = resolveModelScript(config, selectedModel);
        if (script) return await createPluginVideoTask(requestConfig, selectedModel, script, prompt, references, options);
        assertVideoConfig(requestConfig, requestConfig.model);
        if (modelCapabilities(requestConfig.model).grokVideoApi) return await createGrokVideoTask(requestConfig, selectedModel, prompt, references, options);
        return await createOpenAIVideoTask(requestConfig, selectedModel, prompt, references, options);
    } catch (error) {
        refreshYanluBalance();
        throw error;
    }
}

export async function pollVideoGenerationTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    try {
        const state = await pollVideoGenerationTaskInner(config, task, options);
        if (state.status === "completed" || state.status === "failed") refreshYanluBalance();
        return state;
    } catch (error) {
        refreshYanluBalance();
        throw error;
    }
}

async function pollVideoGenerationTaskInner(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    if (task.provider === "plugin") {
        const result = pluginVideoResults.get(task.id);
        return result ? { status: "completed", result } : { status: "failed", error: apiText("pluginVideoExpired") };
    }
    const requestConfig = resolveModelRequestConfig(config, task.model);
    assertVideoConfig(requestConfig, requestConfig.model);
    if (modelCapabilities(requestConfig.model).grokVideoApi || modelCapabilities(task.model).grokVideoApi) return pollGrokVideoTask(requestConfig, task, options);
    return pollOpenAIVideoTask(requestConfig, task, options);
}

async function createPluginVideoTask(config: AiConfig, model: string, script: string, prompt: string, references: ReferenceImage[], options?: RequestOptions): Promise<VideoGenerationTask> {
    if (!config.baseUrl.trim()) throw new Error(apiText("baseUrlRequired"));
    if (!config.apiKey.trim()) throw new Error(apiText("apiKeyRequired"));
    const refs = await Promise.all(references.map((image) => imageToDataUrl(image)));
    const result = videoPluginResult(
        await runModelPlugin({
            capability: "video",
            script,
            config,
            prompt,
            images: refs,
            params: {
                seconds: normalizeVideoSeconds(config.videoSeconds),
                size: normalizeVideoSize(config.size),
                resolution: normalizeVideoResolution(config.vquality),
                ratio: config.size,
                generateAudio: boolConfig(config.videoGenerateAudio, true),
                watermark: boolConfig(config.videoWatermark, false),
            },
            signal: options?.signal,
        }),
    );
    const id = nanoid();
    pluginVideoResults.set(id, result);
    return { id, provider: "plugin", model };
}

function videoPluginResult(result: unknown): VideoGenerationResult {
    if (result instanceof Blob) return { blob: result };
    if (typeof result === "string") return { url: result, mimeType: "video/mp4" };
    if (result && typeof result === "object") {
        const record = result as Record<string, unknown>;
        if (record.blob instanceof Blob) return { blob: record.blob };
        const url = [record.url, record.video_url, record.result_url].find((value) => typeof value === "string" && value) as string | undefined;
        if (url) return { url, mimeType: "video/mp4" };
    }
    throw new Error(apiText("scriptNoVideo"));
}

export async function storeGeneratedVideo(result: VideoGenerationResult): Promise<UploadedFile> {
    if (result.blob) return uploadMediaFile(result.blob, "video");
    if (result.url) {
        if (!isBrowserReachableMediaUrl(result.url)) throw new Error(apiText("mediaUnreachable"));
        try {
            return await uploadMediaFile(result.url, "video");
        } catch {
            return { url: result.url, storageKey: "", bytes: 0, mimeType: result.mimeType || "video/mp4" };
        }
    }
    throw new Error(apiText("noPlayableVideo"));
}

function videoTaskId(payload: VideoResponse) {
    return (payload.id || payload.request_id || "").trim();
}

function normalizeGrokVideoResolution(value: string, model: string) {
    const allowed = modelCapabilities(model).videoResolutions.map((item) => `${item}p`);
    const resolution = normalizeVideoResolution(value);
    return allowed.includes(resolution) ? resolution : allowed.includes("720p") ? "720p" : allowed[0] || "720p";
}

async function createGrokVideoTask(config: AiConfig, model: string, prompt: string, references: ReferenceImage[], options?: RequestOptions): Promise<VideoGenerationTask> {
    const caps = modelCapabilities(model);
    const aspectRatio = grokVideoRequestAspectRatio(config.size, Boolean(references[0]));
    const body: Record<string, unknown> = {
        model: modelOptionName(model),
        prompt,
        duration: Number(normalizeVideoSeconds(config.videoSeconds, caps.videoSecondsMax, caps.videoSecondsMin)),
        resolution: normalizeGrokVideoResolution(config.vquality, model),
        generate_audio: boolConfig(config.videoGenerateAudio, caps.videoGenerateAudio),
    };
    if (aspectRatio) body.aspect_ratio = aspectRatio;
    if (references[0]) body.image = { url: await imageToDataUrl(references[0]) };
    try {
        const created = unwrapVideoResponse((await axios.post<ApiVideoResponse>(aiApiUrl(config, "/videos/generations"), body, { headers: aiHeaders(config, "application/json"), signal: options?.signal })).data);
        const id = videoTaskId(created);
        if (!id) throw new Error(apiText("noVideoTaskId"));
        return { id, provider: "openai", model };
    } catch (error) {
        throw new Error(readAxiosError(error, apiText("videoTaskCreateFailed")));
    }
}

async function pollGrokVideoTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    try {
        const video = unwrapVideoResponse((await axios.get<ApiVideoResponse>(aiApiUrl(config, `/videos/${task.id}`), { headers: aiHeaders(config), signal: options?.signal })).data);
        return await completeVideoFromTask(config, task, video, options);
    } catch (error) {
        throw new Error(readAxiosError(error, apiText("videoTaskQueryFailed")));
    }
}

async function createOpenAIVideoTask(config: AiConfig, model: string, prompt: string, references: ReferenceImage[], options?: RequestOptions): Promise<VideoGenerationTask> {
    const body = new FormData();
    body.append("model", modelOptionName(model));
    body.append("prompt", prompt);
    body.append("seconds", normalizeVideoSeconds(config.videoSeconds));
    if (normalizeVideoSize(config.size)) body.append("size", normalizeVideoSize(config.size)!);
    body.append("resolution_name", normalizeVideoResolution(config.vquality));
    body.append("preset", "normal");
    const files = await Promise.all(references.slice(0, 7).map(async (image) => dataUrlToFile({ ...image, dataUrl: await imageToDataUrl(image) })));
    files.forEach((file) => body.append("input_reference[]", file));
    try {
        const created = unwrapVideoResponse((await axios.post<ApiVideoResponse>(aiApiUrl(config, "/videos"), body, { headers: aiHeaders(config), signal: options?.signal })).data);
        if (!created.id) throw new Error(apiText("noVideoTaskId"));
        return { id: created.id, provider: "openai", model };
    } catch (error) {
        throw new Error(readAxiosError(error, apiText("videoTaskCreateFailed")));
    }
}

async function pollOpenAIVideoTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    try {
        const video = unwrapVideoResponse((await axios.get<ApiVideoResponse>(aiApiUrl(config, `/videos/${task.id}`), { headers: aiHeaders(config), signal: options?.signal })).data);
        return await completeVideoFromTask(config, task, video, options);
    } catch (error) {
        throw new Error(readAxiosError(error, apiText("videoTaskQueryFailed")));
    }
}

async function completeVideoFromTask(config: AiConfig, task: VideoGenerationTask, video: VideoResponse, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    const extraHosts = mediaHostsFromBaseUrl(config.baseUrl);
    const url = videoResultUrl(video);
    const status = (video.status || "").toLowerCase();
    if (status === "failed" || status === "cancelled" || status === "expired") {
        return { status: "failed", error: readApiErrorMessage(video.error?.message) || apiText("videoGenerationFailed") };
    }
    const done = status === "done" || status === "completed" || status === "succeeded" || status === "success";
    const finished = done || (Boolean(url) && !status);
    const reachable = Boolean(url && isBrowserReachableMediaUrl(url, extraHosts));

    if (url || finished) {
        const blob = await fetchVideoContent(config, task.id, options);
        if (blob) return { status: "completed", result: { blob } };
    }

    if (reachable && url) {
        const result = await videoResultFromUrl(url, extraHosts, options);
        if (result.blob) return { status: "completed", result };
        return { status: "completed", result: { url, mimeType: "video/mp4" } };
    }
    if (finished) return { status: "failed", error: apiText("mediaUnreachable") };
    return { status: "pending" };
}

async function fetchVideoContent(config: AiConfig, taskId: string, options?: RequestOptions) {
    try {
        const content = await axios.get<Blob>(aiApiUrl(config, `/videos/${encodeURIComponent(taskId)}/content`), {
            headers: aiHeaders(config),
            responseType: "blob",
            timeout: 180_000,
            signal: options?.signal,
            validateStatus: (status) => status >= 200 && status < 300,
        });
        await assertVideoBlob(content.data);
        return content.data;
    } catch (error) {
        if (axios.isCancel(error) || options?.signal?.aborted) throw error;
        return null;
    }
}

async function videoResultFromUrl(url: string, extraHosts: readonly string[], options?: RequestOptions): Promise<VideoGenerationResult> {
    if (!isBrowserReachableMediaUrl(url, extraHosts)) return {};
    try {
        const response = await axios.get<Blob>(url, { responseType: "blob", timeout: 60_000, signal: options?.signal });
        await assertVideoBlob(response.data);
        return { blob: response.data };
    } catch (error) {
        if (axios.isCancel(error) || options?.signal?.aborted) throw error;
        return { url, mimeType: "video/mp4" };
    }
}

function assertVideoConfig(config: AiConfig, model: string) {
    if (!model) throw new Error(apiText("videoModelRequired"));
    if (!config.baseUrl.trim()) throw new Error(apiText("baseUrlRequired"));
    if (!config.apiKey.trim()) throw new Error(apiText("apiKeyRequired"));
    if (config.apiFormat === "gemini") throw new Error(apiText("geminiVideoUnsupported"));
}

function normalizeVideoSeconds(value: string, max = 20, min = 1) {
    const seconds = Math.floor(Number(value) || 6);
    return String(Math.max(min, Math.min(max, seconds)));
}

function normalizeVideoSize(value: string) {
    if (value === "auto") return null;
    const size = value || "1280x720";
    if (/^\d+x\d+$/.test(size)) return size;
    return ["9:16", "2:3", "3:4"].includes(size) ? "720x1280" : "1280x720";
}

function normalizeVideoResolution(value: string) {
    if (value === "low") return "480p";
    if (value === "auto" || value === "high" || value === "medium") return "720p";
    const resolution = value.replace(/p$/i, "") || "720";
    return `${resolution}p`;
}

function unwrapVideoResponse(payload: ApiVideoResponse) {
    return unwrapEnvelope(payload, apiText("noVideoTask"));
}

function unwrapEnvelope<T>(payload: ApiEnvelope<T>, emptyMessage: string): T {
    if (!payload) throw new Error(emptyMessage);
    if (typeof payload === "object" && "code" in payload && payload.code !== undefined) {
        if (payload.code !== 0 && payload.code !== "0") throw new Error(readApiErrorMessage(payload) || apiText("requestFailed"));
        if (!payload.data) throw new Error(emptyMessage);
        return payload.data;
    }
    return payload as T;
}

function videoResultUrl(payload: VideoResponse) {
    return [payload.video_url, payload.result_url, payload.url, payload.video?.url, payload.content?.video_url, payload.content?.url].find((url) => typeof url === "string" && (isPublicMediaUrl(url) || /\.mp4(\?|#|$)/i.test(url)));
}

function readApiErrorMessage(value: unknown): string {
    if (!value) return "";
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            const inner = readApiErrorMessage(parsed) || value;
            if (inner === value && typeof parsed === "object" && Object.keys(parsed).length === 0) return "";
            return inner;
        } catch {
            if (/<[a-z][\s\S]*>/i.test(value)) return apiText("htmlError", { preview: `${value.slice(0, 80)}...` });
            return value;
        }
    }
    if (typeof value !== "object") return "";
    const payload = value as { msg?: unknown; message?: unknown; error?: unknown; detail?: unknown };
    // error may be a string or an object containing a message.
    const errorMsg =
        typeof payload.error === "string"
            ? payload.error
            : (payload.error as { message?: unknown })?.message;
    return (
        readApiErrorMessage(payload.msg) ||
        readApiErrorMessage(payload.message) ||
        readApiErrorMessage(errorMsg) ||
        readApiErrorMessage(payload.detail) ||
        ""
    );
}

function readAxiosError(error: unknown, fallback: string) {
    if (axios.isCancel(error)) return apiText("requestCanceled");
    if (axios.isAxiosError<{ error?: { message?: string }; msg?: string; message?: string; code?: number | string }>(error)) {
        if (!error.response && error.code === "ERR_NETWORK") return apiText("corsRequired");
        const responseData = error.response?.data;
        return humanizeGenerationError(readApiErrorMessage(responseData) || statusMessage(error.response?.status, fallback), fallback);
    }
    if (error instanceof DOMException && error.name === "AbortError") return apiText("requestCanceled");
    return humanizeGenerationError(error instanceof Error ? readApiErrorMessage(error.message) || error.message : fallback, fallback);
}

function statusMessage(status: number | undefined, fallback: string) {
    if (status === 401 || status === 403) return apiText("authenticationFailed");
    if (status === 429) return apiText("rateLimited");
    return status ? `${fallback}（${status}）` : fallback;
}

async function assertVideoBlob(blob: Blob) {
    if (blob.size < 1024) throw new Error(apiText("videoDownloadFailed"));
    const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
    const prefix = new TextDecoder().decode(head).trimStart();
    if (prefix.startsWith("{") || prefix.startsWith("[") || prefix.startsWith("<")) {
        try {
            const payload = JSON.parse(await blob.text()) as { code?: number; msg?: string; error?: { message?: string } };
            if (typeof payload.code === "number" && payload.code !== 0) throw new Error(readApiErrorMessage(payload) || apiText("videoDownloadFailed"));
            if (payload.error?.message) throw new Error(readApiErrorMessage(payload.error.message) || payload.error.message);
        } catch (error) {
            if (error instanceof Error && error.message !== apiText("videoDownloadFailed")) throw error;
        }
        throw new Error(apiText("videoDownloadFailed"));
    }
    if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) throw new Error(apiText("videoDownloadFailed"));
    if (looksLikeVideoMagic(head)) return;
    const type = (blob.type || "").toLowerCase();
    if (type.startsWith("video/") || type.includes("mp4")) return;
    throw new Error(apiText("videoDownloadFailed"));
}

function looksLikeVideoMagic(head: Uint8Array) {
    const ftyp = head.length >= 8 && String.fromCharCode(head[4], head[5], head[6], head[7]) === "ftyp";
    const webm = head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
    return ftyp || webm;
}

function isPublicMediaUrl(value: string) {
    return /^https?:\/\//i.test(value || "");
}

function delay(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
        }
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener(
            "abort",
            () => {
                clearTimeout(timer);
                reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
        );
    });
}
