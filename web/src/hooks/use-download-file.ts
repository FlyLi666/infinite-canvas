import { App } from "antd";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { downloadLocalOrOpenRemote, type DownloadSource } from "@/lib/download-file";

export function useDownloadFile() {
    const { message } = App.useApp();
    const { t } = useTranslation();

    return useCallback(
        async (source: DownloadSource, filename: string) => {
            try {
                const result = await downloadLocalOrOpenRemote(source, filename);
                if (result === "opened") message.info(t("common.downloadRemoteOpened"));
            } catch {
                message.error(t("common.downloadFailed"));
            }
        },
        [message, t],
    );
}
