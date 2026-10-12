import i18n from "@/i18n";
import { isGptImage2Model } from "@/lib/model-capabilities";

const KEEP_KEYS = ["generation.errors.invalidApiKey", "generation.errors.insufficientBalance", "generation.errors.modelNotAllowed"] as const;
const PRODUCT_KEYS = [
    ...KEEP_KEYS,
    "generation.errors.serviceUnavailable",
    "generation.errors.gptFailedTryGrok",
    "generation.errors.contentModeration",
    "generation.errors.imageRequired",
    "generation.errors.generationFailedRetry",
] as const;

function err(key: string) {
    return i18n.t(`generation.errors.${key}`);
}

function isKnownProduct(text: string) {
    return PRODUCT_KEYS.some((key) => text === i18n.t(key));
}

/** 把上游码/英文收成一句人话。码表优先；GPT 图未命中码表时换「额度已退回」。 */
export function humanizeGenerationError(error: unknown, fallback: string, model?: string) {
    const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
    const text = raw.trim() || fallback;
    const lower = text.toLowerCase();

    if (KEEP_KEYS.some((key) => text === i18n.t(key))) return text;
    if (/invalid_api_key|invalid api key|密钥无效|登录状态已失效/i.test(text)) return err("invalidApiKey");
    if (/insufficient_balance|insufficient balance|余额不足/i.test(text)) return err("insufficientBalance");
    if (/model_not_allowed|当前不能使用该模型/i.test(text)) return err("modelNotAllowed");
    if (/请求已取消|request canceled|刷新后生成已中断/i.test(text)) return text;

    if (model && isGptImage2Model(model)) return err("gptFailedTryGrok");
    if (isKnownProduct(text)) return text;

    if (/moderation|respect_moderation|rejected by content|未通过审核/i.test(text)) return err("contentModeration");
    if (/image is required|缺少参考图/i.test(text)) return err("imageRequired");
    if (
        /auth_unavailable|oauth invalidated|gateway|timeout|cloudflare|base url|<!doctype|<html[\s>]|ledger_unavailable|请求失败（http|网关错误（|服务暂时不可用|服务返回了 html/i.test(lower) ||
        /\b524\b|\b502\b|\b503\b/.test(text)
    ) {
        return err("serviceUnavailable");
    }
    if (/HTTP|Error|Invalid request|auth_|generation_failed/i.test(text) || (!/[\u4e00-\u9fff]/.test(text) && /[A-Za-z]/.test(text))) {
        return err("generationFailedRetry");
    }
    return text;
}
