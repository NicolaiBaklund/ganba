/** Shown instantly when switching tabs while the server renders the page. Mirrors the Today layout. */
export default function Loading() {
  const block = "animate-pulse rounded-md bg-muted";
  return (
    <main className="flex flex-col gap-4 px-[18px] pt-5" aria-busy="true">
      <div className={`${block} h-5 w-44`} />
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className={`${block} h-[34px]`} />
        ))}
      </div>
      <div className={`${block} h-48`} />
      <div className={`${block} h-16 w-40`} />
      <div className={`${block} h-24`} />
    </main>
  );
}
