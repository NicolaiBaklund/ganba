"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const t = useTranslations("login");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

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

  async function google() {
    await createClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectTo() } });
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-6">
      <div>
        <h1 className="text-4xl font-bold tracking-tight">{t("title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>
      </div>

      {state === "sent" ? (
        <p className="rounded-lg bg-muted p-4 text-sm">{t("checkEmail", { email })}</p>
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
