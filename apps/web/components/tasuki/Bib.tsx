import Link from "next/link";
import type { WorkoutType } from "@loop/core";

const Pins = () => (
  <>
    {["left-2 top-2", "right-2 top-2", "left-2 bottom-2", "right-2 bottom-2"].map((p) => (
      <span key={p} aria-hidden className={`absolute ${p} size-[7px] rounded-full bg-background shadow-[inset_0_0_0_1px_rgb(0_0_0/12%)]`} />
    ))}
  </>
);

/** Race bib for today's session: always white paper with black print, sash in the session colour. */
export function Bib({
  label,
  big,
  unit,
  meta,
  footer,
  type,
  href,
}: {
  label: string;
  big: string;
  unit?: string;
  meta: React.ReactNode;
  footer?: React.ReactNode;
  type: WorkoutType;
  href?: string;
}) {
  const inner = (
    <>
      <span aria-hidden className="absolute -top-2.5 right-[84px] h-[220px] w-[30px] origin-top -rotate-[52deg]" style={{ background: `var(--w-${type})` }} />
      <Pins />
      <p className="relative pl-1 text-[13px] font-bold">{label}</p>
      <p className="num relative mt-1.5 truncate pr-16 text-[clamp(64px,26vw,104px)] font-black leading-[.86] [font-stretch:62%]">
        {big}
        {unit && <small className="ml-0.5 text-[34px] font-extrabold">{unit}</small>}
      </p>
      <p className="relative mt-1 text-[15px] font-semibold">{meta}</p>
      {footer && <div className="relative mt-3 flex items-center gap-2 border-t-2 border-paper-ink pt-2.5 text-[13px]">{footer}</div>}
    </>
  );
  const cls = "relative block overflow-hidden rounded-md bg-paper px-[18px] py-3.5 text-paper-ink shadow-[0_1px_0_var(--border),0_10px_24px_-16px_rgb(0_0_0/40%)]";
  return href ? <Link href={href} className={cls}>{inner}</Link> : <section className={cls}>{inner}</section>;
}

export function RestBib({ title, nextLabel, next }: { title: string; nextLabel: string; next: { type: WorkoutType; text: string } | null }) {
  return (
    <section className="relative overflow-hidden rounded-md bg-paper px-[18px] py-3 text-paper-ink">
      <span aria-hidden className="absolute -top-2.5 right-16 h-[170px] w-[30px] origin-top -rotate-[52deg]" style={{ background: "var(--w-rest)" }} />
      <Pins />
      <p className="relative mt-1 text-[52px] font-black leading-[.9] [font-stretch:62%]">{title}</p>
      {next && (
        <p className="relative mt-2.5 flex items-center gap-2 border-t-2 border-paper-ink pt-2 text-[13px]">
          <span aria-hidden className="size-3.5 shrink-0 -skew-x-[18deg]" style={{ background: `var(--w-${next.type})` }} />
          {nextLabel} <b className="font-bold">{next.text}</b>
        </p>
      )}
    </section>
  );
}
