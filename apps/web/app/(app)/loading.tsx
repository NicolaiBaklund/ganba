/** Shown instantly when switching tabs while the server renders the page. */
export default function Loading() {
  const block = "animate-pulse rounded-3xl bg-card";
  return (
    <main className="flex flex-col gap-3 px-4 pt-4" aria-busy="true">
      <div className="h-9 w-40 animate-pulse rounded-xl bg-card" />
      <div className={`${block} h-56`} />
      <div className={`${block} h-24`} />
      <div className={`${block} h-40`} />
    </main>
  );
}
