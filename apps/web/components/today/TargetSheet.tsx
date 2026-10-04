"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BottomSheet } from "@/components/common/BottomSheet";

export function TargetSheet({ target, breakdown, children }: { target: number; breakdown: { base: number; activity: number; goal: number }; children: React.ReactNode }) {
  const t = useTranslations("today");
  const [open, setOpen] = useState(false);
  const signed = (n: number) => (n >= 0 ? `+ ${n}` : `− ${Math.abs(n)}`);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-right">
        {children}
      </button>
      <BottomSheet open={open} onOpenChange={setOpen} title={t("targetHow")}>
        <p className="num text-lg">
          {t("breakdown.base")} <b>{breakdown.base}</b> {signed(breakdown.activity)} {t("breakdown.activity").toLowerCase()} − {t("breakdown.goal").toLowerCase()} <b>{breakdown.goal}</b> = <b className="text-primary">{target}</b>
        </p>
      </BottomSheet>
    </>
  );
}
