import { useEffect, useRef, useState } from "react";
import { Alert, App, Button, Form, Input, Modal } from "antd";
import { useTranslation } from "react-i18next";

import { YANLU_PORTAL_URL } from "@/lib/yanlu-endpoints";
import { useAuthStore } from "@/stores/use-auth-store";
import { useThemeStore } from "@/stores/use-theme-store";

declare global {
    interface Window {
        turnstile?: {
            render: (element: HTMLElement, options: Record<string, unknown>) => string;
            reset: (id?: string) => void;
            remove: (id: string) => void;
        };
    }
}

const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let turnstileScriptPromise: Promise<void> | null = null;

function loadTurnstileScript() {
    if (window.turnstile) return Promise.resolve();
    if (!turnstileScriptPromise) {
        turnstileScriptPromise = new Promise<void>((resolve, reject) => {
            const script = document.createElement("script");
            script.src = TURNSTILE_SRC;
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => {
                turnstileScriptPromise = null;
                script.remove();
                reject(new Error("turnstile script load failed"));
            };
            document.head.appendChild(script);
        });
    }
    return turnstileScriptPromise;
}

type TurnstileSettings = { enabled: boolean; siteKey: string };
type TotpStep = { tempToken: string; maskedEmail: string };
type LoginFormValues = { email: string; password: string };

