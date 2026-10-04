export function SectionHead({ title, action, children }: { title: string; action?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mt-6 flex items-baseline justify-between border-b-2 border-foreground pb-1.5">
      <h2 className="cond text-[22px] leading-none">{title}</h2>
      {children && <span className="num text-sm font-bold text-muted-foreground">{children}</span>}
      {action}
    </div>
  );
}
