import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin, type ProxyOptions } from "vite";

import { YANLU_CN_API_BASE_URL, YANLU_IMG_API_BASE_URL, YANLU_PORTAL_URL } from "./src/lib/yanlu-endpoints";
import { parseChangelog } from "./src/lib/release";

const webDir = dirname(fileURLToPath(import.meta.url));
const localVersion = readFileSync(resolve(webDir, "../VERSION"), "utf8").trim() || "dev";
const localChangelog = readFileSync(resolve(webDir, "../CHANGELOG.md"), "utf8");

// Expose /plugins/index.json with local plugin files from public/plugins.
// The frontend can discover and list them when enabled; development reads the directory live, while builds emit a static registry.
function localPluginsManifest(): Plugin {
    const pluginsDir = resolve(webDir, "public/plugins");
    const listLocalPlugins = () => {
        try {
            return readdirSync(pluginsDir)
                .filter((file) => file.endsWith(".js"))
                .sort()
                .map((file) => `/plugins/${file}`);
        } catch {
            return [];
        }
    };
    return {
        name: "local-plugins-manifest",
        configureServer(server) {
            server.middlewares.use("/plugins/index.json", (_req, res) => {
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify(listLocalPlugins()));
            });
        },
        generateBundle() {
            this.emitFile({ type: "asset", fileName: "plugins/index.json", source: JSON.stringify(listLocalPlugins()) });
        },
    };
}

const browserUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function yanluProxy(target: string, prefix: string): ProxyOptions {
    return {
        target,
        changeOrigin: true,
        rewrite: (path: string) => path.replace(new RegExp(`^${prefix}`), ""),
        configure(proxy) {
            proxy.on("proxyReq", (proxyReq) => {
                proxyReq.setHeader("User-Agent", browserUserAgent);
                proxyReq.setHeader("Accept", "application/json");
            });
        },
    };
}

const yanluDevProxy = {
    "/__rigel-ai/cpa": yanluProxy("https://admin.flyli.cn", "/__rigel-ai/cpa"),
    "/__rigel-ai/chat": yanluProxy(YANLU_CN_API_BASE_URL, "/__rigel-ai/chat"),
    "/__rigel-ai/auth": yanluProxy(`${YANLU_PORTAL_URL}/api/v1`, "/__rigel-ai/auth"),
    "/__rigel-ai/image": yanluProxy(YANLU_IMG_API_BASE_URL, "/__rigel-ai/image"),
};

export default defineConfig({
    base: process.env.VITE_BASE || "/",
    plugins: [react(), localPluginsManifest()],
    resolve: {
        alias: {
            "@": resolve(webDir, "src"),
        },
    },
    define: {
        __APP_VERSION__: JSON.stringify(localVersion),
        __APP_RELEASES__: JSON.stringify(parseChangelog(localChangelog)),
    },
    server: {
        host: "127.0.0.1",
        port: 3000,
        proxy: yanluDevProxy,
    },
    preview: {
        host: "127.0.0.1",
        port: 3000,
        proxy: yanluDevProxy,
    },
});
