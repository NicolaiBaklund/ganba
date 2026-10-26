import { requireUser } from "@/lib/supabase/server";
import { CoachChat } from "@/components/coach/CoachChat";
import { isRealDate } from "@/lib/recovery/dates";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** The Coach tab: one ongoing conversation. `about` (session id), `day` and `draft` come from links elsewhere. */
export default async function CoachPage({ searchParams }: PageProps<"/coach">) {
  await requireUser();
  const sp = await searchParams;
  const about = one(sp.about);
  const day = one(sp.day);
  return (
    <main className="flex h-[calc(100dvh-4.5rem-env(safe-area-inset-bottom))] flex-col px-[18px] pt-5">
      <CoachChat aboutWorkoutId={about && UUID.test(about) ? about : undefined} aboutDate={day && isRealDate(day) ? day : undefined} draft={one(sp.draft)?.slice(0, 2000)} />
    </main>
  );
}
