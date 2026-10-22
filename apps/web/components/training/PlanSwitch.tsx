"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { SwitchRow } from "@/components/common/SwitchRow";

/**
 * A plan-wide ride switch (indoor season, power targets): the server rebuilds or re-targets the upcoming rides.
 * `field` is both the endpoint (/api/training/plan/<field>) and the body key.
 */
export function PlanSwitch({ field, on: initial, label, hint }: { field: "indoor" | "power"; on: boolean; label: string; hint: string }) {
  const t = useTranslations("training");
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !on;
    setBusy(true);
    setOn(next);
    const res = await fetch(`/api/training/plan/${field}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ [field]: next }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setOn(!next);
      return toast.error(t("indoorError"));
    }
    router.refresh();
  }

  return <SwitchRow label={label} hint={hint} on={on} disabled={busy} onToggle={toggle} className="-mt-px" />;
}
