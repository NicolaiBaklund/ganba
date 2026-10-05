"use client";

import { useState } from "react";
import type { ISODate } from "@loop/core";
import type { RecoveryView } from "@/lib/recovery/view";
import { FindingsList } from "./FindingsList";
import { RecoveryCurves } from "./RecoveryCurves";
import { MoreLists } from "./MoreLists";
import { DaySheet } from "./DaySheet";

export function RecoveryScreen({ view, top, whySlot }: { view: RecoveryView; top?: React.ReactNode; whySlot?: (date: ISODate) => React.ReactNode }) {
  const [day, setDay] = useState<ISODate | null>(null);
  return (
    <>
      {top}
      <FindingsList findings={view.findings} />
      <RecoveryCurves curves={view.curves} onPick={setDay} />
      <MoreLists noEffect={view.noEffect} needsData={view.needsData} />
      <DaySheet date={day} onClose={() => setDay(null)} whySlot={whySlot} />
    </>
  );
}
