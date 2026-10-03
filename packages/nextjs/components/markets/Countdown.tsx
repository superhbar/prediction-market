"use client";

import { useEffect, useState } from "react";
import { formatCountdown } from "~~/utils/markets/question";

type CountdownProps = {
  /** Target unix timestamp in seconds. */
  targetSec: bigint;
  label: string;
};

/** Live countdown to a unix timestamp, ticking every second. */
export function Countdown({ targetSec, label }: CountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const deltaMs = Number(targetSec) * 1000 - now;
  const text = deltaMs <= 0 ? "Closed" : formatCountdown(deltaMs);

  return (
    <span className="whitespace-nowrap">
      {label} {/* Server and client render different seconds; the client value wins on the first tick. */}
      <strong className="font-semibold text-base-content tabular-nums" suppressHydrationWarning>
        {text}
      </strong>
    </span>
  );
}
