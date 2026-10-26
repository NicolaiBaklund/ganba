import Link from "next/link";
import { MessageCircle } from "lucide-react";

/** "Ask the coach" from a session or a day: opens the Coach tab with that topic. */
export function AskCoachLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-1.5 self-start text-sm font-semibold text-primary">
      <MessageCircle className="size-4" />
      {label}
    </Link>
  );
}
