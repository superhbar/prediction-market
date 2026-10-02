import { MarketDetail } from "./MarketDetail";

const MarketPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  return <MarketDetail id={id} />;
};

export default MarketPage;
