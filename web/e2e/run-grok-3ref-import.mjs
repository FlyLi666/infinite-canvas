/**
 * 导入预连线 ZIP → 点「开始生成」→ 读 Network。
 * 禁止 createNode / 连线 / 拖拽。
 *
 * 来源：Playwright 对隐藏 input 直接 setInputFiles
 * https://playwright.dev/docs/input#upload-files
 * https://web-automations.com/advanced-interactions-test-assertions/file-uploads-downloads/uploading-files-to-hidden-input-elements/
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeGrok3RefFixture } from "./build-grok-3ref-zip.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("/Users/lishupeng/.npm/_npx/31e32ef8478fbf80/node_modules/playwright");

const here = path.dirname(fileURLToPath(import.meta.url));
const SECRET = `${process.env.HOME}/.secrets/yanlu-e2e-imgapi-20260817.txt`;
const CHROME = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1187/chrome-mac/Chromium.app/Contents/MacOS/Chromium`;
const BASE = "http://127.0.0.1:3000";
const WAIT_MS = 240000;
const OUT = path.join(here, "artifacts");

function parseKv(file) {
    const data = {};
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
        if (!line.includes("=") || line.trim().startsWith("#")) continue;
        const i = line.indexOf("=");
        data[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    return data;
}

function urlKind(url) {
    if (!url) return null;
    const s = String(url);
    if (s.startsWith("data:")) return "data_uri";
    if (s.startsWith("blob:")) return "blob";
    if (/x\.ai/i.test(s)) return "xai_cdn";
    if (/^https?:/i.test(s)) return "http_url";
    return "other";
}

function sanitizeImageField(value) {
    if (!value) return null;
    if (Array.isArray(value)) {
        return {
            kind: "array",
            length: value.length,
            items: value.map((item) => {
                if (item && typeof item === "object") {
                    return { keys: Object.keys(item), type: item.type ?? null, url_kind: urlKind(item.url), url_len: item.url ? String(item.url).length : 0 };
                }
                return { kind: typeof item };
            }),
        };
    }
    if (typeof value === "object") {
        return { kind: "object", keys: Object.keys(value), type: value.type ?? null, url_kind: urlKind(value.url), url_len: value.url ? String(value.url).length : 0 };
    }
    return { kind: typeof value };
}

function sanitizeBody(raw) {
    let body = raw;
    if (typeof raw !== "string") {
        try {
            body = raw.toString();
        } catch {
            return { parse: "unreadable" };
        }
    }
    try {
        const o = JSON.parse(body);
        const prompt = String(o.prompt || "");
        return {
            keys: Object.keys(o),
            model: o.model ?? null,
            n: o.n ?? null,
            response_format: o.response_format ?? null,
            has_image: Object.prototype.hasOwnProperty.call(o, "image"),
            has_images: Object.prototype.hasOwnProperty.call(o, "images"),
            image: Object.prototype.hasOwnProperty.call(o, "image") ? sanitizeImageField(o.image) : null,
            images: Object.prototype.hasOwnProperty.call(o, "images") ? sanitizeImageField(o.images) : null,
            has_aspect_ratio: Object.prototype.hasOwnProperty.call(o, "aspect_ratio"),
            aspect_ratio: o.aspect_ratio ?? null,
            has_resolution: Object.prototype.hasOwnProperty.call(o, "resolution"),
            resolution: o.resolution ?? null,
            has_size: Object.prototype.hasOwnProperty.call(o, "size"),
            size: o.size ?? null,
            prompt_len: prompt.length,
            prompt_has_IMAGE_0: prompt.includes("<IMAGE_0>"),
            prompt_has_IMAGE_1: prompt.includes("<IMAGE_1>"),
            prompt_has_IMAGE_2: prompt.includes("<IMAGE_2>"),
            prompt_preview: prompt.replace(/data:image\/[a-zA-Z0-9+/=,;.-]+/g, "data:image/…").slice(0, 180),
        };
    } catch {
        return { parse: "fail", len: String(body).length };
    }
}

async function loginViaProxy() {
    const cred = parseKv(SECRET);
    const res = await fetch(`${BASE}/__rigel-ai/auth/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email: cred.email, password: cred.password }),
    });
    const data = await res.json();
    if (data?.code !== 0 || !data?.data?.access_token) {
        return {
            ok: false,
            fallbackKey: Boolean(cred.sk),
            user: { id: cred.user_id || null, username: cred.username || null },
            accessToken: "e2e-local-access",
            refreshToken: "",
            expiresAt: Date.now() + 86400 * 1000,
            apiKey: cred.sk,
        };
    }
    const inner = data.data;
    return {
        ok: true,
        fallbackKey: true,
        accessToken: inner.access_token,
        refreshToken: inner.refresh_token,
        expiresAt: Date.now() + (Number(inner.expires_in) || 86400) * 1000,
        apiKey: cred.sk,
        user: inner.user
            ? {
                  id: String(inner.user.id ?? ""),
                  email: String(inner.user.email || ""),
                  username: String(inner.user.username || ""),
                  balance: Number(inner.user.balance ?? 0) || 0,
              }
            : { id: cred.user_id || null, username: cred.username || null },
    };
}

function configSeed(apiKey) {
    return {
        channelMode: "remote",
        baseUrl: "https://gen-api.flyli.cn",
        apiKey: "",
        apiFormat: "openai",
        channels: [
            {
                id: "yanlu",
                name: "研路AI",
                baseUrl: "https://img-api.flyli.cn",
                apiKey,
                apiFormat: "openai",
                models: [
                    { name: "gpt-image-2", capability: "image" },
                    { name: "grok-imagine-image-2.0", capability: "image" },
                    { name: "grok-imagine-video-1.5", capability: "video" },
                    { name: "seedance-2.0", capability: "video" },
                    { name: "seedance-2.5", capability: "video" },
                    { name: "grok-4.6", capability: "text" },
                    { name: "gpt-5.6-sol", capability: "text" },
                ],
            },
        ],
        model: "yanlu::grok-imagine-image-2.0",
        imageModel: "yanlu::grok-imagine-image-2.0",
        videoModel: "yanlu::grok-imagine-video-1.5",
        textModel: "yanlu::gpt-5.6-sol",
        models: ["yanlu::grok-imagine-image-2.0", "yanlu::gpt-image-2"],
        quality: "low",
        size: "1:1",
        count: "1",
        canvasImageCount: "1",
        reasoningEffort: "auto",
        systemPrompt: "",
        background: "",
        videoSeconds: "6",
        vquality: "720",
        videoGenerateAudio: "true",
        videoWatermark: "false",
    };
}

async function inspectPage(page) {
    return page.evaluate(() => {
        const nodes = [...document.querySelectorAll("[data-node-id]")].map((el) => {
            const imgs = [...el.querySelectorAll("img")].map((img) => ({
                w: img.naturalWidth,
                h: img.naturalHeight,
                kind: img.src.startsWith("blob:") ? "blob" : img.src.startsWith("data:") ? "data_uri" : /x\.ai/i.test(img.src) ? "xai_cdn" : img.src ? "http" : "empty",
            }));
            return {
                id: el.getAttribute("data-node-id"),
                text: (el.innerText || "").replace(/\s+/g, " ").slice(0, 140),
                imgs,
            };
        });
        const body = document.body.innerText || "";
        const resultNode = nodes.find((n) => n.id !== "config-grok-3ref" && n.id && !n.id.startsWith("image-ref-") && (n.imgs.some((i) => i.w >= 64) || /生成中|生成失败|全部图片/.test(n.text)));
        const bigLocal = nodes.flatMap((n) => n.imgs).filter((i) => i.w >= 64 && i.h >= 64 && (i.kind === "blob" || i.kind === "data_uri"));
        return {
            nodeIds: nodes.map((n) => n.id),
            connections: document.querySelectorAll("[data-connection-id]").length,
            resultId: resultNode?.id || null,
            resultText: resultNode?.text || null,
            resultImgs: resultNode?.imgs || [],
            pixels: bigLocal.length > 0,
            pixelSize: bigLocal[0] ? `${bigLocal[0].w}x${bigLocal[0].h}` : null,
            generating: /生成中/.test(body),
            imageRequired: /image is required/i.test(body),
            errorSnippet: (body.match(/Invalid request:[^\n]{0,120}|image is required[^\n]{0,60}|生成失败[^\n]{0,120}|全部图片生成失败[^\n]{0,80}/) || [null])[0],
        };
    });
}

fs.mkdirSync(OUT, { recursive: true });
const fixture = writeGrok3RefFixture();
const report = {
    verdict: "FAIL",
    zip: fixture.zipPath,
    title: fixture.title,
    login: null,
    import: null,
    post: null,
    result: null,
    errors: [],
};

const auth = await loginViaProxy();
report.login = { ok: auth.ok, userId: auth.user?.id || null, username: auth.user?.username || null, hasToken: Boolean(auth.accessToken) };

const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME,
    args: ["--disable-dev-shm-usage"],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const posts = [];
const reqMap = new WeakMap();

page.on("request", (req) => {
    if (req.method() !== "POST" || !/\/images\/(edits|generations)\b/.test(req.url())) return;
    let u;
    try {
        u = new URL(req.url());
    } catch {
        return;
    }
    const row = { method: "POST", path: `${u.host}${u.pathname}`, body: sanitizeBody(req.postData() || ""), status: null, errorText: null };
    posts.push(row);
    reqMap.set(req, row);
});

page.on("response", async (res) => {
    const req = res.request();
    if (req.method() !== "POST" || !/\/images\/(edits|generations)\b/.test(req.url())) return;
    const target = reqMap.get(req);
    if (!target) return;
    target.status = res.status();
    if (res.status() >= 400) {
        try {
            target.errorText = (await res.text()).replace(/data:image\/[^"']+/g, "data:image/…").slice(0, 400);
        } catch {
            target.errorText = `http_${res.status()}`;
        }
    }
});

try {
    await context.addInitScript(
        ({ authState, config }) => {
            localStorage.setItem("rigel-ai:auth", JSON.stringify({ state: authState, version: 0 }));
            localStorage.setItem("infinite-canvas:ai_config_store", JSON.stringify({ state: { config }, version: 0 }));
        },
        {
            authState: {
                accessToken: auth.accessToken,
                refreshToken: auth.refreshToken,
                expiresAt: auth.expiresAt,
                user: auth.user,
            },
            config: configSeed(auth.apiKey),
        },
    );

    await page.goto(`${BASE}/canvas`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.locator('button:has-text("导入画布"):not([disabled])').waitFor({ timeout: 20000 });
    await page.locator('input[type="file"][accept*="zip"]').setInputFiles(fixture.zipPath);
    await page.getByText("已导入 1 个画布", { exact: false }).waitFor({ timeout: 15000 });
    await page.getByRole("heading", { name: fixture.title }).click();
    await page.waitForURL(/\/canvas\/[^/]+/, { timeout: 15000 });
    await page.locator('[data-node-id="config-grok-3ref"]').waitFor({ timeout: 15000 });
    const afterImport = await inspectPage(page);
    report.import = {
        nodeIds: afterImport.nodeIds,
        connections: afterImport.connections,
        hasConfig: afterImport.nodeIds.includes("config-grok-3ref"),
        hasRefs: ["image-ref-a", "image-ref-b", "image-ref-c"].every((id) => afterImport.nodeIds.includes(id)),
    };
    if (!report.import.hasConfig || !report.import.hasRefs || report.import.connections < 3) {
        report.errors.push(`import_incomplete nodes=${afterImport.nodeIds.join(",")} edges=${afterImport.connections}`);
    }

    const generateBtn = page.locator('[data-node-id="config-grok-3ref"]').getByRole("button", { name: "开始生成" });
    await generateBtn.click();
    await page.waitForTimeout(1200);
    if (await page.getByRole("dialog").count()) {
        const dialogText = await page.getByRole("dialog").innerText().catch(() => "");
        if (/登录/.test(dialogText)) throw new Error("generate opened login");
    }

    const deadline = Date.now() + WAIT_MS;
    while (Date.now() < deadline) {
        const inspect = await inspectPage(page);
        report.result = inspect;
        report.post = posts.find((p) => /edits/.test(p.path)) || posts[0] || null;
        if (inspect.imageRequired) {
            report.errors.push("image_is_required");
            break;
        }
        if (inspect.pixels && !inspect.generating && report.post?.status) break;
        if (inspect.errorSnippet && report.post?.status) break;
        await page.waitForTimeout(2000);
    }

    const post = report.post;
    const body = post?.body || {};
    const payloadOk =
        post &&
        /edits/.test(post.path) &&
        body.has_images === true &&
        body.images?.kind === "array" &&
        body.images?.length === 3 &&
        body.has_image === false &&
        body.has_aspect_ratio === true &&
        body.has_resolution === true &&
        body.has_size === false &&
        body.prompt_has_IMAGE_0 === true;
    const resultOk = Boolean(report.result?.pixels) && !report.result?.imageRequired;
    const httpOk = post && post.status >= 200 && post.status < 300;
    report.verdict = payloadOk && resultOk && httpOk && !report.errors.length ? "PASS" : "FAIL";
    if (!payloadOk) report.errors.push("payload_shape");
    if (!resultOk) report.errors.push("no_local_pixels");
    if (!httpOk) report.errors.push(`http_${post?.status ?? "none"}`);
    await page.screenshot({ path: path.join(OUT, "grok-3ref-final.png") }).catch(() => undefined);
} catch (error) {
    report.errors.push(String(error && error.message ? error.message : error));
    await page.screenshot({ path: path.join(OUT, "grok-3ref-fatal.png") }).catch(() => undefined);
} finally {
    const safe = {
        ...report,
        login: report.login,
    };
    fs.writeFileSync(path.join(OUT, "grok-3ref-report.json"), JSON.stringify(safe, null, 2));
    console.log(JSON.stringify(safe, null, 2));
    await browser.close();
}
