/** Per-model generation parameter matrix. UI and request paths read this only. */

export type ImageSizeTier = "base" | "2k" | "4k";

export type ModelCapabilities = {
    quality: boolean;
    transparentBackground: boolean;
    maxCount: number;
    imageSizeTiers: ImageSizeTier[];
    sizeFallback: Record<string, string>;
    videoResolutions: string[];
    videoResolutionCustom: boolean;
    videoSeconds: number[];
    videoSecondsMax: number;
    videoGenerateAudio: boolean;
    videoCustomPixels: boolean;
    grokVideoApi: boolean;
};

const GROK_IMAGE_SIZE_FALLBACK: Record<string, string> = {
    "16:9-4k": "2048x1152",
    "9:16-4k": "1152x2048",
    "3840x2160": "2048x1152",
    "2160x3840": "1152x2048",
};

const GPT_IMAGE_SIZE_FALLBACK: Record<string, string> = {
    "1:1-2k": "1:1",
    "16:9-2k": "16:9",
    "9:16-2k": "9:16",
    "16:9-4k": "16:9",
    "9:16-4k": "9:16",
    "2048x2048": "1:1",
    "2048x1152": "16:9",
    "1152x2048": "9:16",
    "3840x2160": "16:9",
    "2160x3840": "9:16",
};

export const GROK_VIDEO_ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3"] as const;

const OPEN: ModelCapabilities = {
    quality: true,
    transparentBackground: true,
    maxCount: 15,
    imageSizeTiers: ["base", "2k", "4k"],
    sizeFallback: {},
    videoResolutions: ["720", "480"],
    videoResolutionCustom: true,
    videoSeconds: [6, 10, 12, 16, 20],
    videoSecondsMax: 20,
    videoGenerateAudio: false,
    videoCustomPixels: true,
    grokVideoApi: false,
};

const GPT_IMAGE_2: ModelCapabilities = {
    quality: true,
    transparentBackground: true,
    maxCount: 15,
    imageSizeTiers: ["base"],
    sizeFallback: GPT_IMAGE_SIZE_FALLBACK,
    videoResolutions: [],
    videoResolutionCustom: false,
    videoSeconds: [],
    videoSecondsMax: 20,
    videoGenerateAudio: false,
    videoCustomPixels: false,
    grokVideoApi: false,
};

const GROK_IMAGE: ModelCapabilities = {
    quality: false,
    transparentBackground: false,
    maxCount: 10,
    imageSizeTiers: ["base", "2k"],
    sizeFallback: GROK_IMAGE_SIZE_FALLBACK,
    videoResolutions: [],
    videoResolutionCustom: false,
    videoSeconds: [],
    videoSecondsMax: 20,
    videoGenerateAudio: false,
    videoCustomPixels: false,
    grokVideoApi: false,
};

const GROK_VIDEO: ModelCapabilities = {
    quality: false,
    transparentBackground: false,
    maxCount: 15,
    imageSizeTiers: [],
    sizeFallback: {},
    videoResolutions: ["480", "720", "1080"],
    videoResolutionCustom: false,
    videoSeconds: [6, 10, 15],
    videoSecondsMax: 15,
    videoGenerateAudio: true,
    videoCustomPixels: false,
    grokVideoApi: true,
};

const BY_NAME: Record<string, ModelCapabilities> = {
    "gpt-image-2": GPT_IMAGE_2,
    "grok-imagine-image": GROK_IMAGE,
    "grok-imagine-image-quality": GROK_IMAGE,
    "grok-imagine-edit": GROK_IMAGE,
    "grok-imagine-video-1.5": GROK_VIDEO,
};

export function capabilityModelName(value: string) {
    const index = value.indexOf("::");
    return (index < 0 ? value : value.slice(index + 2)).trim();
}

export function modelCapabilities(model: string): ModelCapabilities {
    const name = capabilityModelName(model);
    if (BY_NAME[name]) return BY_NAME[name];
    if (name.toLowerCase().includes("grok-imagine-video")) return GROK_VIDEO;
    return OPEN;
}

export function isGrokImagineImageModel(value: string) {
    const name = capabilityModelName(value);
    return name === "grok-imagine-image" || name === "grok-imagine-image-quality" || name === "grok-imagine-edit";
}

export function isGrokImagineVideoModel(value: string) {
    return modelCapabilities(value).grokVideoApi;
}

export function isGptImage2Model(value: string) {
    return capabilityModelName(value) === "gpt-image-2";
}

export function fallbackImageSizeForModel(model: string, size: string) {
    return modelCapabilities(model).sizeFallback[size] || size;
}

export function fallbackGrokImageSize(size: string) {
    return GROK_IMAGE_SIZE_FALLBACK[size] || size;
}

export function fallbackGptImageSize(size: string) {
    return GPT_IMAGE_SIZE_FALLBACK[size] || size;
}

export function clampImageCount(model: string, count: number, panelMax = 15) {
    const max = Math.min(panelMax, modelCapabilities(model).maxCount);
    return Math.max(1, Math.min(max, Math.floor(Math.abs(count) || 1)));
}

export function filterImageAspects<T extends { value: string }>(model: string, options: T[]) {
    const tiers = new Set(modelCapabilities(model).imageSizeTiers);
    return options.filter((item) => {
        if (item.value.endsWith("-4k")) return tiers.has("4k");
        if (item.value.endsWith("-2k")) return tiers.has("2k");
        return true;
    });
}

export function grokVideoAspectRatio(size: string) {
    const allowed = GROK_VIDEO_ASPECT_RATIOS.find((ratio) => ratio === size);
    if (allowed) return allowed;
    const match = (size || "").match(/^(\d+)x(\d+)$/);
    if (!match) return "16:9";
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!width || !height) return "16:9";
    const current = width / height;
    return GROK_VIDEO_ASPECT_RATIOS.reduce((best, ratio) => {
        const [w, h] = ratio.split(":").map(Number);
        const value = w / h;
        const bestParts = best.split(":").map(Number);
        const bestValue = bestParts[0] / bestParts[1];
        return Math.abs(value - current) < Math.abs(bestValue - current) ? ratio : best;
    });
}
