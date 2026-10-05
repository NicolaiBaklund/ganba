"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import type { CoachNote } from "@/lib/coach/store";
import { cn } from "@/lib/utils";

export function NotesPanel({ notes, onChange }: { notes: CoachNote[]; onChange: (n: CoachNote[]) => void }) {
  const t = useTranslations("coach");
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  async function save(id: string) {
    const res = await fetch(`/api/coach/notes/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: draft }) }).catch(() => null);
    if (res?.ok) onChange(notes.map((n) => (n.id === id ? { ...n, text: draft.trim(), source: "user" } : n)));
    setEditing(null);
  }
  async function remove(id: string) {
    const res = await fetch(`/api/coach/notes/${id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) onChange(notes.filter((n) => n.id !== id));
  }

  return (
    <div className="border-b border-border">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between py-2 text-[13px] font-semibold">
        <span>
          {t("remembers")} <span className="num text-muted-foreground">{notes.length}</span>
        </span>
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="pb-2">
          {!notes.length && <li className="py-1 text-[13px] text-muted-foreground">{t("noNotes")}</li>}
          {notes.map((n) => (
            <li key={n.id} className="flex items-start gap-2 py-1 text-[13px]">
              {editing === n.id ? (
                <>
                  <input value={draft} maxLength={200} onChange={(e) => setDraft(e.target.value)} className="min-w-0 flex-1 rounded-md bg-muted px-2 py-1" aria-label={t("edit")} />
                  <button onClick={() => save(n.id)} className="font-semibold text-primary">{t("save")}</button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1">
                    {n.text}
                    {n.until && <span className="text-muted-foreground"> ({t("until", { date: format.dateTime(new Date(`${n.until}T00:00:00Z`), { day: "numeric", month: "short", timeZone: "UTC" }) })})</span>}
                  </span>
                  <button onClick={() => { setEditing(n.id); setDraft(n.text); }} className="text-muted-foreground">{t("edit")}</button>
                  <button onClick={() => remove(n.id)} className="text-destructive">{t("delete")}</button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
