import { saveAs } from "file-saver";

import { getMediaBlob } from "@/services/file-storage";
import { getImageBlob } from "@/services/image-storage";

export type DownloadSource = { url?: string; storageKey?: string };

/** 本地字节用 FileSaver；http(s) 回链绝不能交给 saveAs——它会对跨域地址发同步 HEAD，整页卡死。 */
export async function downloadLocalOrOpenRemote(source: DownloadSource, filename: string) {
    const key = source.storageKey || "";
    const blob = key.startsWith("image:") ? await getImageBlob(key) : key ? await getMediaBlob(key) : null;
    if (blob) {
        saveAs(blob, filename);
        return "saved" as const;
    }
    const url = source.url || "";
    if (url.startsWith("blob:") || url.startsWith("data:")) {
        saveAs(await (await fetch(url)).blob(), filename);
        return "saved" as const;
    }
    if (/^https?:/i.test(url)) {
        window.open(url, "_blank", "noopener,noreferrer");
        return "opened" as const;
    }
    throw new Error("download-unavailable");
}
