"use client";

import { useEffect, useState } from "react";

/** Seconds since epoch, updated on the client so server and hydration renders agree. */
export function useNow(): bigint {
  const [now, setNow] = useState(0n);
  useEffect(() => {
    const update = () => setNow(BigInt(Math.floor(Date.now() / 1000)));
    const initial = setTimeout(update, 0);
    const timer = setInterval(update, 1_000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, []);
  return now;
}
