"use client";

import { useEffect, useState } from "react";
import { formatCountdown } from "~~/utils/markets/question";

type CountdownProps = {
  /** Target unix timestamp in seconds. */
  targetSec: bigint;
  label: string;
};

/** Live countdown to a unix timestamp, ticking every 30 seconds. */
export function Countdown({ targetSec, label }: CountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const deltaMs = Number(targetSec) * 1000 - now;
  const text = deltaMs <= 0 ? "Closed" : formatCountdown(deltaMs);

  return (
    <span className="whitespace-nowrap">
      {label} <strong className="text-primary">{text}</strong>
    </span>
  );
}
