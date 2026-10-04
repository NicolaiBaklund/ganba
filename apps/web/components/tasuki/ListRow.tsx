import Link from "next/link";

export function ListRow({
  title,
  sub,
  value,
  href,
  onClick,
  leading,
  trailing,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  value?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  const body = (
    <>
      {leading}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold">{title}</span>
        {sub && <span className="block truncate text-[13px] text-muted-foreground">{sub}</span>}
      </span>
      {value != null && <span className="num text-[17px] font-extrabold">{value}</span>}
      {trailing}
    </>
  );
  const cls = "flex w-full items-center gap-3 border-b border-border py-3 text-left active:bg-muted/60";
  if (href) return <Link href={href} className={cls}>{body}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{body}</button>;
  return <div className={cls}>{body}</div>;
}
