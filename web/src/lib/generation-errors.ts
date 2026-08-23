import i18n from "@/i18n";

/** 把上游常见错误码/英文信息收成画布可用的一句人话。对不上则原样返回。 */
export function humanizeGenerationError(error: unknown, fallback: string) {
    const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
    const text = raw.trim() || fallback;
    const upper = text.toUpperCase();
    if (upper.includes("INVALID_API_KEY") || upper.includes("INVALID API KEY")) return i18n.t("generation.errors.invalidApiKey");
    if (upper.includes("INSUFFICIENT_BALANCE")) return i18n.t("generation.errors.insufficientBalance");
    if (upper.includes("MODEL_NOT_ALLOWED")) return i18n.t("generation.errors.modelNotAllowed");
    if (upper.includes("LEDGER_UNAVAILABLE") || /\b503\b/.test(text)) return i18n.t("generation.errors.serviceUnavailable");
    return text;
}
