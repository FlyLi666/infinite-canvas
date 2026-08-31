/**
 * 生成 GROK 2.0 三参考图预连线 export v3 ZIP。
 * 契约：app infinite-canvas / version 3 / 资源→配置边 / 组装提示词无 @。
 * 画布验收用导入，不要在浏览器里手连线。
 *
 * 来源：本仓 canvas-export.ts；tldraw snapshot 灌图不手连
 * https://tldraw.dev/examples/snapshots
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, "fixtures");
const PROJECT_ID = "e2e-grok-3ref";
const TITLE = "GROK 2.0 三图改图验收";
const PROMPT = "把三张色块参考图合成一张简洁几何静物，白底，不要文字。";

function crc32(buf) {
    let c = ~0;
    for (let i = 0; i < buf.length; i += 1) {
        c ^= buf[i];
        for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
}

function pngChunk(type, data) {
    const name = Buffer.from(type);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([name, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgbAt) {
    const raw = Buffer.alloc((width * 3 + 1) * height);
    for (let y = 0; y < height; y += 1) {
        const row = y * (width * 3 + 1);
        raw[row] = 0;
        for (let x = 0; x < width; x += 1) {
            const [r, g, b] = rgbAt(x, y);
            const i = row + 1 + x * 3;
            raw[i] = r;
            raw[i + 1] = g;
            raw[i + 2] = b;
        }
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        pngChunk("IHDR", ihdr),
        pngChunk("IDAT", zlib.deflateSync(raw)),
        pngChunk("IEND", Buffer.alloc(0)),
    ]);
}

function paintA(x, y) {
    if (Math.abs(x - y) < 3) return [255, 255, 255];
    return [210, 36, 36];
}

function paintB(x, y) {
    if (Math.abs(x - 16) < 2 || Math.abs(y - 16) < 2) return [20, 20, 20];
    return [36, 176, 64];
}

function paintC(x, y) {
    const corner = (x < 8 && y < 8) || (x > 23 && y > 23) || (x < 8 && y > 23) || (x > 23 && y < 8);
    if (corner && ((x + y) & 1)) return [255, 214, 32];
    return [36, 80, 210];
}

function imageNode(id, title, storageKey, png, x, y) {
    return {
        id,
        type: "image",
        title,
        position: { x, y },
        width: 220,
        height: 160,
        metadata: {
            content: `data:image/png;base64,${png.toString("base64")}`,
            storageKey,
            status: "idle",
            mimeType: "image/png",
            bytes: png.length,
            naturalWidth: 32,
            naturalHeight: 32,
        },
    };
}

export function buildGrok3RefZip() {
    const refs = [
        { id: "image-ref-a", title: "参考红斜线", storageKey: "image:ref-a", png: encodePng(32, 32, paintA), x: 48, y: 48 },
        { id: "image-ref-b", title: "参考绿十字", storageKey: "image:ref-b", png: encodePng(32, 32, paintB), x: 48, y: 240 },
        { id: "image-ref-c", title: "参考蓝角标", storageKey: "image:ref-c", png: encodePng(32, 32, paintC), x: 48, y: 432 },
    ];
    const now = new Date().toISOString();
    const project = {
        id: PROJECT_ID,
        title: TITLE,
        createdAt: now,
        updatedAt: now,
        nodes: [
            ...refs.map((ref) => imageNode(ref.id, ref.title, ref.storageKey, ref.png, ref.x, ref.y)),
            {
                id: "config-grok-3ref",
                type: "config",
                title: "生成配置",
                position: { x: 360, y: 200 },
                width: 340,
                height: 240,
                metadata: {
                    status: "idle",
                    generationMode: "image",
                    model: "yanlu::grok-imagine-image-2.0",
                    composerContent: PROMPT,
                    size: "1:1",
                    quality: "low",
                    count: 1,
                },
            },
        ],
        connections: refs.map((ref, index) => ({
            id: `edge-ref-${String.fromCharCode(97 + index)}`,
            fromNodeId: ref.id,
            toNodeId: "config-grok-3ref",
        })),
        chatSessions: [],
        activeChatId: null,
        backgroundMode: "lines",
        showImageInfo: false,
        viewport: { x: 24, y: 16, k: 1 },
    };
    const files = refs.map((ref) => {
        const fileName = `${ref.storageKey.replace(/[\\/:*?"<>|]/g, "_")}.png`;
        const zipPath = `projects/${PROJECT_ID}/files/${fileName}`;
        return { storageKey: ref.storageKey, path: zipPath, mimeType: "image/png", bytes: ref.png.length, png: ref.png };
    });
    const manifest = {
        app: "infinite-canvas",
        version: 3,
        exportedAt: now,
        projects: [{ project, files: files.map(({ png, ...meta }) => meta) }],
    };
    const zipBytes = zipSync({
        "projects.json": Buffer.from(JSON.stringify(manifest, null, 2)),
        ...Object.fromEntries(files.map((file) => [file.path, file.png])),
    }, { level: 0 });
    return { zipBytes: Buffer.from(zipBytes), refs, project, title: TITLE, prompt: PROMPT };
}

export function writeGrok3RefFixture() {
    fs.mkdirSync(outDir, { recursive: true });
    const built = buildGrok3RefZip();
    const zipPath = path.join(outDir, "grok-imagine-2-3ref.zip");
    fs.writeFileSync(zipPath, built.zipBytes);
    built.refs.forEach((ref) => {
        fs.writeFileSync(path.join(outDir, `${ref.storageKey.replace("image:", "")}.png`), ref.png);
    });
    return { zipPath, title: built.title, prompt: built.prompt, bytes: built.zipBytes.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const written = writeGrok3RefFixture();
    console.log(JSON.stringify({ zip: written.zipPath, bytes: written.bytes, title: written.title }, null, 2));
}
