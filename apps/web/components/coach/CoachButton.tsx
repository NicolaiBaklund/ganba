"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MessageCircle } from "lucide-react";
import { CoachSheet } from "./CoachSheet";

export function CoachButton({ aboutWorkoutId, variant = "pill" }: { aboutWorkoutId?: string; variant?: "pill" | "link" }) {
  const t = useTranslations("coach");
  const [open, setOpen] = useState(false);
  return (
    <>
      {variant === "pill" ? (
        <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-[7px] text-[13px] font-semibold">
          <MessageCircle className="size-4 text-primary" />
          {t("open")}
        </button>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1.5 self-start text-sm font-semibold text-primary">
          <MessageCircle className="size-4" />
          {t("ask")}
        </button>
      )}
      {open && <CoachSheet aboutWorkoutId={aboutWorkoutId} onClose={() => setOpen(false)} />}
    </>
  );
}
