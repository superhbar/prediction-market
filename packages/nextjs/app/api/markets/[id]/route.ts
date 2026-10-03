import { NextResponse } from "next/server";
import { marketToJson } from "~~/utils/markets/marketJson";
import { readMarkets } from "~~/utils/markets/serverReads";
import { tinybarToHbar } from "~~/utils/markets/units";

const ONE_TOKEN = 100_000_000n;

/**
 * One market plus what a single position token redeems for right now, from the contract's own
 * `quotePayout` (0 until the market is settled or voided).
 * GET /api/markets/0 -> { chainId, contract, market: {...}, redeemPerToken: { yes, no } }
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 0) {
    return NextResponse.json({ error: "Market id must be a non-negative integer." }, { status: 400 });
  }
  try {
    const { chainId, contract, config, markets, read } = await readMarkets(() => [id]);
    if (markets.length === 0) return NextResponse.json({ error: `Market ${id} does not exist.` }, { status: 404 });
    const [yes, no] = await Promise.all([
      read<bigint>("quotePayout", [BigInt(id), true, ONE_TOKEN]),
      read<bigint>("quotePayout", [BigInt(id), false, ONE_TOKEN]),
    ]);
    const now = BigInt(Math.floor(Date.now() / 1000));
    return NextResponse.json({
      chainId,
      contract,
      market: marketToJson(id, markets[0].market, now, config),
      redeemPerToken: { yes: { hbar: tinybarToHbar(yes) }, no: { hbar: tinybarToHbar(no) } },
    });
  } catch {
    return NextResponse.json({ error: "Could not read the market from the network." }, { status: 502 });
  }
}
