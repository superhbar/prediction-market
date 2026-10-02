import { useCallback, useEffect, useState } from "react";
import { HBAR_PRICE_CACHE_DURATION_MS, fetchHbarPrice } from "~~/utils/scaffold-hbar";

export function useFetchHbarPrice(): { price: number; isLoading: boolean } {
  const [price, setPrice] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    const value = await fetchHbarPrice();
    setPrice(value);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    // State updates happen in the async fetch callback, not synchronously in the effect.
    fetchHbarPrice().then(value => {
      if (cancelled) return;
      setPrice(value);
      setIsLoading(false);
    });
    const interval = setInterval(refresh, HBAR_PRICE_CACHE_DURATION_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [refresh]);

  return { price, isLoading };
}
