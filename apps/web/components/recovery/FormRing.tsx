import type { FormBand } from "@loop/core";

export const BAND_COLOR: Record<FormBand, string> = { ready: "var(--success)", steady: "var(--warning)", low: "var(--primary)" };

/** Form as a ring: the arc fills to the score in the band's colour; no score = grey ring with a dash. */
export function FormRing({ score, band, size, label }: { score: number | null; band: FormBand | null; size: number; label?: string }) {
  const stroke = Math.max(3, Math.round(size / 11));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const fill = score == null ? 0 : Math.max(0, Math.min(100, score)) / 100;
  return (
    <span className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
        {band && fill > 0 && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={BAND_COLOR[band]} strokeWidth={stroke} strokeDasharray={`${c * fill} ${c}`} />
        )}
      </svg>
      <span className="relative flex flex-col items-center leading-none">
        <span className="num font-extrabold [font-stretch:62%]" style={{ fontSize: Math.round(size * 0.4) }}>
          {score ?? "–"}
        </span>
        {label && <span className="mt-1 text-[12px] text-muted-foreground">{label}</span>}
      </span>
    </span>
  );
}
