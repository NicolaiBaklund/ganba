"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ProposalView } from "@/lib/training/view";

export function ProposalCard({ p }: { p: ProposalView }) {
  const t = useTranslations("proposal");
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function act(action: "accept" | "reject") {
    setBusy(true);
    const res = await fetch(`/api/training/proposals/${p.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok && res?.status !== 409) return toast.error(t("error"));
    toast.success(action === "accept" ? t("applied") : t("dismissed"));
    router.refresh();
  }

  const Icon = p.kind === "ai" ? Sparkles : Wand2;
  return (
    <section className="rounded-md border-l-4 border-primary bg-card p-4">
      <div className="mb-2 flex items-center gap-2">
        <Icon className="size-4 text-primary" />
        <h2 className="font-bold">{t(`title.${p.kind}`)}</h2>
      </div>
      <p className="text-sm">{p.summary}</p>
      <div className="mt-4 flex gap-2">
        <Button className="h-11 flex-1" disabled={busy} onClick={() => act("accept")}>
          {t("accept")}
        </Button>
        <Button variant="secondary" className="h-11 flex-1" disabled={busy} onClick={() => act("reject")}>
          {t("reject")}
        </Button>
      </div>
    </section>
  );
}
