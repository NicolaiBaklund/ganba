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
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={t("targetHow")} className="text-right">
        {children}
      </button>
      <BottomSheet open={open} onOpenChange={setOpen} title={t("targetHow")}>
        <p className="num text-lg">
          {t("breakdown.base")} <b>{breakdown.base}</b> {signed(breakdown.activity)} {t("breakdown.activity").toLowerCase()} {signed(breakdown.goal)} {t("breakdown.goal").toLowerCase()} = <b className="text-primary">{target}</b>
        </p>
      </BottomSheet>
    </>
  );
}
