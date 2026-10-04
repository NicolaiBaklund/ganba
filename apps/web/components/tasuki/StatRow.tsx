export function StatRow({ items }: { items: { value: React.ReactNode; label: string }[] }) {
  return (
    <div className="grid border-t-2 border-foreground pt-2" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <p className="num truncate text-xl font-extrabold">{it.value}</p>
          <p className="text-xs text-muted-foreground">{it.label}</p>
        </div>
      ))}
    </div>
  );
}
