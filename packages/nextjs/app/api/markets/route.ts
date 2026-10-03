import { NextResponse } from "next/server";
import { marketToJson } from "~~/utils/markets/marketJson";
import { readMarkets } from "~~/utils/markets/serverReads";

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 100;

/**
 * Read-only market list for scripts and agents, newest first.
 * GET /api/markets?limit=24 -> { chainId, contract, count, markets: [...] }
 */
export async function GET(request: Request) {
  const requested = Number(new URL(request.url).searchParams.get("limit") ?? DEFAULT_LIMIT);
  const limit = Number.isInteger(requested) && requested > 0 ? Math.min(requested, MAX_LIMIT) : DEFAULT_LIMIT;
  try {
    const { chainId, contract, count, config, markets } = await readMarkets(total =>
      Array.from({ length: Math.min(total, limit) }, (_, index) => total - 1 - index),
    );
    const now = BigInt(Math.floor(Date.now() / 1000));
    return NextResponse.json({
      chainId,
      contract,
      count,
      markets: markets.map(({ id, market }) => marketToJson(id, market, now, config)),
    });
  } catch {
    return NextResponse.json({ error: "Could not read markets from the network." }, { status: 502 });
  }
}
