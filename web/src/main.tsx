import React from "react";
import { createRoot } from "react-dom/client";
import "antd/dist/reset.css";
import "streamdown/styles.css";
import "./styles/globals.css";
import { RouterProvider } from "react-router-dom";

import { AppProviders } from "@/components/layout/app-providers";
import "@/i18n";
import { initAnalytics } from "@/lib/analytics";
import { router } from "@/router";
import { applyLocalChannelOverride, useConfigStore } from "@/stores/use-config-store";
import { useAuthStore } from "@/stores/use-auth-store";

initAnalytics();

const hydrateLocalChannel = () => {
    // 先应用本地渠道覆盖，再恢复登录态并重新断言研路AI托管渠道，保证托管渠道不被覆盖掉。
    void applyLocalChannelOverride().finally(() => {
        void useAuthStore.getState().bootstrap();
    });
};
useConfigStore.persist.onFinishHydration(hydrateLocalChannel);
if (useConfigStore.persist.hasHydrated()) hydrateLocalChannel();

document.body.style.fontFamily = '"SF Pro Display","SF Pro Text","PingFang SC","Microsoft YaHei","Helvetica Neue",sans-serif';

createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <AppProviders>
            <RouterProvider router={router} />
        </AppProviders>
    </React.StrictMode>,
);
