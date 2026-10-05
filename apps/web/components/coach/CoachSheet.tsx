"use client";

import { useEffect, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Send } from "lucide-react";
import { toast } from "sonner";
import { BottomSheet } from "@/components/common/BottomSheet";
import { Button } from "@/components/ui/button";
import type { CoachMessage, CoachNote } from "@/lib/coach/store";
import { cn } from "@/lib/utils";
import { NotesPanel } from "./NotesPanel";
import { OptionCard } from "./OptionCard";

type Data = { messages: CoachMessage[]; notes: CoachNote[]; archived: { id: string; createdAt: string }[]; hasKey: boolean; hasPlan: boolean };

export function CoachSheet({ aboutWorkoutId, onClose }: { aboutWorkoutId?: string; onClose: () => void }) {
  const t = useTranslations("coach");
  const format = useFormatter();
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [reading, setReading] = useState<CoachMessage[] | null>(null);
  // "Ask the coach" from a session: only the first message is about that session.
  const [aboutUsed, setAboutUsed] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const load = () =>
    fetch("/api/coach")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Data) => {
        setData(d);
        setFailed((f) => (f === "load" ? null : f));
      })
      .catch(() => setFailed("load"));
  useEffect(() => void load(), []);
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [data?.messages.length, busy]);

  async function send(body = text, retry = false) {
    const msg = body.trim();
    if (!msg || busy || !data) return;
    setBusy(true);
    setFailed(null);
    setText("");
    const about = aboutUsed ? null : (aboutWorkoutId ?? null);
    const optimistic: CoachMessage = { id: `local-${Date.now()}`, role: "user", text: msg, aboutWorkoutId: about, options: [], usedHealth: false, createdAt: new Date().toISOString() };
    // A retry reuses the message already shown (and stored).
    if (!retry) setData({ ...data, messages: [...data.messages, optimistic] });
    const res = await fetch("/api/coach/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: msg, aboutWorkoutId: about }),
    }).catch(() => null);
    const out = await res?.json().catch(() => null);
    setBusy(false);
    setAboutUsed(true);
    if (!res?.ok) {
      if (out?.error === "busy") {
        setData((d) => (d ? { ...d, messages: d.messages.filter((x) => x.id !== optimistic.id) } : d));
        setFailed("busy");
      } else setFailed(msg);
      return;
    }
    await load();
  }

  async function newConversation() {
    setMenu(false);
    const res = await fetch("/api/coach/new", { method: "POST" }).catch(() => null);
    if (res?.status === 409) return toast(t("busy"));
    await load();
  }
  async function endPlan() {
    const res = await fetch("/api/training/plan", { method: "DELETE" }).catch(() => null);
    if (!res?.ok) return toast.error(t("error"));
    onClose();
    router.refresh();
  }
  async function openThread(id: string) {
    setMenu(false);
    const r = await fetch(`/api/coach/threads/${id}`).then((x) => x.json()).catch(() => null);
    setReading(r?.messages ?? []);
  }

  const shown = reading ?? data?.messages ?? [];
  return (
    <BottomSheet open onOpenChange={(o) => !o && onClose()} title={t("title")} className="flex flex-col data-[side=bottom]:h-[92dvh]">
      <div className="relative flex min-h-0 flex-1 flex-col">
        <button
          onClick={() => {
            setMenu(!menu);
            setConfirmEnd(false);
          }}
          aria-label={t("menu")}
          aria-expanded={menu}
          className="absolute -top-9 right-8 p-1 text-muted-foreground"
        >
          <MoreHorizontal className="size-5" />
        </button>
        {menu && (
          <div className="absolute right-0 top-0 z-10 flex w-60 flex-col rounded-md border border-border bg-popover p-1 text-sm shadow">
            <button onClick={newConversation} className="rounded px-3 py-2 text-left active:bg-muted">{t("new")}</button>
            {!!data?.archived.length && <p className="px-3 pt-2 text-xs text-muted-foreground">{t("earlier")}</p>}
            {data?.archived.map((a) => (
              <button key={a.id} onClick={() => openThread(a.id)} className="rounded px-3 py-1.5 text-left active:bg-muted">
                {format.dateTime(new Date(a.createdAt), { day: "numeric", month: "short", year: "numeric" })}
              </button>
            ))}
            {confirmEnd ? (
              <>
                <p className="px-3 pt-2 text-xs text-muted-foreground">{t("endExplain")}</p>
                <button onClick={endPlan} className="rounded px-3 py-2 text-left font-semibold text-destructive">{t("endConfirm")}</button>
              </>
            ) : (
              <button onClick={() => setConfirmEnd(true)} className="rounded px-3 py-2 text-left text-destructive">{t("endPlan")}</button>
            )}
          </div>
        )}

        {data && !reading && <NotesPanel notes={data.notes} onChange={(notes) => setData({ ...data, notes })} />}
        {reading && (
          <button onClick={() => setReading(null)} className="self-start py-2 text-[13px] font-semibold text-primary">{t("back")}</button>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto py-3">
          {!data && failed !== "load" && <div className="h-24 animate-pulse rounded-md bg-muted" role="status" />}
          {data && !shown.length && <p className="text-[13px] text-muted-foreground">{t("empty")}</p>}
          {shown.map((m) => (
            <div key={m.id} className={cn("mb-3", m.role === "user" ? "ml-10 text-right" : "mr-4")}>
              <p className={cn("inline-block whitespace-pre-wrap rounded-md px-3 py-2 text-left text-[15px]", m.role === "user" ? "bg-foreground text-background" : "bg-muted")}>{m.text}</p>
              {m.options.map((o) => (
                <OptionCard
                  key={o.id}
                  messageId={m.id}
                  option={o}
                  readOnly={!!reading}
                  onChange={(next) =>
                    data &&
                    setData({
                      ...data,
                      messages: data.messages.map((x) =>
                        x.id === m.id ? { ...x, options: x.options.map((y) => (y.id === next.id ? next : next.status === "applied" && y.status === "pending" ? { ...y, status: "not_used" } : y)) } : x,
                      ),
                    })
                  }
                />
              ))}
            </div>
          ))}
          {busy && <p className="text-[13px] text-muted-foreground" role="status">{t("thinking")}…</p>}
          {failed && (
            <p className="text-[13px] text-muted-foreground">
              {failed === "busy" ? t("busy") : failed === "load" ? t("loadError") : t("error")}{" "}
              {failed === "load" ? (
                <button onClick={() => void load()} className="font-semibold text-primary">{t("retry")}</button>
              ) : (
                failed !== "busy" && (
                  <button onClick={() => send(failed, true)} className="font-semibold text-primary">{t("retry")}</button>
                )
              )}
            </p>
          )}
          <div ref={end} />
        </div>

        {!reading && data && (
          data.hasKey && data.hasPlan ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
              className="flex items-end gap-2 border-t border-border pt-2"
            >
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={2}
                maxLength={2000}
                placeholder={t("placeholder")}
                aria-label={t("placeholder")}
                className="min-h-[52px] flex-1 resize-none rounded-md bg-muted p-3 text-[15px] outline-none focus:ring-2 focus:ring-primary"
              />
              <Button type="submit" className="h-12 w-12 p-0" disabled={busy || !text.trim()} aria-label={t("send")}>
                <Send className="size-5" />
              </Button>
            </form>
          ) : (
            <p className="border-t border-border pt-3 text-[13px] text-muted-foreground">{data.hasPlan ? t("noKey") : t("noPlan")}</p>
          )
        )}
        <p className="pt-1 text-center text-[11px] text-muted-foreground">{t("cost")}</p>
      </div>
    </BottomSheet>
  );
}
