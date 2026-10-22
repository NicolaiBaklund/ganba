"use client";

import { useEffect, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ArrowUp, BookMarked, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { BottomSheet } from "@/components/common/BottomSheet";
import type { CoachMessage, CoachNote } from "@/lib/coach/store";
import { cn } from "@/lib/utils";
import { NotesPanel } from "./NotesPanel";
import { OptionCard } from "./OptionCard";

type Data = { messages: CoachMessage[]; notes: CoachNote[]; archived: { id: string; createdAt: string }[]; hasKey: boolean; hasPlan: boolean };

/** `draft` prefills the message box; the person still sends it themselves. */
export function CoachSheet({ aboutWorkoutId, draft, onClose }: { aboutWorkoutId?: string; draft?: string; onClose: () => void }) {
  const t = useTranslations("coach");
  const format = useFormatter();
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [text, setText] = useState(draft ?? "");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [reading, setReading] = useState<CoachMessage[] | null>(null);
  const [memo, setMemo] = useState(false);
  const [showAll, setShowAll] = useState(false);
  // "Ask the coach" from a session: only the first message is about that session.
  const [aboutUsed, setAboutUsed] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [text]);

  const load = () =>
    fetch("/api/coach")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Data) => {
        setData(d);
        setFailed((f) => (f === "load" ? null : f));
      })
      .catch(() => setFailed("load"));
  useEffect(() => void load(), []);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [data?.messages.length, busy]);

  async function send(body = text, retry = false) {
    const msg = body.trim();
    if (!msg || busy || !data) return;
    setBusy(true);
    setFailed(null);
    setText("");
    setShowAll(false);
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
    setShowAll(false);
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
  // Only the latest exchange is shown in full; everything before folds into one line per message or option.
  const lastUser = reading || showAll ? -1 : shown.map((m) => m.role).lastIndexOf("user");
  const earlier = lastUser > 0 ? shown.slice(0, lastUser) : [];
  const current = lastUser > 0 ? shown.slice(lastUser) : shown;
  const update = (messageId: string) => (next: CoachMessage["options"][number]) =>
    data &&
    setData({
      ...data,
      messages: data.messages.map((x) =>
        x.id === messageId ? { ...x, options: x.options.map((y) => (y.id === next.id ? next : next.status === "applied" && (y.status === "pending" || y.status === "stale") ? { ...y, status: "not_used" } : y)) } : x,
      ),
    });
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
        {data && !reading && (
          <button
            onClick={() => setMemo(!memo)}
            aria-label={t("remembers")}
            aria-expanded={memo}
            className={cn("absolute -top-9 right-16 p-1", memo ? "text-primary" : "text-muted-foreground")}
          >
            <BookMarked className="size-5" />
          </button>
        )}
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

        {data && !reading && memo && <NotesPanel notes={data.notes} onChange={(notes) => setData({ ...data, notes })} />}
        {reading && (
          <button onClick={() => setReading(null)} className="self-start py-2 text-[13px] font-semibold text-primary">{t("back")}</button>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto py-3">
          {!data && failed !== "load" && <div className="h-24 animate-pulse rounded-md bg-muted" role="status" />}
          {data && !shown.length && (
            <div className="text-[13px] text-muted-foreground">
              <p>{t("empty")}</p>
            </div>
          )}
          {!!earlier.length && (
            <div className="mb-2">
              <button onClick={() => setShowAll(true)} className="flex w-full items-center gap-2 py-1 text-[12px] font-semibold text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                {t("earlierInThread")}
                <span className="h-px flex-1 bg-border" />
              </button>
              {earlier.map((m) =>
                m.role === "user" ? (
                  <p key={m.id} className="truncate pt-2 text-[13px] text-muted-foreground">{m.text}</p>
                ) : m.options.length ? (
                  m.options.map((o) => <OptionCard key={o.id} messageId={m.id} option={o} readOnly={!!reading} collapsed onChange={update(m.id)} />)
                ) : (
                  <p key={m.id} className="truncate pt-1 text-[13px]">
                    <span className="font-semibold">{t("title")}:</span> {m.text}
                  </p>
                ),
              )}
            </div>
          )}
          {current.map((m) =>
            m.role === "user" ? (
              <p key={m.id} className="mb-3 ml-auto mt-4 w-fit max-w-[80%] whitespace-pre-wrap rounded-[14px_14px_4px_14px] bg-muted px-3 py-2 text-[14px]">{m.text}</p>
            ) : (
              <div key={m.id} className="mb-3">
                <p className="mb-1 text-[12px] font-semibold text-muted-foreground">{t("title")}</p>
                <RichText text={m.text} />
                {m.options.map((o, i, all) => (
                  <OptionCard key={o.id} messageId={m.id} option={o} readOnly={!!reading} collapsed={i !== all.findIndex((x) => x.status === "pending" || x.status === "stale")} onChange={update(m.id)} />
                ))}
              </div>
            ),
          )}
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
            <div className="border-t border-border pt-2">
              {!text && !busy && (
                <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2">
                  {(["tired", "move", "easier"] as const).map((k) => (
                    <button key={k} type="button" onClick={() => setText(t(`chip.${k}`))} className="shrink-0 rounded-full border border-border px-3 py-1.5 text-[12px]">
                      {t(`chip.${k}`)}
                    </button>
                  ))}
                </div>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
                className="flex items-end gap-2 rounded-[22px] bg-muted py-1.5 pl-4 pr-1.5"
              >
                <textarea
                  value={text}
                  ref={box}
                  onChange={(e) => setText(e.target.value)}
                  rows={1}
                  maxLength={2000}
                  placeholder={t("placeholder")}
                  aria-label={t("placeholder")}
                  className="max-h-[120px] min-h-[34px] flex-1 resize-none bg-transparent py-1.5 text-base outline-none"
                />
                <button type="submit" disabled={busy || !text.trim()} aria-label={t("send")} className="grid size-[34px] shrink-0 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40">
                  <ArrowUp className="size-5" />
                </button>
              </form>
              <p className="pt-1 text-center text-[11px] text-muted-foreground">{t("cost")}</p>
            </div>
          ) : (
            <p className="border-t border-border pt-3 text-[13px] text-muted-foreground">{data.hasPlan ? t("noKey") : t("noPlan")}</p>
          )
        )}
      </div>
    </BottomSheet>
  );
}

/** Coach text: paragraphs, with **bold** for the key numbers. */
function RichText({ text }: { text: string }) {
  return (
    <div className="text-[15px] leading-relaxed">
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i} className={cn("whitespace-pre-wrap", i > 0 && "mt-2")}>
          {para.split(/(\*\*[^*]+\*\*)/).map((part, k) => (part.startsWith("**") && part.endsWith("**") && part.length > 4 ? <b key={k}>{part.slice(2, -2)}</b> : part))}
        </p>
      ))}
    </div>
  );
}
