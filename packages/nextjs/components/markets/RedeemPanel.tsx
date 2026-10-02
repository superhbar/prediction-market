"use client";

import { useAccount } from "wagmi";
import { useReadContracts } from "wagmi";
import { erc20BalanceAbi } from "~~/hooks/markets/abis";
import { useScaffoldReadContract, useScaffoldWriteContract, useTargetNetwork } from "~~/hooks/scaffold-hbar";
import type { Market } from "~~/utils/markets/types";
import { GAS, formatHbar } from "~~/utils/markets/units";

type RedeemPanelProps = {
  marketId: number;
  market: Market;
};

/** Redeems winning or refundable position tokens; creator withdraws the reserve. */
export function RedeemPanel({ marketId, market }: RedeemPanelProps) {
  const { address: account } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const redeemable = market.state === 1 || market.state === 2;

  const { data: balances } = useReadContracts({
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
    query: { enabled: !!account && redeemable },
  });

  const yesBalance = balances?.[0]?.status === "success" ? BigInt(balances[0].result as bigint) : 0n;
  const noBalance = balances?.[1]?.status === "success" ? BigInt(balances[1].result as bigint) : 0n;

  const { data: yesQuote } = useScaffoldReadContract({
    contractName: "PredictionMarkets",
    functionName: "quotePayout",
    args: [BigInt(marketId), true, yesBalance > 0n ? yesBalance : undefined],
  });
  const { data: noQuote } = useScaffoldReadContract({
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
      <div className="border border-dashed border-base-300 p-6 mt-4">
        <p className="font-editorial italic text-lg m-0">Redeem opens after settlement</p>
        <p className="text-sm mt-1 opacity-70 m-0">Winning positions can be redeemed once the market settles.</p>
      </div>
    );
  }

  const isCreator = !!account && account.toLowerCase() === market.creator.toLowerCase();

  return (
    <div className="border border-base-300 bg-base-100 p-6 mt-4">
      <p className="text-[12px] uppercase tracking-[0.2em] text-base-content/60 m-0">Redeem</p>
      {!account && <p className="text-sm mt-2 opacity-70">Connect a wallet to see your balances.</p>}
      {account && yesBalance === 0n && noBalance === 0n && (
        <p className="text-sm mt-2 opacity-70">No position tokens in this account.</p>
      )}
      {yesBalance > 0n && (
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
      {noBalance > 0n && (
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
        <div className="flex items-center justify-between gap-2 mt-4 pt-4 border-t border-base-300 text-sm">
          <span>Reserve {formatHbar(market.reserve)} returns to the creator</span>
          <button className="btn btn-sm btn-outline" onClick={withdraw} disabled={isMining}>
            Withdraw reserve
          </button>
        </div>
      )}
    </div>
  );
}
