"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function ApiKeyCard({ status }: { status: { last4: string; validatedAt: string | null } | null }) {
  const t = useTranslations("apiKey");
  const format = useFormatter();
  const router = useRouter();
  const [editing, setEditing] = useState(!status);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const res = await fetch("/api/settings/api-key", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key }),
    });
    setBusy(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(body.error === "invalid_key" ? t("invalid") : t("unavailable"));
    setKey("");
    setEditing(false);
    toast.success(t("saved"));
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    await fetch("/api/settings/api-key", { method: "DELETE" });
    setBusy(false);
    setEditing(true);
    router.refresh();
  }

  return (
    <section className="rounded-md bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <KeyRound className="size-4 text-primary" />
        <h2 className="cond text-lg leading-none">{t("title")}</h2>
      </div>
      {status && !editing ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          <div>
            <p className="num">••••{status.last4}</p>
            {status.validatedAt && (
              <p className="text-xs text-muted-foreground">
                {t("verified", { date: format.dateTime(new Date(status.validatedAt), { day: "numeric", month: "short" }) })}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              {t("replace")}
            </Button>
            <Button variant="destructive" size="sm" onClick={remove} disabled={busy}>
              {t("remove")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{t("explain")}</p>
          <input
            type="password"
            autoComplete="off"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="sk-ant-…"
            className="h-12 rounded-md border border-border bg-card px-4 outline-none focus:border-primary"
          />
          <Button className="h-11" disabled={key.trim().length < 20 || busy} onClick={save}>
            {busy ? t("checking") : t("save")}
          </Button>
        </div>
      )}
    </section>
  );
}
