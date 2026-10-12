import { expect, test } from "bun:test";

import { gptImage25PixelSize } from "../src/lib/model-capabilities";

const longEdge = (size: string) => {
    const [width, height] = size.split("x").map(Number);
    return Math.max(width, height);
};

test("1K + a pixel size derives the ratio and clamps the long edge to 1024", () => {
    const size = gptImage25PixelSize("1k", "3840x2160");
    expect(longEdge(size)).toBe(1024);
    expect(size).toBe("1024x576");
});

test("4K + a 1:1 ratio uses the tier long edge on the square", () => {
    expect(gptImage25PixelSize("4k", "1:1")).toBe("3840x3840");
});

test("1K + an unsupported ratio falls back to the 1:1 tier size", () => {
    const size = gptImage25PixelSize("1k", "21:9");
    expect(size).toBe("1024x1024");
    expect(longEdge(size)).toBe(1024);
});

test("every tier keeps its long edge regardless of the ratio", () => {
    for (const [tier, edge] of [["1k", 1024], ["2k", 2048], ["4k", 3840]] as const) {
        for (const ratio of ["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16"]) {
            expect(longEdge(gptImage25PixelSize(tier, ratio))).toBe(edge);
        }
    }
});
