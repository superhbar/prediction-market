import { NextResponse } from "next/server";

const MIRRORNODE_URL = "https://mainnet.mirrornode.hedera.com/api/v1/network/exchangerate";

type ExchangeRateResponse = {
  current_rate?: { cent_equivalent?: number; hbar_equivalent?: number };
};

/**
 * Server-side proxy for the Hedera mainnet mirrornode exchange rate endpoint.
 * Fetching from the server avoids browser CORS/DNS restrictions in sandboxed
 * environments (CI, Playwright). Returns { price: number } in USD.
 * GET /api/hbar-price -> { price: number }
 */
export async function GET() {
  try {
    const response = await fetch(MIRRORNODE_URL, {
      signal: AbortSignal.timeout(10_000),
      next: { revalidate: 60 },
    });
    if (!response.ok) {
      return NextResponse.json({ price: 0, error: `Upstream ${response.status}` }, { status: 502 });
    }
    const data = (await response.json()) as ExchangeRateResponse;
    const cents = data.current_rate?.cent_equivalent ?? 0;
    const hbars = data.current_rate?.hbar_equivalent ?? 0;
    const price = cents > 0 && hbars > 0 ? cents / hbars / 100 : 0;
    return NextResponse.json({ price });
  } catch {
    return NextResponse.json({ price: 0, error: "Exchange rate fetch failed" }, { status: 504 });
  }
}
