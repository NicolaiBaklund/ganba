"use client";

import { useEffect, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowUp, BookMarked, Check, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import type { CoachMessage, CoachNote } from "@/lib/coach/store";
import type { CoachEvent } from "@/lib/coach/stream";
import { cn } from "@/lib/utils";
import { MemoryLine } from "./MemoryLine";
import { NotesPanel } from "./NotesPanel";
import { PlanCard } from "./PlanCard";

type Data = { messages: CoachMessage[]; notes: CoachNote[]; archived: { id: string; createdAt: string }[]; hasKey: boolean; hasPlan: boolean };

/**
 * The coach conversation (the Coach tab). The answer streams in: a status line while the coach looks things up,
 * then the text as it is written. `about`/`day` set the topic of the first message; `draft` prefills the box.
 */
export function CoachChat({ aboutWorkoutId, aboutDate, draft }: { aboutWorkoutId?: string; aboutDate?: string; draft?: string }) {
  const t = useTranslations("coach");
  const format = useFormatter();
  const [data, setData] = useState<Data | null>(null);
  const [text, setText] = useState(draft ?? "");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [live, setLive] = useState("");
  const [failed, setFailed] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [reading, setReading] = useState<CoachMessage[] | null>(null);
  const [memo, setMemo] = useState(false);
  // A topic from a link (session, day) applies to the first message only.
  const [aboutUsed, setAboutUsed] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  // Follow new text only while the reader is at the bottom; scrolled up stays put.
  const atBottom = useRef(true);
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [text]);

  const load = (): Promise<Data | null> =>
    fetch("/api/coach")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Data) => {
        setData(d);
        setFailed((f) => (f === "load" ? null : f));
        return d;
      })
      .catch(() => {
        setFailed("load");
        return null;
      });
  useEffect(() => void load(), []);
  useEffect(() => {
    if (atBottom.current) end.current?.scrollIntoView({ block: "end" });
  }, [data?.messages.length, busy, live, status]);

  async function send(body = text, retry = false) {
    const msg = body.trim();
    if (!msg || busy || !data) return;
    setBusy(true);
    // Sending brings the conversation back to the bottom, also when scrolled up to reread something.
    atBottom.current = true;
    setFailed(null);
    setStatus(null);
    setLive("");
    setText("");
    const about = aboutUsed ? {} : { aboutWorkoutId: aboutWorkoutId ?? null, aboutDate: aboutDate ?? null };
    const optimistic: CoachMessage = { id: `local-${Date.now()}`, role: "user", text: msg, aboutWorkoutId: aboutUsed ? null : (aboutWorkoutId ?? null), options: [], usedHealth: false, meta: { tools: [], remembered: [], forgot: [] }, createdAt: new Date().toISOString() };
    // A retry reuses the message already shown (and stored).
    if (!retry) setData({ ...data, messages: [...data.messages, optimistic] });
    const res = await fetch("/api/coach/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: msg, ...about }),
    }).catch(() => null);
    setAboutUsed(true);
    if (!res?.ok || !res.body || !res.headers.get("content-type")?.includes("ndjson")) {
      const out = await res?.json().catch(() => null);
      setBusy(false);
      if (out?.error === "busy") {
        setData((d) => (d ? { ...d, messages: d.messages.filter((x) => x.id !== optimistic.id) } : d));
        setFailed("busy");
      } else setFailed(msg);
      return;
    }

    const sentAt = new Date().toISOString();
    let finished = false;
    const onEvent = (e: CoachEvent) => {
      if (e.type === "status") setStatus(e.label);
      else if (e.type === "text") setLive(e.text);
      else if (e.type === "done") {
        finished = true;
        setData((d) => (d ? { ...d, messages: [...d.messages, e.message] } : d));
      } else if (e.type === "error") {
        finished = true;
        setFailed(msg);
      }
    };
    try {
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        for (let i = buf.indexOf("\n"); i >= 0; i = buf.indexOf("\n")) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (line) onEvent(JSON.parse(line) as CoachEvent);
        }
      }
    } catch {
      // The connection dropped: the answer is still stored on the server.
    }
    if (finished) {
      // The stored conversation: the real user message, and notes the coach may have saved.
      await load();
    } else {
      // The connection dropped mid-answer: the coach keeps going on the server; wait for its reply.
      setStatus(t("reconnecting"));
      for (let i = 0; i < 60; i++) {
        const d = await load();
        if (d?.messages.some((m) => m.role === "coach" && Date.parse(m.createdAt) > Date.parse(sentAt))) break;
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    setBusy(false);
    setStatus(null);
    setLive("");
  }

  async function newConversation() {
    setMenu(false);
    const res = await fetch("/api/coach/new", { method: "POST" }).catch(() => null);
    if (res?.status === 409) return toast(t("busy"));
    await load();
  }
  async function openThread(id: string) {
    setMenu(false);
    const r = await fetch(`/api/coach/threads/${id}`).then((x) => x.json()).catch(() => null);
    setReading(r?.messages ?? []);
  }

  const shown = reading ?? data?.messages ?? [];
  // Functional updates: an apply can finish after a newer reply was added.
  const update = (messageId: string) => (next: CoachMessage["options"][number]) =>
    setData((d) =>
      d && {
        ...d,
        messages: d.messages.map((x) =>
          x.id === messageId ? { ...x, options: x.options.map((y) => (y.id === next.id ? next : next.status === "applied" && (y.status === "pending" || y.status === "stale") ? { ...y, status: "not_used" as const } : y)) } : x,
        ),
      },
    );
  const dismiss = (messageId: string) => () =>
    setData((d) =>
      d && {
        ...d,
        messages: d.messages.map((x) =>
          x.id === messageId ? { ...x, options: x.options.map((y) => (y.status === "pending" || y.status === "stale" ? { ...y, status: "dismissed" as const } : y)) } : x,
        ),
      },
    );
  // Day separators: "Today 07:42", "Yesterday", else the date.
  const dayKey = (iso: string) => new Date(iso).toDateString();
  const dayLabel = (iso: string) => {
    const d = new Date(iso);
    const days = Math.round((new Date(new Date().toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
    const time = format.dateTime(d, { hour: "2-digit", minute: "2-digit" });
    return days === 0 ? t("todayAt", { time }) : days === 1 ? t("yesterday") : format.dateTime(d, { weekday: "short", day: "numeric", month: "short" });
  };
  const checked = (tools: string[]) => {
    const names = tools.filter((x) => x !== "update_notes" && x !== "reply").map((x) => t(`checked.${x}`));
    return names.length ? t("checkedLine", { what: names.slice(0, 2).join(", ") + (names.length > 2 ? ` +${names.length - 2}` : "") }) : null;
  };
  const chips = data?.hasPlan ? (["food", "tired", "move"] as const) : (["food", "recovery"] as const);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3">
        <h1 className="cond text-[34px] leading-none">{t("title")}</h1>
        <div className="flex items-center gap-1">
          {data && !reading && (
            <button onClick={() => setMemo(!memo)} aria-label={t("remembers")} aria-expanded={memo} className={cn("p-2", memo ? "text-primary" : "text-muted-foreground")}>
              <BookMarked className="size-5" />
            </button>
          )}
          <button onClick={() => setMenu(!menu)} aria-label={t("menu")} aria-expanded={menu} className="p-2 text-muted-foreground">
            <MoreHorizontal className="size-5" />
          </button>
        </div>
      </div>
      {menu && (
        <div className="absolute right-0 top-11 z-10 flex w-60 flex-col rounded-md border border-border bg-popover p-1 text-sm shadow">
          <button onClick={newConversation} className="rounded px-3 py-2 text-left active:bg-muted">{t("new")}</button>
          {!!data?.archived.length && <p className="px-3 pt-2 text-xs text-muted-foreground">{t("earlier")}</p>}
          {data?.archived.map((a) => (
            <button key={a.id} onClick={() => openThread(a.id)} className="rounded px-3 py-1.5 text-left active:bg-muted">
              {format.dateTime(new Date(a.createdAt), { day: "numeric", month: "short", year: "numeric" })}
            </button>
          ))}
        </div>
      )}

      {data && !reading && memo && <NotesPanel notes={data.notes} onChange={(notes) => setData({ ...data, notes })} />}
      {reading && (
        <button onClick={() => setReading(null)} className="self-start py-2 text-[13px] font-semibold text-primary">{t("back")}</button>
      )}

      <div
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto py-3 [mask-image:linear-gradient(to_bottom,transparent,#000_20px)]"
      >
        {!data && failed !== "load" && <div className="h-24 animate-pulse rounded-md bg-muted" />}
        {data && !shown.length && <p className="text-[14px] text-muted-foreground">{t("empty")}</p>}
        {shown.map((m, i) => {
          const newDay = i === 0 || dayKey(shown[i - 1]!.createdAt) !== dayKey(m.createdAt);
          // The first open suggestion of the latest reply is open; the rest wait folded, also once the talk moves on.
          const firstOpen = i === shown.length - 1 ? m.options.findIndex((o) => o.status === "pending" || o.status === "stale") : -1;
          return (
            <div key={m.id}>
              {newDay && <p className="py-2 text-center text-[11px] text-muted-foreground">{dayLabel(m.createdAt)}</p>}
              {m.role === "user" ? (
                <p className="mb-3 ml-auto mt-1 w-fit max-w-[82%] whitespace-pre-wrap rounded-2xl bg-muted px-3.5 py-2 text-[14.5px]">{m.text}</p>
              ) : (
                <div className="mb-4">
                  {checked(m.meta.tools) && (
                    <p className="mb-1 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                      <Check className="size-3.5" /> {checked(m.meta.tools)}
                    </p>
                  )}
                  <RichText text={m.text} />
                  {m.options.map((o, k) => (
                    <PlanCard key={o.id} messageId={m.id} option={o} open={k === firstOpen} readOnly={!!reading} onChange={update(m.id)} onDismiss={dismiss(m.id)} />
                  ))}
                  {!reading && <MemoryLine meta={m.meta} onOpen={() => setMemo(true)} />}
                </div>
              )}
            </div>
          );
        })}
        {busy && (
          <div className="mb-4" role="status" aria-live="polite">
            <p className="mb-1 flex items-center gap-2 text-[12px] text-muted-foreground">
              <span className="relative flex size-2" aria-hidden>
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:animate-none" />
                <span className="relative inline-flex size-2 rounded-full bg-primary" />
              </span>
              {status ?? `${t("thinking")}…`}
            </p>
            {live && <RichText text={live} />}
          </div>
        )}
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
        data.hasKey ? (
          <div className="border-t border-border pt-2">
            {!text && !busy && (
              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2">
                {chips.map((k) => (
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
          <p className="border-t border-border pt-3 text-[13px] text-muted-foreground">{t("noKey")}</p>
        )
      )}
    </div>
  );
}

/** Coach text: plain paragraphs, no bubble, with **bold** for the key numbers. */
function RichText({ text }: { text: string }) {
  return (
    <div className="text-[15px] leading-[1.55] text-foreground">
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i} className={cn("whitespace-pre-wrap", i > 0 && "mt-2")}>
          {para.split(/(\*\*[^*]+\*\*)/).map((part, k) => (part.startsWith("**") && part.endsWith("**") && part.length > 4 ? <b key={k}>{part.slice(2, -2)}</b> : part))}
        </p>
      ))}
    </div>
  );
}
