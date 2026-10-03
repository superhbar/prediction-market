import { MarketDetail } from "./MarketDetail";

type MarketPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ side?: string }>;
};

/** `?side=no` preselects NO in the stake panel, so "Stake No" on a market card lands ready to stake. */
const MarketPage = async ({ params, searchParams }: MarketPageProps) => {
  const { id } = await params;
  const { side } = await searchParams;
  return <MarketDetail id={id} initialSide={side === "no" ? "NO" : "YES"} />;
};

export default MarketPage;
