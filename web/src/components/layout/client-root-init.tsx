import type { ReactNode } from "react";
import { useEffect } from "react";

import { usePromptSourceScheduler } from "@/hooks/use-prompt-source-scheduler";

const INJECTED_CONFIG_KEYS = ["baseUrl", "baseurl", "apiKey", "apikey"] as const;

export function ClientRootInit({ children }: { children: ReactNode }) {
    usePromptSourceScheduler();

    useEffect(() => {
        const searchParams = new URLSearchParams(window.location.search);
        if (!INJECTED_CONFIG_KEYS.some((key) => searchParams.has(key))) return;
        INJECTED_CONFIG_KEYS.forEach((key) => searchParams.delete(key));
        window.history.replaceState(null, "", `${window.location.pathname}${searchParams.size ? `?${searchParams}` : ""}${window.location.hash}`);
    }, []);

    return <>{children}</>;
}
