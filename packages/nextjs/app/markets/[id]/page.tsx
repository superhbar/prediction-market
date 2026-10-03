import { MarketDetail } from "./MarketDetail";

type MarketPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ side?: string }>;
};

/** `?side=no` preselects NO in the stake panel, so "Buy No" on a market card lands ready to trade. */
const MarketPage = async ({ params, searchParams }: MarketPageProps) => {
  const { id } = await params;
  const { side } = await searchParams;
  return <MarketDetail id={id} initialSide={side === "no" ? "NO" : "YES"} />;
};

export default MarketPage;
