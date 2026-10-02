import { NextResponse } from "next/server";

const HEX_ID = /^0x[0-9a-fA-F]{64}$/;

/**
 * Server-only Pyth Hermes proxy. The API key never reaches the browser.
 * GET /api/pyth?status=1 -> { enabled: boolean }
 * GET /api/pyth?id=<pythId>&publishTime=<unix> -> { enabled: true, updateData: ["0x..."] }
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const statusOnly = url.searchParams.get("status") === "1";
  const apiKey = process.env.PYTH_API_KEY;

  if (!apiKey) {
    if (statusOnly) {
      return NextResponse.json({ enabled: false });
    }
    return NextResponse.json({ enabled: false, error: "Pyth fallback is not configured." }, { status: 501 });
  }

  if (statusOnly) {
    return NextResponse.json({ enabled: true });
  }

  const id = url.searchParams.get("id") ?? "";
  const publishTimeRaw = url.searchParams.get("publishTime") ?? "";
  if (!HEX_ID.test(id)) {
    return NextResponse.json({ enabled: true, error: "Invalid Pyth price id." }, { status: 400 });
  }
  if (!/^\d+$/.test(publishTimeRaw)) {
    return NextResponse.json({ enabled: true, error: "Invalid publish time." }, { status: 400 });
  }

  const base = process.env.PYTH_HERMES_URL ?? "https://hermes.pyth.network";
  const endpoint = `${base}/v2/updates/price/${publishTimeRaw}?ids[]=${id}&encoding=hex`;
  try {
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      return NextResponse.json(
        { enabled: true, error: `Hermes request failed with status ${response.status}.` },
        { status: 502 },
      );
    }
    const data = (await response.json()) as { binary?: { data?: string[] } };
    const updateData = data.binary?.data;
    if (!Array.isArray(updateData) || updateData.length === 0) {
      return NextResponse.json({ enabled: true, error: "No Pyth update for this publish time." }, { status: 404 });
    }
    const hexed = updateData.map(entry => (entry.startsWith("0x") ? entry : `0x${entry}`));
    return NextResponse.json({ enabled: true, updateData: hexed });
  } catch {
    return NextResponse.json({ enabled: true, error: "Hermes request timed out." }, { status: 504 });
  }
}
