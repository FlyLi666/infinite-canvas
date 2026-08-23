// 研路AI 端点解析：开发 / 预览（本机）走 Vite 同源代理，生产构建直连线上域名。
// UI 文案只允许出现「研路AI」，这些域名仅用于网络层和外链 href。

export const YANLU_PORTAL_URL = "https://sub.flyli.cn";
export const YANLU_IMG_API_BASE_URL = "https://img-api.flyli.cn";
/**
 * 亚洲近节点：Grok / 文本等 OpenAI 兼容生成。登录、充值、密钥仍走中转站。
 * 切入口只改这里，不要把生成打回门户常量。
 * 不要改成 CPA 的 api.flyli.cn：那把钥匙对不上研路密钥，也不会扣中转站余额。
 */
export const YANLU_CN_API_BASE_URL = "https://gen-api.flyli.cn";
/** 托管渠道里 Grok / 文本的生成入口，等于亚洲近节点。gpt-image 仍走出图接口。 */
export const YANLU_CHAT_API_BASE_URL = YANLU_CN_API_BASE_URL;

const SUB2API_DIRECT_BASE_URL = `${YANLU_PORTAL_URL}/api/v1`;
const SUB2API_PROXY_BASE_URL = "/__rigel-ai/auth";

/** dev server 与 vite preview 都绑定本机地址并带同源代理；线上域名没有这些代理路径。 */
export function isYanluSameOriginProxyHost() {
    if (import.meta.env.DEV) return true;
    if (typeof window === "undefined") return false;
    return ["127.0.0.1", "localhost", "[::1]"].includes(window.location.hostname);
}

export function sub2apiBaseUrl() {
    return isYanluSameOriginProxyHost() ? SUB2API_PROXY_BASE_URL : SUB2API_DIRECT_BASE_URL;
}

/** 判断渠道 baseUrl 是否指向研路AI 异步生图服务（该服务同一 Key 只允许一个进行中任务）。 */
export function isYanluImageApiBaseUrl(baseUrl: string) {
    try {
        return new URL(baseUrl.trim(), YANLU_IMG_API_BASE_URL).hostname === "img-api.flyli.cn";
    } catch {
        return false;
    }
}
