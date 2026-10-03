"use client";

import { useEffect, useState } from "react";

/**
 * Seconds since epoch, ticking once a second. Pages render market status only after their client-side reads
 * resolve, so reading the clock in the initializer cannot cause a hydration mismatch.
 */
export function useNow(): bigint {
  const [now, setNow] = useState(() => BigInt(Math.floor(Date.now() / 1000)));
  useEffect(() => {
    const timer = setInterval(() => setNow(BigInt(Math.floor(Date.now() / 1000))), 1_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
