import { useEffect } from "react";
import type { CSSProperties } from "react";
import { App, Dropdown } from "antd";
import { CircleUserRound, LogIn, LogOut, Wallet } from "lucide-react";
import { useTranslation } from "react-i18next";

import { YANLU_PORTAL_URL } from "@/lib/yanlu-endpoints";
import { useAuthStore } from "@/stores/use-auth-store";

const CHIP_CLASS =
    "inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs text-stone-600 transition-colors hover:bg-black/5 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-white/10 dark:hover:text-white";

function formatBalance(balance: number | undefined) {
    return `$${(Number(balance) || 0).toFixed(2)}`;
}

export function UserChip({ style }: { style?: CSSProperties }) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const authed = useAuthStore((state) => Boolean(state.accessToken));
    const user = useAuthStore((state) => state.user);
    const openLogin = useAuthStore((state) => state.openLogin);
    const logout = useAuthStore((state) => state.logout);
    const fetchProfile = useAuthStore((state) => state.fetchProfile);

    // 余额在别处充值 / 结算后会变化，窗口重新聚焦时静默刷新。
    useEffect(() => {
        if (!authed) return;
        const refresh = () => void fetchProfile();
        window.addEventListener("focus", refresh);
        return () => window.removeEventListener("focus", refresh);
    }, [authed, fetchProfile]);

    if (!authed) {
        return (
            <button type="button" className={CHIP_CLASS} style={style} onClick={openLogin} aria-label={t("auth.login")}>
                <LogIn className="size-4" />
                <span>{t("auth.login")}</span>
            </button>
        );
    }

    const displayName = user?.username || user?.email || t("auth.account");
    return (
        <Dropdown
            trigger={["click"]}
            menu={{
                items: [
                    { key: "recharge", icon: <Wallet className="size-3.5" />, label: t("auth.recharge") },
                    { type: "divider" },
                    { key: "logout", icon: <LogOut className="size-3.5" />, label: t("auth.logout") },
                ],
                onClick: ({ key }) => {
                    if (key === "recharge") window.open(YANLU_PORTAL_URL, "_blank", "noopener,noreferrer");
                    if (key === "logout") {
                        logout();
                        message.success(t("auth.loggedOut"));
                    }
                },
            }}
        >
            <button type="button" className={CHIP_CLASS} style={style} aria-label={displayName}>
                <CircleUserRound className="size-4" />
                <span className="max-w-[120px] truncate">{displayName}</span>
                <span className="font-semibold tabular-nums">{formatBalance(user?.balance)}</span>
            </button>
        </Dropdown>
    );
}
