"use client";

import Link from "next/link";
import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { CalendarDays, Footprints, Scale, Utensils } from "lucide-react";
import { cn } from "@/lib/utils";
import { PlusMenu } from "./PlusMenu";

const LEFT = [
  { href: "/today", key: "today", Icon: CalendarDays },
  { href: "/training", key: "training", Icon: Footprints },
] as const;
const RIGHT = [
  { href: "/food", key: "food", Icon: Utensils },
  { href: "/body", key: "body", Icon: Scale },
] as const;

export function BottomNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();

  const item = ({ href, key, Icon }: (typeof LEFT)[number] | (typeof RIGHT)[number]) => {
    const active = pathname.startsWith(href);
    return (
      <Link
        key={href}
        href={href}
        className={cn(
          "flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium",
          active ? "text-primary" : "text-muted-foreground",
        )}
      >
        <Icon className="size-5" />
        {t(key)}
      </Link>
    );
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-md items-center px-2">
        {LEFT.map(item)}
        <div className="flex flex-1 justify-center">
          <Suspense>
            <PlusMenu />
          </Suspense>
        </div>
        {RIGHT.map(item)}
      </div>
    </nav>
  );
}
