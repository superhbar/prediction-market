"use client";

import { useAccount } from "wagmi";
import { useReadContracts } from "wagmi";
import { ErrorState } from "~~/components/markets/States";
import { erc20BalanceAbi } from "~~/hooks/markets/abis";
import { useScaffoldReadContract, useScaffoldWriteContract, useTargetNetwork } from "~~/hooks/scaffold-hbar";
import scaffoldConfig from "~~/scaffold.config";
import { batchReadError } from "~~/utils/markets/readResults";
import { type Market, MarketState } from "~~/utils/markets/types";
import { GAS, formatHbar } from "~~/utils/markets/units";

type RedeemPanelProps = {
  marketId: number;
  market: Market;
};

/** Redeems winning or refundable position tokens; creator withdraws the reserve. */
export function RedeemPanel({ marketId, market }: RedeemPanelProps) {
  const { address: account } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const redeemable = market.state === MarketState.Settled || market.state === MarketState.Voided;

  const {
    data: balances,
    isPending: balancesPending,
    error: balancesError,
    refetch: refetchBalances,
  } = useReadContracts({
    contracts:
      account && redeemable
        ? [market.yesToken, market.noToken].map(token => ({
            address: token,
            abi: erc20BalanceAbi,
            functionName: "balanceOf" as const,
            args: [account] as const,
            chainId: targetNetwork.id,
          }))
        : [],
    query: { enabled: !!account && redeemable, refetchInterval: scaffoldConfig.pollingInterval },
  });

  const yesBalance = balances?.[0]?.status === "success" ? BigInt(balances[0].result as bigint) : 0n;
  const noBalance = balances?.[1]?.status === "success" ? BigInt(balances[1].result as bigint) : 0n;

  const {
    data: yesQuote,
    error: yesQuoteError,
    refetch: refetchYesQuote,
  } = useScaffoldReadContract({
    contractName: "PredictionMarkets",
    functionName: "quotePayout",
    args: [BigInt(marketId), true, yesBalance > 0n ? yesBalance : undefined],
  });
  const {
    data: noQuote,
    error: noQuoteError,
    refetch: refetchNoQuote,
  } = useScaffoldReadContract({
    contractName: "PredictionMarkets",
    functionName: "quotePayout",
    args: [BigInt(marketId), false, noBalance > 0n ? noBalance : undefined],
  });

  const { writeContractAsync, isMining } = useScaffoldWriteContract({
    contractName: "PredictionMarkets",
    disableSimulate: true,
  });

  const redeem = (side: boolean, amount: bigint) =>
    writeContractAsync({
      functionName: "redeem",
      args: [BigInt(marketId), side, amount],
      gas: BigInt(GAS.redeem),
    }).catch(() => {});

  const withdraw = () =>
    writeContractAsync({
      functionName: "withdrawReserve",
      args: [BigInt(marketId)],
      gas: BigInt(GAS.withdrawReserve),
    }).catch(() => {});

  if (!redeemable) {
    return (
      <div className="panel border-dashed p-5">
        <p className="font-semibold m-0">Redeem opens after settlement</p>
        <p className="text-sm mt-1 text-base-content/60 m-0">
          Winning positions can be redeemed once the market settles.
        </p>
      </div>
    );
  }

  const readError = balancesError ?? batchReadError(balances) ?? yesQuoteError ?? noQuoteError;
  const retry = () => {
    void refetchBalances();
    if (yesBalance > 0n) void refetchYesQuote();
    if (noBalance > 0n) void refetchNoQuote();
  };
  const isCreator = !!account && account.toLowerCase() === market.creator.toLowerCase();

  return (
    <div className="panel p-5">
      <p className="text-sm font-semibold text-base-content/70 m-0">Redeem</p>
      {!account && <p className="text-sm mt-2 text-base-content/60">Connect a wallet to see your balances.</p>}
      {account && readError && <ErrorState message="Balances or payouts could not be read." onRetry={retry} />}
      {account && balancesPending && !readError && (
        <p className="text-sm mt-2 text-base-content/60">Loading balances…</p>
      )}
      {account && !balancesPending && !readError && yesBalance === 0n && noBalance === 0n && (
        <p className="text-sm mt-2 text-base-content/60">No position tokens in this account.</p>
      )}
      {!readError && yesBalance > 0n && (
        <div className="flex items-center justify-between gap-2 mt-3 text-sm">
          <span>
            {formatHbar(yesBalance)} YES &middot; pays {yesQuote !== undefined ? formatHbar(yesQuote as bigint) : "-"}
          </span>
          <button
            className="btn btn-sm btn-primary"
            onClick={() => redeem(true, yesBalance)}
            disabled={!account || isMining}
          >
            Redeem YES
          </button>
        </div>
      )}
      {!readError && noBalance > 0n && (
        <div className="flex items-center justify-between gap-2 mt-3 text-sm">
          <span>
            {formatHbar(noBalance)} NO &middot; pays {noQuote !== undefined ? formatHbar(noQuote as bigint) : "-"}
          </span>
          <button
            className="btn btn-sm btn-primary"
            onClick={() => redeem(false, noBalance)}
            disabled={!account || isMining}
          >
            Redeem NO
          </button>
        </div>
      )}
      {isCreator && market.reserve > 0n && (
        <div className="flex items-center justify-between gap-2 mt-4 pt-4 border-t border-base-content/10 text-sm">
          <span>Reserve {formatHbar(market.reserve)} returns to the creator</span>
          <button className="btn btn-sm btn-outline" onClick={withdraw} disabled={isMining}>
            Withdraw reserve
          </button>
        </div>
      )}
    </div>
  );
}
