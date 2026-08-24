import localforage from "localforage";

import { nanoid } from "nanoid";
import i18n from "@/i18n";
import { readImageMeta } from "@/lib/image-utils";
import { isBrowserReachableMediaUrl } from "@/lib/reachable-media";

export type UploadedImage = {
    url: string;
    storageKey: string;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
};

const store = localforage.createInstance({ name: "infinite-canvas", storeName: "image_files" });
const imageLogStore = localforage.createInstance({ name: "infinite-canvas", storeName: "image_generation_logs" });
const videoLogStore = localforage.createInstance({ name: "infinite-canvas", storeName: "video_generation_logs" });
const objectUrls = new Map<string, string>();

export async function uploadImage(input: string | Blob): Promise<UploadedImage> {
    if (typeof input === "string") {
        if (/^https?:/i.test(input) && !isBrowserReachableMediaUrl(input)) {
            throw new Error(i18n.t("apiErrors.mediaUnreachable"));
        }
        try {
            return persistImageBlob(await (await fetch(input)).blob());
        } catch (error) {
            if (!/^https?:/i.test(input)) throw error;
            const meta = await readImageMeta(input).catch(() => ({ width: 0, height: 0, mimeType: "image/png" }));
            // 境内可打开的回链拉不下来就不要造空 storageKey：没有 blob 的钥匙会让后续 hydrate 以为图在本地。
            return { url: input, storageKey: "", width: meta.width || 0, height: meta.height || 0, bytes: 0, mimeType: meta.mimeType || "image/png" };
        }
    }
    return persistImageBlob(input);
}

async function persistImageBlob(blob: Blob): Promise<UploadedImage> {
    const storageKey = `image:${nanoid()}`;
    await store.setItem(storageKey, blob);
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    const meta = await readImageMeta(url);
    return { url, storageKey, width: meta.width, height: meta.height, bytes: blob.size, mimeType: blob.type || meta.mimeType };
}

export async function resolveImageUrl(storageKey?: string, fallback = "") {
    if (!storageKey) return fallback;
    const cached = objectUrls.get(storageKey);
    if (cached) return cached;
    const blob = await store.getItem<Blob>(storageKey);
    if (!blob) return fallback;
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return url;
}

export async function getImageBlob(storageKey: string) {
    return store.getItem<Blob>(storageKey);
}

export async function setImageBlob(storageKey: string, blob: Blob) {
    await store.setItem(storageKey, blob);
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return url;
}

const REMOTE_IMAGE_FETCH_MS = 12_000;

export async function imageToDataUrl(image: { url?: string; dataUrl?: string; storageKey?: string }) {
    // 本地 blob 优先：改成 url 回包后 content 常是 https，不能再抢在 storageKey 前面去跨域 fetch。
    const localUrl = await resolveImageUrl(image.storageKey);
    if (localUrl) return blobToDataUrl(await (await fetch(localUrl)).blob());
    const url = image.dataUrl || image.url || "";
    if (!url || url.startsWith("data:")) return url;
    if (/^https?:/i.test(url)) return url;
    return blobToDataUrl(await (await fetch(url)).blob());
}

export async function fetchRemoteImageAsDataUrl(url: string, signal?: AbortSignal) {
    const blob = await fetchBlobWithTimeout(url, signal);
    if (!blob.type.startsWith("image/") && blob.type !== "application/octet-stream") {
        throw new Error(i18n.t("common.imageReadFailed"));
    }
    return blobToDataUrl(blob);
}

async function fetchBlobWithTimeout(url: string, signal?: AbortSignal) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), REMOTE_IMAGE_FETCH_MS);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(i18n.t("common.imageReadFailed"));
        return await response.blob();
    } catch {
        throw new Error(i18n.t("common.imageReadFailed"));
    } finally {
        window.clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
    }
}

export async function deleteStoredImages(keys: Iterable<string>) {
    await Promise.all(
        Array.from(new Set(keys)).map(async (key) => {
            const url = objectUrls.get(key);
            if (url) URL.revokeObjectURL(url);
            objectUrls.delete(key);
            await store.removeItem(key);
        }),
    );
}

export async function cleanupUnusedImages(usedData: unknown) {
    const usedKeys = collectImageStorageKeys(usedData);
    await Promise.all([
        imageLogStore.iterate((value) => {
            collectImageStorageKeys(value, usedKeys);
        }),
        videoLogStore.iterate((value) => {
            collectImageStorageKeys(value, usedKeys);
        }),
    ]);
    const unused: string[] = [];
    await store.iterate((_value, key) => {
        if (!usedKeys.has(key)) unused.push(key);
    });
    await deleteStoredImages(unused);
}

export function collectImageStorageKeys(value: unknown, keys = new Set<string>()) {
    if (!value || typeof value !== "object") return keys;
    if ("storageKey" in value && typeof value.storageKey === "string" && value.storageKey.startsWith("image:")) keys.add(value.storageKey);
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectImageStorageKeys(child, keys)) : collectImageStorageKeys(item, keys)));
    return keys;
}

function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error(i18n.t("common.imageReadFailed")));
        reader.readAsDataURL(blob);
    });
}
