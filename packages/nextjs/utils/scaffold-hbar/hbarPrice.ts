export const HBAR_PRICE_CACHE_DURATION_MS = 60 * 1000;

/**
 * Same-origin API route that proxies the Hedera mainnet mirrornode exchange rate.
 * Using a same-origin path keeps the browser fetch local (no external DNS resolution),
 * which prevents ERR_NAME_NOT_RESOLVED in sandboxed/CI environments like Playwright.
 */
export const HBAR_PRICE_URL = "/api/hbar-price";

type HbarPriceCache = {
  price: number;
  timestamp: number;
};

type ExchangeRateResponse = {
  current_rate?: { cent_equivalent?: number; hbar_equivalent?: number };
};

let cache: HbarPriceCache | null = null;

/** USD price of 1 HBAR from an exchange rate response, or 0 when the response is malformed. */
export function priceFromExchangeRate(data: ExchangeRateResponse): number {
  const cents = data.current_rate?.cent_equivalent ?? 0;
  const hbars = data.current_rate?.hbar_equivalent ?? 0;
  return cents > 0 && hbars > 0 ? cents / hbars / 100 : 0;
}

export async function fetchHbarPrice(): Promise<number> {
  const now = Date.now();
  if (cache && now - cache.timestamp < HBAR_PRICE_CACHE_DURATION_MS) {
    return cache.price;
  }

  try {
    const response = await fetch(HBAR_PRICE_URL, { signal: AbortSignal.timeout(10_000) });
    const data = (await response.json()) as { price?: number } & ExchangeRateResponse;
    // The local API route returns { price }, but keep priceFromExchangeRate as a
    // fallback parser in case the response shape changes or tests mock it differently.
    const price = typeof data.price === "number" ? data.price : priceFromExchangeRate(data);
    cache = { price, timestamp: now };
    return price;
  } catch (error) {
    console.warn("Failed to fetch HBAR price:", error);
    return cache?.price ?? 0;
  }
}
