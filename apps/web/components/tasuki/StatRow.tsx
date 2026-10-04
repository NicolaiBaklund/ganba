export function StatRow({ items, ruled = true }: { items: { value: React.ReactNode; label: string }[]; ruled?: boolean }) {
  return (
    <div className={ruled ? "grid gap-x-3 border-t-2 border-foreground pt-2" : "grid gap-x-3"} style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <p className="num truncate text-xl font-extrabold">{it.value}</p>
          <p className="text-xs text-muted-foreground">{it.label}</p>
        </div>
      ))}
    </div>
  );
}
