"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Search, Star } from "lucide-react";
import { toast } from "sonner";
import { MUSCLE_GROUPS, prefillSets, type Measure, type MuscleGroup } from "@loop/core";
import type { PickRow } from "@/lib/strength/view";
import { setsLabel } from "@/lib/strength/format";
import { BottomSheet } from "@/components/common/BottomSheet";
import { Chip } from "@/components/common/Chip";
import { cn } from "@/lib/utils";

/** "Add exercise" (spec §6.1): search, favourites with last time on top, then by body part; "New exercise" last. */
export function ExercisePicker({
  open,
  onOpenChange,
  rows,
  onAdd,
  onStar,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  rows: PickRow[];
  onAdd: (r: PickRow) => void;
  onStar: (key: string) => void;
  onCreated: (r: PickRow) => void;
}) {
  const t = useTranslations("strength");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [group, setGroup] = useState<MuscleGroup>("chest");
  const [measure, setMeasure] = useState<Measure>("kg");
  const [busy, setBusy] = useState(false);

  const match = (r: PickRow) => r.name.toLowerCase().includes(q.trim().toLowerCase());
  // Favourites by last used, newest first.
  const favourites = rows.filter((r) => r.favorite && match(r)).sort((a, b) => (b.lastDate ?? "").localeCompare(a.lastDate ?? ""));

  const row = (r: PickRow) => (
    <div key={r.key} className="flex items-center gap-3 border-b border-border py-2.5">
      <button type="button" aria-label={t("favourite")} aria-pressed={r.favorite} onClick={() => onStar(r.key)} className={cn("shrink-0", r.favorite ? "text-[#ffd23f]" : "text-muted-foreground")}>
        <Star className="size-4" fill={r.favorite ? "currentColor" : "none"} />
      </button>
      <button type="button" onClick={() => onAdd(r)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{r.name}</span>
          {r.last && <span className="num block truncate text-[13px] text-muted-foreground">{t("last", { sets: setsLabel(r.last, r.measure) })}</span>}
        </span>
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full border border-border">
          <Plus className="size-4" />
        </span>
      </button>
    </div>
  );

  async function create() {
    setBusy(true);
    const res = await fetch("/api/strength/exercise", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, group, measure }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return toast.error(t("saveError"));
    const { key } = (await res.json()) as { key: string };
    onCreated({ key, name: name.trim(), group, measure, favorite: false, last: null, lastDate: null, prefill: prefillSets(null, measure), hint: null });
    setCreating(false);
    setName("");
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t("addExercise")} className="h-[92dvh]">
      <label className="mt-3 flex h-11 items-center gap-2.5 rounded-[10px] bg-muted px-3.5 text-muted-foreground">
        <Search className="size-4" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} className="w-full bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground" />
      </label>
      {favourites.length > 0 && (
        <>
          <p className="mt-5 text-[13px] font-bold text-muted-foreground">{t("favourites")}</p>
          {favourites.map(row)}
        </>
      )}
      {MUSCLE_GROUPS.map((g) => {
        const list = rows.filter((r) => r.group === g && !r.favorite && match(r));
        if (!list.length) return null;
        return (
          <div key={g}>
            <p className="mt-5 text-[13px] font-bold text-muted-foreground">{t(`groups.${g}`)}</p>
            {list.map(row)}
          </div>
        );
      })}
      {creating ? (
        <div className="mt-6 flex flex-col gap-3">
          <input autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={t("name")} className="h-11 rounded-[10px] bg-muted px-3.5 text-[15px] outline-none" />
          <div className="flex flex-wrap gap-2">
            {MUSCLE_GROUPS.map((g) => (
              <Chip key={g} selected={group === g} onClick={() => setGroup(g)} className="h-9 px-3">
                {t(`groups.${g}`)}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {(["kg", "bw", "time"] as const).map((m) => (
              <Chip key={m} selected={measure === m} onClick={() => setMeasure(m)} className="h-9 px-3">
                {t(`measures.${m}`)}
              </Chip>
            ))}
          </div>
          <button type="button" disabled={!name.trim() || busy} onClick={create} className="h-12 rounded-full bg-foreground font-extrabold text-background disabled:opacity-50">
            {t("create")}
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setCreating(true)} className="mt-5 py-2 text-left text-[15px] font-bold">
          {t("newExercise")}
        </button>
      )}
    </BottomSheet>
  );
}
