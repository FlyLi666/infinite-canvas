/** Per-model generation parameter matrix. UI and request paths read this only. */

export type ImageSizeTier = "base" | "2k" | "4k";

export type ModelCapabilities = {
    quality: boolean;
    qualityValues: string[];
    transparentBackground: boolean;
    maxCount: number;
    imageSizeTiers: ImageSizeTier[];
    sizeFallback: Record<string, string>;
    videoResolutions: string[];
    videoResolutionCustom: boolean;
    videoSeconds: number[];
    videoSecondsMin: number;
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

const GPT_QUALITY = ["auto", "high", "medium", "low"];
const GPT_IMAGE_25_QUALITY = ["1k", "2k", "4k"];
const GROK_IMAGE_2_QUALITY = ["low", "medium"];

export type GptImage25Tier = "1k" | "2k" | "4k";
export type GptImage25Pipeline = "upscale" | "native";

const GPT_IMAGE_25_LONG_EDGE: Record<GptImage25Tier, number> = { "1k": 1024, "2k": 2048, "4k": 3840 };
/** 按画质档位标价；超分/原生同价，避免旧 pipeline 状态显示旧价。 */
const GPT_IMAGE_25_PRICE: Record<GptImage25Tier, Record<GptImage25Pipeline, number>> = {
    "1k": { native: 4, upscale: 4 },
    "2k": { upscale: 6, native: 6 },
    "4k": { upscale: 8, native: 8 },
};
const GPT_IMAGE_25_ASPECTS = ["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16"] as const;

const OPEN: ModelCapabilities = {
    quality: true,
    qualityValues: GPT_QUALITY,
    transparentBackground: true,
    maxCount: 15,
    imageSizeTiers: ["base", "2k", "4k"],
    sizeFallback: {},
    videoResolutions: ["720", "480"],
    videoResolutionCustom: true,
    videoSeconds: [6, 10, 12, 16, 20],
    videoSecondsMin: 1,
    videoSecondsMax: 20,
    videoGenerateAudio: false,
    videoCustomPixels: true,
    grokVideoApi: false,
};

const GPT_IMAGE_2: ModelCapabilities = {
    quality: true,
    qualityValues: GPT_QUALITY,
    transparentBackground: true,
    maxCount: 15,
    imageSizeTiers: ["base"],
    sizeFallback: GPT_IMAGE_SIZE_FALLBACK,
    videoResolutions: [],
    videoResolutionCustom: false,
    videoSeconds: [],
    videoSecondsMin: 1,
    videoSecondsMax: 20,
    videoGenerateAudio: false,
    videoCustomPixels: false,
    grokVideoApi: false,
};

/** GPT Image 2.5：画质三档决定长边，宽高比只留基础比例（不要 (2k)/(4k) 后缀按钮）。 */
const GPT_IMAGE_25: ModelCapabilities = {
    quality: true,
    qualityValues: GPT_IMAGE_25_QUALITY,
    transparentBackground: true,
    maxCount: 15,
    imageSizeTiers: ["base"],
    sizeFallback: GPT_IMAGE_SIZE_FALLBACK,
    videoResolutions: [],
    videoResolutionCustom: false,
    videoSeconds: [],
    videoSecondsMin: 1,
    videoSecondsMax: 20,
    videoGenerateAudio: false,
    videoCustomPixels: false,
    grokVideoApi: false,
};

const GROK_IMAGE: ModelCapabilities = {
    quality: false,
    qualityValues: [],
    transparentBackground: false,
    maxCount: 10,
    imageSizeTiers: ["base", "2k"],
    sizeFallback: GROK_IMAGE_SIZE_FALLBACK,
    videoResolutions: [],
    videoResolutionCustom: false,
    videoSeconds: [],
    videoSecondsMin: 1,
    videoSecondsMax: 20,
    videoGenerateAudio: false,
    videoCustomPixels: false,
    grokVideoApi: false,
};

const GROK_IMAGE_2: ModelCapabilities = {
    quality: true,
    qualityValues: GROK_IMAGE_2_QUALITY,
    transparentBackground: false,
    maxCount: 10,
    imageSizeTiers: ["base", "2k"],
    sizeFallback: GROK_IMAGE_SIZE_FALLBACK,
    videoResolutions: [],
    videoResolutionCustom: false,
    videoSeconds: [],
    videoSecondsMin: 1,
    videoSecondsMax: 20,
    videoGenerateAudio: false,
    videoCustomPixels: false,
    grokVideoApi: false,
};

const GROK_VIDEO: ModelCapabilities = {
    quality: false,
    qualityValues: [],
    transparentBackground: false,
    maxCount: 15,
    imageSizeTiers: [],
    sizeFallback: {},
    videoResolutions: ["480", "720", "1080"],
    videoResolutionCustom: false,
    videoSeconds: [6, 10, 15],
    videoSecondsMin: 1,
    videoSecondsMax: 15,
    videoGenerateAudio: true,
    videoCustomPixels: false,
    grokVideoApi: true,
};

const SEEDANCE_20: ModelCapabilities = {
    quality: false,
    qualityValues: [],
    transparentBackground: false,
    maxCount: 1,
    imageSizeTiers: [],
    sizeFallback: {},
    videoResolutions: ["480", "720", "1080"],
    videoResolutionCustom: false,
    videoSeconds: [5, 10, 15],
    videoSecondsMin: 4,
    videoSecondsMax: 15,
    videoGenerateAudio: true,
    videoCustomPixels: false,
    grokVideoApi: true,
};

const SEEDANCE_25: ModelCapabilities = {
    ...SEEDANCE_20,
    videoSeconds: [5, 10, 15, 30],
    videoSecondsMax: 30,
};

const BY_NAME: Record<string, ModelCapabilities> = {
    "gpt-image-2": GPT_IMAGE_2,
    "gpt-image-2.5-flare": GPT_IMAGE_25,
    "gpt-image-2.5-sunburst": GPT_IMAGE_25,
    "grok-imagine-image": GROK_IMAGE,
    "grok-imagine-image-quality": GROK_IMAGE,
    "grok-imagine-image-2.0": GROK_IMAGE_2,
    "grok-imagine-edit": GROK_IMAGE,
    "grok-imagine-video-1.5": GROK_VIDEO,
    "seedance-2.0": SEEDANCE_20,
    "seedance-2.5": SEEDANCE_25,
};

export function capabilityModelName(value: string) {
    const index = value.indexOf("::");
    return (index < 0 ? value : value.slice(index + 2)).trim();
}

export function modelCapabilities(model: string): ModelCapabilities {
    const name = capabilityModelName(model);
    if (BY_NAME[name]) return BY_NAME[name];
    if (name.toLowerCase().includes("grok-imagine-video")) return GROK_VIDEO;
    if (name.toLowerCase().startsWith("seedance-2.5")) return SEEDANCE_25;
    if (name.toLowerCase().startsWith("seedance-")) return SEEDANCE_20;
    return OPEN;
}

export function isGrokImagineImageModel(value: string) {
    const name = capabilityModelName(value);
    return name === "grok-imagine-image" || name === "grok-imagine-image-quality" || name === "grok-imagine-image-2.0" || name === "grok-imagine-edit";
}

export function supportsImageEdit(model: string) {
    const name = capabilityModelName(model);
    return name === "gpt-image-2" || isGptImage25Model(model) || name === "grok-imagine-image-2.0" || name === "grok-imagine-edit";
}

export function preferredImageEditModel(model: string) {
    const name = capabilityModelName(model);
    if (name === "gpt-image-2" || isGptImage25Model(model) || name === "grok-imagine-image-2.0") return model;
    if (!isGrokImagineImageModel(model)) return model;
    const separator = model.indexOf("::");
    return separator >= 0 ? `${model.slice(0, separator + 2)}grok-imagine-image-2.0` : "grok-imagine-image-2.0";
}

export function preferredListedModel(model: string, options: string[]) {
    if (!options.length) return model;
    if (options.includes(model)) return model;
    const mapped = preferredImageEditModel(model);
    if (options.includes(mapped)) return mapped;
    return options[0];
}

export function fallbackImageQualityForModel(model: string, quality: string) {
    if (isGptImage25Model(model)) {
        const parsed = parseGptImage25Quality(quality);
        return formatGptImage25Quality(parsed.tier, "native");
    }
    const values = modelCapabilities(model).qualityValues;
    if (!values.length) return "";
    const current = (quality || "").trim().toLowerCase();
    if (values.includes(current)) return current;
    if (values.includes("medium")) return "medium";
    return values[0];
}

export function isGrokImagineVideoModel(value: string) {
    return modelCapabilities(value).grokVideoApi;
}

export function isGptImage25Model(value: string) {
    const name = capabilityModelName(value);
    return name === "gpt-image-2.5-flare" || name === "gpt-image-2.5-sunburst";
}

/** 含旧 gpt-image-2 与两档 2.5；失败兜底文案共用。 */
export function isGptImage2Model(value: string) {
    const name = capabilityModelName(value);
    return name === "gpt-image-2" || isGptImage25Model(value) || name.startsWith("gpt-image-");
}

export function parseGptImage25Quality(quality: string): { tier: GptImage25Tier; pipeline: GptImage25Pipeline } {
    const raw = (quality || "").trim().toLowerCase();
    const [tierPart, pipelinePart] = raw.split("+");
    const tier: GptImage25Tier = tierPart === "2k" || tierPart === "4k" || tierPart === "1k" ? tierPart : tierPart === "high" ? "4k" : tierPart === "medium" ? "2k" : "1k";
    const pipeline: GptImage25Pipeline = pipelinePart === "native" ? "native" : "upscale";
    return { tier, pipeline };
}

export function formatGptImage25Quality(tier: GptImage25Tier, pipeline: GptImage25Pipeline) {
    return `${tier}+${pipeline}`;
}

/** 前端不再暴露超分/原生；请求固定 native，后端按档位扣 4/6/8。 */
export function gptImage25RequestPipeline(_tier?: GptImage25Tier, _pipeline?: GptImage25Pipeline): GptImage25Pipeline {
    return "native";
}

export function gptImage25Price(tier: GptImage25Tier, pipeline: GptImage25Pipeline = "native") {
    return GPT_IMAGE_25_PRICE[tier][pipeline];
}

export function gptImage25AspectFromSize(size: string) {
    const value = (size || "").trim();
    if (GPT_IMAGE_25_ASPECTS.includes(value as (typeof GPT_IMAGE_25_ASPECTS)[number])) return value;
    const tagged = value.match(/^(\d+:\d+)(?:-2k|-4k)?$/i);
    if (tagged && GPT_IMAGE_25_ASPECTS.includes(tagged[1] as (typeof GPT_IMAGE_25_ASPECTS)[number])) return tagged[1];
    const pixels = value.match(/^(\d+)x(\d+)$/i);
    if (!pixels) return "1:1";
    const width = Number(pixels[1]);
    const height = Number(pixels[2]);
    if (!width || !height) return "1:1";
    const current = width / height;
    return GPT_IMAGE_25_ASPECTS.reduce((best, ratio) => {
        const [w, h] = ratio.split(":").map(Number);
        const [bw, bh] = best.split(":").map(Number);
        return Math.abs(w / h - current) < Math.abs(bw / bh - current) ? ratio : best;
    });
}

/** 长边由画质档决定，短边按比例向上取 16 倍数；保证最长边落在后端 1K/2K/4K 分档。 */
export function gptImage25PixelSize(tier: GptImage25Tier, size: string) {
    const aspect = gptImage25AspectFromSize(size);
    const [ratioW, ratioH] = aspect.split(":").map(Number);
    const longSide = GPT_IMAGE_25_LONG_EDGE[tier];
    const landscape = ratioW >= ratioH;
    const longRatio = landscape ? ratioW / ratioH : ratioH / ratioW;
    const shortSide = Math.ceil(longSide / longRatio / 16) * 16;
    const width = landscape ? longSide : shortSide;
    const height = landscape ? shortSide : longSide;
    return `${width}x${height}`;
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

/** I2V: omit aspect_ratio so xAI keeps the source image ratio. Sending it stretches. T2V still sends the user ratio. */
export function grokVideoRequestAspectRatio(size: string, hasReferenceImage: boolean) {
    return hasReferenceImage ? undefined : grokVideoAspectRatio(size);
}

const GROK_IMAGE_2K_PIXELS = new Set(["2048x2048", "2048x1152", "1152x2048"]);

/** xAI/CPA only honor aspect_ratio + resolution. Do not send pixel `size`. */
export function grokImageGeometry(size: string): { aspect_ratio: string; resolution: "1k" | "2k" } | undefined {
    const value = (size || "").trim();
    if (!value || value.toLowerCase() === "auto") return undefined;
    const lowered = value.toLowerCase();
    if (lowered === "2k" || lowered.endsWith("-2k")) {
        return { aspect_ratio: grokVideoAspectRatio(value.replace(/-2k$/i, "") || "1:1"), resolution: "2k" };
    }
    if (lowered === "1k" || lowered.endsWith("-1k")) {
        return { aspect_ratio: grokVideoAspectRatio(value.replace(/-1k$/i, "") || "1:1"), resolution: "1k" };
    }
    const pixels = value.match(/^(\d+)x(\d+)$/i);
    if (pixels) {
        const width = Number(pixels[1]);
        const height = Number(pixels[2]);
        const key = `${width}x${height}`;
        const resolution = GROK_IMAGE_2K_PIXELS.has(key) || Math.max(width, height) >= 2048 ? "2k" : "1k";
        return { aspect_ratio: grokVideoAspectRatio(key), resolution };
    }
    if (value.includes(":")) return { aspect_ratio: grokVideoAspectRatio(value), resolution: "1k" };
    return undefined;
}
