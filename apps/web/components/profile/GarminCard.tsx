"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { RefreshCw, Watch } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface GarminCardStatus {
  status: "active" | "reauth_required";
  lastSyncedAt: string | null;
}

const field = "h-12 rounded-md border border-border bg-card px-4 outline-none focus:border-primary";
const KNOWN_ERRORS = ["auth", "mfa_invalid", "mfa_expired", "rate_limited", "unavailable", "unsupported_session"];

export function GarminCard({ status }: { status: GarminCardStatus | null }) {
  const t = useTranslations("garmin");
  const format = useFormatter();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [stateId, setStateId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const fail = (error?: string) => toast.error(t(`errors.${KNOWN_ERRORS.includes(error ?? "") ? error : "generic"}`));

  async function send(url: string, payload: unknown) {
    setBusy(true);
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }).catch(() => null);
    setBusy(false);
    const body = await res?.json().catch(() => ({}));
    return { ok: !!res?.ok, body: body ?? {} };
  }

  function done() {
    setEmail("");
    toast.success(t("importing"));
    router.refresh();
  }

  async function connect() {
    const { ok, body } = await send("/api/garmin/connect", { email, password });
    setPassword("");
    if (!ok) return fail(body.error);
    if (body.mfa) return setStateId(body.stateId);
    done();
  }

  async function verify() {
    const { ok, body } = await send("/api/garmin/connect/mfa", { stateId, code });
    setCode("");
    setStateId(null);
    if (!ok) return fail(body.error);
    done();
  }

  async function syncNow() {
    const { body } = await send("/api/garmin/sync", { force: true });
    if (body.status === "ok" || body.status === "fresh") toast.success(t("synced"));
    else if (body.status === "busy") toast(t("syncing"));
    else fail(body.error ?? body.status);
    router.refresh();
  }

  async function disconnect() {
    setBusy(true);
    await fetch("/api/garmin/connect", { method: "DELETE" }).catch(() => null);
    setBusy(false);
    toast.success(t("disconnected"));
    router.refresh();
  }

  const connected = status?.status === "active";

  return (
    <section id="garmin" className="scroll-mt-4 rounded-md bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Watch className="size-4 text-primary" />
        <h2 className="cond text-lg leading-none">{t("title")}</h2>
        {connected && <span className="ml-auto text-xs font-semibold text-success">{t("connected")}</span>}
      </div>

      {connected ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-muted-foreground">
            {status.lastSyncedAt ? t("lastSync", { time: format.relativeTime(new Date(status.lastSyncedAt), new Date()) }) : t("never")}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={syncNow} disabled={busy}>
              <RefreshCw className={cn(busy && "animate-spin")} />
              {t("syncNow")}
            </Button>
            <Button variant="destructive" size="sm" onClick={disconnect} disabled={busy}>
              {t("disconnect")}
            </Button>
          </div>
        </div>
      ) : stateId ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{t("mfa")}</p>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
            placeholder={t("mfaCode")}
            className={cn("num tracking-widest", field)}
          />
          <Button className="h-11" disabled={code.length < 4 || busy} onClick={verify}>
            {t("verify")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {status?.status === "reauth_required" && <p className="text-sm text-warning">{t("reauth")}</p>}
          <p className="text-sm text-muted-foreground">{t("explain")}</p>
          <input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("email")} className={field} />
          <input
            type="password"
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("password")}
            className={field}
          />
          <Button className="h-11" disabled={!email.includes("@") || !password || busy} onClick={connect}>
            {busy ? t("connecting") : t("connect")}
          </Button>
        </div>
      )}
    </section>
  );
}
