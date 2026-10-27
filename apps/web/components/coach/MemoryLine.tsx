"use client";

import { useTranslations } from "next-intl";
import { BookMarked } from "lucide-react";
import type { CoachMeta } from "@/lib/coach/store";

/** Under a reply: what the coach remembered or forgot in that turn. Tap to see and edit the memory. */
export function MemoryLine({ meta, onOpen }: { meta: CoachMeta; onOpen: () => void }) {
  const t = useTranslations("coach");
  if (!meta.remembered.length && !meta.forgot.length) return null;
  const parts = [
    ...(meta.remembered.length ? [t("remembered", { text: meta.remembered.join("; ") })] : []),
    ...(meta.forgot.length ? [t("forgot", { text: meta.forgot.join("; ") })] : []),
  ];
  return (
    <button type="button" onClick={onOpen} className="mb-1 flex max-w-full items-center gap-1.5 text-left text-[12px] text-muted-foreground">
      <BookMarked className="size-3.5 shrink-0" />
      <span className="truncate">{parts.join(" · ")}</span>
    </button>
  );
}
