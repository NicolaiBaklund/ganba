"use client";

const KEY = "loop.pendingWrites";
type Pending = { url: string; body: unknown };

const read = (): Pending[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
};
const write = (q: Pending[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(q));
  } catch {
    /* storage unavailable */
  }
};

const post = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/** POST; on network failure keep it locally and retry later. */
export async function postOrQueue(url: string, body: unknown): Promise<"ok" | "queued" | "error"> {
  try {
    const res = await post(url, body);
    return res.ok ? "ok" : "error";
  } catch {
    write([...read(), { url, body }]);
    return "queued";
  }
}

export async function flushQueue(): Promise<number> {
  const q = read();
  if (!q.length) return 0;
  const left: Pending[] = [];
  let sent = 0;
  for (const p of q) {
    try {
      const r = await post(p.url, p.body);
      if (r.ok) sent++;
      else if (r.status >= 500) left.push(p);
    } catch {
      left.push(p);
    }
  }
  write(left);
  return sent;
}
