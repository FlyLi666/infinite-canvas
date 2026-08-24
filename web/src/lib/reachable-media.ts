/** 境内浏览器打得开的成片地址。境外 CDN（如 x.ai）不算成功。 */
const REACHABLE_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "flyli.cn"]);
const REACHABLE_HOST_SUFFIXES = [".flyli.cn"];

export function mediaHostsFromBaseUrl(baseUrl?: string): string[] {
    const value = (baseUrl || "").trim();
    if (!value) return [];
    try {
        const host = new URL(value, "https://gen-api.flyli.cn").hostname.toLowerCase();
        return host ? [host] : [];
    } catch {
        return [];
    }
}

export function isBrowserReachableMediaUrl(url: string, extraHosts: readonly string[] = []): boolean {
    const value = (url || "").trim();
    if (!value) return false;
    if (value.startsWith("data:") || value.startsWith("blob:")) return true;
    try {
        const parsed = new URL(value);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
        const host = parsed.hostname.toLowerCase();
        if (REACHABLE_HOSTS.has(host)) return true;
        if (REACHABLE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
        return extraHosts.some((item) => item.toLowerCase() === host);
    } catch {
        return false;
    }
}
