import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { AppTopNav } from "@/components/layout/app-top-nav";

export default function UserLayout({ children }: { children: ReactNode }) {
    const { t } = useTranslation();
    return (
        <div className="flex h-dvh overflow-hidden bg-background text-foreground">
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                <AppTopNav />
                <p className="shrink-0 border-b border-stone-200 bg-stone-50 px-6 py-1.5 text-center text-xs leading-5 text-stone-500 dark:border-stone-800 dark:bg-stone-900/50 dark:text-stone-400">
                    {t("common.localDataNotice")}
                </p>
                <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
            </div>
        </div>
    );
}