export function LoginModal() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const open = useAuthStore((state) => state.loginOpen);
    const closeLogin = useAuthStore((state) => state.closeLogin);
    const login = useAuthStore((state) => state.login);
    const complete2fa = useAuthStore((state) => state.complete2fa);
    const probePublicSettings = useAuthStore((state) => state.probePublicSettings);
    const theme = useThemeStore((state) => state.theme);
    const [form] = Form.useForm<LoginFormValues>();
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [turnstile, setTurnstile] = useState<TurnstileSettings>({ enabled: false, siteKey: "" });
    const [turnstileToken, setTurnstileToken] = useState("");
    const [totpStep, setTotpStep] = useState<TotpStep | null>(null);
    const [totpCode, setTotpCode] = useState("");
    const turnstileContainerRef = useRef<HTMLDivElement>(null);
    const turnstileWidgetIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setError("");
        setTotpStep(null);
        setTotpCode("");
        setTurnstileToken("");
        setSubmitting(false);
        void probePublicSettings()
            .then((settings) => setTurnstile({ enabled: settings.turnstileEnabled && Boolean(settings.turnstileSiteKey), siteKey: settings.turnstileSiteKey }))
            .catch(() => setTurnstile({ enabled: false, siteKey: "" }));
    }, [open, probePublicSettings]);

    useEffect(() => {
        if (!open || !turnstile.enabled || !turnstile.siteKey || totpStep) return;
        let disposed = false;
        void loadTurnstileScript()
            .then(() => {
                if (disposed || !turnstileContainerRef.current || !window.turnstile) return;
                turnstileContainerRef.current.innerHTML = "";
                turnstileWidgetIdRef.current = window.turnstile.render(turnstileContainerRef.current, {
                    sitekey: turnstile.siteKey,
                    theme: theme === "dark" ? "dark" : "light",
                    callback: (token: string) => setTurnstileToken(token),
                    "expired-callback": () => setTurnstileToken(""),
                    "error-callback": () => setTurnstileToken(""),
                });
            })
            .catch(() => setError(t("auth.turnstileLoadFailed")));
        return () => {
            disposed = true;
            const widgetId = turnstileWidgetIdRef.current;
            turnstileWidgetIdRef.current = null;
            if (widgetId && window.turnstile) {
                try {
                    window.turnstile.remove(widgetId);
                } catch {
                    // 组件已被 Turnstile 自己清理时忽略。
                }
            }
        };
    }, [open, turnstile, totpStep, theme, t]);

    const resetTurnstile = () => {
        setTurnstileToken("");
        if (turnstileWidgetIdRef.current && window.turnstile) {
            try {
                window.turnstile.reset(turnstileWidgetIdRef.current);
            } catch {
                // 忽略重置失败，用户可关闭后重开登录框。
            }
        }
    };

    const finishLogin = () => {
        message.success(t("auth.loginSuccess"));
        closeLogin();
    };

    const submitCredentials = async (values: LoginFormValues) => {
        if (turnstile.enabled && !turnstileToken) {
            setError(t("auth.turnstileRequired"));
            return;
        }
        setSubmitting(true);
        setError("");
        try {
            const result = await login(values.email, values.password, turnstile.enabled ? turnstileToken : undefined);
            if (result.requires2fa) {
                setTotpStep({ tempToken: result.tempToken, maskedEmail: result.maskedEmail });
                return;
            }
            finishLogin();
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : t("auth.errors.requestFailed"));
            resetTurnstile();
        } finally {
            setSubmitting(false);
        }
    };

    const submitTotp = async () => {
        if (!totpStep) return;
        if (totpCode.trim().length !== 6) {
            setError(t("auth.totpRequired"));
            return;
        }
        setSubmitting(true);
        setError("");
        try {
            await complete2fa(totpStep.tempToken, totpCode.trim());
            finishLogin();
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : t("auth.errors.requestFailed"));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal open={open} onCancel={closeLogin} footer={null} width={420} centered destroyOnHidden>
            <div className="px-1 pb-1 pt-2">
                <div className="text-lg font-semibold">{t("auth.title")}</div>
                <div className="mt-1 text-xs text-stone-500">{t("auth.subtitle")}</div>
                {error ? <Alert className="mt-4" type="error" showIcon message={error} /> : null}
                {!totpStep ? (
                    <Form form={form} layout="vertical" requiredMark={false} className="mt-4" onFinish={(values) => void submitCredentials(values)}>
                        <Form.Item
                            name="email"
                            label={t("auth.email")}
                            rules={[
                                { required: true, message: t("auth.emailRequired") },
                                { type: "email", message: t("auth.emailInvalid") },
                            ]}
                        >
                            <Input autoComplete="email" placeholder="name@example.com" />
                        </Form.Item>
                        <Form.Item name="password" label={t("auth.password")} rules={[{ required: true, message: t("auth.passwordRequired") }]}>
                            <Input.Password autoComplete="current-password" />
                        </Form.Item>
                        {turnstile.enabled ? <div ref={turnstileContainerRef} className="mb-4 flex min-h-[66px] justify-center" /> : null}
                        <Button type="primary" htmlType="submit" block loading={submitting}>
                            {t("auth.submit")}
                        </Button>
                    </Form>
                ) : (
                    <div className="mt-4">
                        <div className="text-sm text-stone-600 dark:text-stone-300">{t("auth.totpHint", { email: totpStep.maskedEmail })}</div>
                        <div className="mt-4 flex justify-center">
                            <Input.OTP length={6} value={totpCode} onChange={setTotpCode} autoFocus />
                        </div>
                        <Button type="primary" block className="mt-5" loading={submitting} onClick={() => void submitTotp()}>
                            {t("auth.totpSubmit")}
                        </Button>
                        <Button type="text" block className="mt-2" disabled={submitting} onClick={() => (setTotpStep(null), setTotpCode(""), setError(""))}>
                            {t("auth.back")}
                        </Button>
                    </div>
                )}
                <div className="mt-5 flex items-center justify-between text-xs">
                    <a href={`${YANLU_PORTAL_URL}/register`} target="_blank" rel="noopener noreferrer" className="text-stone-500 transition hover:text-stone-900 dark:hover:text-stone-100">
                        {t("auth.register")}
                    </a>
                    <a href={`${YANLU_PORTAL_URL}/login`} target="_blank" rel="noopener noreferrer" className="text-stone-500 transition hover:text-stone-900 dark:hover:text-stone-100">
                        {t("auth.forgotPassword")}
                    </a>
                </div>
            </div>
        </Modal>
    );
}
