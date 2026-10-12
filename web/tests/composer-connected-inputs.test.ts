import { afterAll, expect, test } from "bun:test";

import type { CanvasConnection, CanvasNodeData } from "../src/types/canvas";

// i18n and the node registry read browser storage during module initialization.
const values = new Map<string, string>();
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
    },
});
afterAll(() => {
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
});

const { CanvasNodeType } = await import("../src/types/canvas");
const { registerBuiltinNodes } = await import("../src/components/canvas/nodes/builtin-nodes");
const { buildNodeGenerationContext } = await import("../src/components/canvas/canvas-node-generation");

registerBuiltinNodes();

const imageNode: CanvasNodeData = {
    id: "img-1",
    type: CanvasNodeType.Image,
    title: "Ref image",
    position: { x: 0, y: 0 },
    width: 320,
    height: 320,
    metadata: { content: "data:image/png;base64,AAAA", mimeType: "image/png" },
};

const textNode: CanvasNodeData = {
    id: "txt-1",
    type: CanvasNodeType.Text,
    title: "Brief",
    position: { x: 0, y: 400 },
    width: 320,
    height: 160,
    metadata: { content: "upstream brief text" },
};

const configNode: CanvasNodeData = {
    id: "cfg-1",
    type: CanvasNodeType.Config,
    title: "Config",
    position: { x: 0, y: 800 },
    width: 320,
    height: 240,
    metadata: { generationMode: "image", composerContent: "make it pop", prompt: "make it pop" },
};

const nodes = [imageNode, textNode, configNode];
const connections: CanvasConnection[] = [
    { id: "c1", fromNodeId: "img-1", toNodeId: "cfg-1" },
    { id: "c2", fromNodeId: "txt-1", toNodeId: "cfg-1" },
];

test("composer node without @ still pulls connected references and text", () => {
    const context = buildNodeGenerationContext("cfg-1", nodes, connections, "make it pop");
    expect(context.referenceImages).toHaveLength(1);
    expect(context.prompt).toContain("upstream brief text");
    expect(context.textCount).toBe(1);
});

test("composer node with @ only sends the mentioned inputs", () => {
    const context = buildNodeGenerationContext("cfg-1", nodes, connections, "make it pop @[node:img-1]");
    expect(context.referenceImages).toHaveLength(1);
    expect(context.textCount).toBe(0);
    expect(context.prompt).not.toContain("upstream brief text");
});
