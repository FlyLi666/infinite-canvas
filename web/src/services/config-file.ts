import { saveAs } from "file-saver";

import i18n from "@/i18n";
import { modelOptionsFromChannels, retainPublicChannels, useConfigStore, YANLU_CHANNEL_ID, type AiConfig, type ModelChannel, type WebdavSyncConfig } from "@/stores/use-config-store";
import { usePromptSourceStore, type PromptSourceSchedule } from "@/stores/use-prompt-source-store";
import type { PromptSource } from "@/services/api/prompt-source-presets";

type AppConfigFile = {
    app: "infinite-canvas";
    version: 1;
    exportedAt: string;
    config: AiConfig;
    webdav: WebdavSyncConfig;
    promptSources: {
        sources: PromptSource[];
        schedule: PromptSourceSchedule;
    };
};

export function exportAppConfig() {
    const { config, webdav } = useConfigStore.getState();
    const { sources, schedule } = usePromptSourceStore.getState();
    const data: AppConfigFile = {
        app: "infinite-canvas",
        version: 1,
        exportedAt: new Date().toISOString(),
        config: stripExportedSecrets(config),
        webdav,
        promptSources: { sources, schedule },
    };
    saveAs(new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" }), "infinite-canvas-config.json");
}

export async function importAppConfig(file: File) {
    let data: AppConfigFile;
    try {
        data = JSON.parse(await file.text()) as AppConfigFile;
    } catch {
        throw new Error(i18n.t("config.invalidFile"));
    }
    if (data.app !== "infinite-canvas" || data.version !== 1 || !data.config || !data.webdav || !data.promptSources) throw new Error(i18n.t("config.invalidFile"));
    const current = useConfigStore.getState();
    const channels = retainPublicChannels(current.config.channels);
    useConfigStore.setState({
        config: {
            ...data.config,
            channels,
            models: modelOptionsFromChannels(channels),
            apiKey: managed?.apiKey || "",
            baseUrl: managed?.baseUrl || current.config.baseUrl,
        },
        webdav: data.webdav,
    });
    usePromptSourceStore.setState(data.promptSources);
}

function stripExportedSecrets(config: AiConfig): AiConfig {
    return {
        ...config,
        apiKey: "",
        channels: retainPublicChannels(config.channels).map(stripChannelSecrets),
    };
}

function stripChannelSecrets(channel: ModelChannel): ModelChannel {
    if (channel.id !== YANLU_CHANNEL_ID) return { ...channel, apiKey: "" };
    return { ...channel, apiKey: "", textApiKey: undefined };
}
