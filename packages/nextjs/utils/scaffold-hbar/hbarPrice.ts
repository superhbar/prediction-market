export const HBAR_PRICE_CACHE_DURATION_MS = 60 * 1000;
/**
 * The network's own HBAR/USD rate, published by the mainnet mirror node and used by Hedera to price
 * fees. It needs no API key, sends CORS headers and is not rate limited like third-party price APIs.
 */
export const HBAR_PRICE_URL = "https://mainnet.mirrornode.hedera.com/api/v1/network/exchangerate";

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
    const price = priceFromExchangeRate((await response.json()) as ExchangeRateResponse);
    cache = { price, timestamp: now };
    return price;
  } catch (error) {
    console.warn("Failed to fetch HBAR price:", error);
    return cache?.price ?? 0;
  }
}
