"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}

function Login() {
  const t = useTranslations("login");
  const router = useRouter();
  const linkError = useSearchParams().get("error") === "link";
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error" | "verifying" | "badCode">("idle");

  const redirectTo = () => `${window.location.origin}/auth/callback`;

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo() },
    });
    setState(error ? "error" : "sent");
  }

  // The email also contains a one-time code (length is set in Supabase, e.g. 6 or 8 digits). Typing it here works even when the link would
  // open in another browser (e.g. an installed home-screen app on iOS).
  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setState("verifying");
    const { error } = await createClient().auth.verifyOtp({ email, token: code.trim(), type: "email" });
    if (error) return setState("badCode");
    router.replace("/today");
  }

  async function google() {
    await createClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectTo() } });
  }

  const codeStep = state === "sent" || state === "verifying" || state === "badCode";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-6">
      <div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-192.png" alt="" className="mb-5 size-[72px] rounded-[16px]" />
        <h1 className="cond text-5xl leading-none">{t("title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>
      </div>

      {linkError && !codeStep && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{t("linkError")}</p>}

      {codeStep ? (
        <form onSubmit={verifyCode} className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{t("checkEmail", { email })}</p>
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="12345678"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
            className="num h-12 text-center text-2xl tracking-[0.4em]"
          />
          <Button type="submit" size="lg" className="h-11" disabled={code.trim().length < 6 || state === "verifying"}>
            {t("verify")}
          </Button>
          {state === "badCode" && <p className="text-sm text-destructive">{t("badCode")}</p>}
          <button type="button" onClick={() => setState("idle")} className="text-sm text-muted-foreground">
            {t("otherEmail")}
          </button>
        </form>
      ) : (
        <form onSubmit={sendLink} className="flex flex-col gap-3">
          <Input
            type="email"
            required
            autoComplete="email"
            placeholder={t("emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11"
          />
          <Button type="submit" size="lg" className="h-11" disabled={state === "sending"}>
            {t("sendLink")}
          </Button>
          {state === "error" && <p className="text-sm text-destructive">{t("error")}</p>}
        </form>
      )}

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        {t("or")}
        <div className="h-px flex-1 bg-border" />
      </div>
      <Button variant="outline" size="lg" className="h-11" onClick={google}>
        {t("google")}
      </Button>
    </main>
  );
}
