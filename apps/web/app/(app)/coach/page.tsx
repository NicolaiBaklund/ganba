import { requireUser } from "@/lib/supabase/server";
import { CoachChat } from "@/components/coach/CoachChat";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** The Coach tab: one ongoing conversation. `about` (session id), `day` and `draft` come from links elsewhere. */
export default async function CoachPage({ searchParams }: PageProps<"/coach">) {
  await requireUser();
  const sp = await searchParams;
  const about = one(sp.about);
  const day = one(sp.day);
  return (
    <main className="flex h-[calc(100dvh-4.5rem-env(safe-area-inset-bottom))] flex-col px-[18px] pt-5">
      <CoachChat aboutWorkoutId={about || undefined} aboutDate={day && ISO.test(day) ? day : undefined} draft={one(sp.draft)?.slice(0, 2000)} />
    </main>
  );
}
