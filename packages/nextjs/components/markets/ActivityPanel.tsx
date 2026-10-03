"use client";

import { useMarketActivity } from "~~/hooks/markets/useMarketActivity";
import { useDeployedContractInfo, useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { formatUtc } from "~~/utils/markets/activity";
import { hashscanLink } from "~~/utils/markets/hashscan";

/** `0x1234...5678` short form for account addresses. */
function shortAddress(address: string): string {
  return address.length > 10 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;
}

/**
 * Newest-first on-chain history for one market, read from the mirror node:
 * stakes, scheduled settlement retries, settlement, redeems and reserve
 * withdrawals. Every entry links to its transaction on Hashscan. Failures stay
 * inside the panel and never crash the page.
 */
export function ActivityPanel({ marketId }: { marketId: string }) {
  const { targetNetwork } = useTargetNetwork();
  const { data: contract } = useDeployedContractInfo({ contractName: "PredictionMarkets" });
  const contractAddress = contract?.address;
  const { entries, isLoading, truncated, error, refetch } = useMarketActivity(marketId);

  return (
    <div>
      <h2 className="font-editorial font-bold text-2xl mt-10 mb-5">Activity</h2>
      {isLoading && entries.length === 0 ? (
        <div className="border border-base-300 bg-base-100 p-6" aria-hidden>
          <div className="h-4 w-2/3 bg-base-300 animate-pulse" />
          <div className="h-3 w-1/3 bg-base-300 animate-pulse mt-3" />
          <div className="h-4 w-1/2 bg-base-300 animate-pulse mt-5" />
          <div className="h-3 w-1/4 bg-base-300 animate-pulse mt-3" />
        </div>
      ) : error ? (
        <div className="border border-base-300 bg-base-100 p-6 text-center">
          <p className="font-editorial italic text-lg m-0">Activity is unavailable right now</p>
          <p className="text-sm text-base-content/70 mt-1 m-0">
            The mirror node did not answer. The rest of the page is unaffected.
          </p>
          <button className="btn btn-sm btn-outline mt-4" onClick={refetch}>
            Retry
          </button>
        </div>
      ) : entries.length === 0 && !truncated ? (
        <div className="border border-dashed border-base-300 p-6">
          <p className="font-editorial italic text-lg m-0">No activity yet</p>
          <p className="text-sm mt-1 opacity-70 m-0">Stakes, settlement and redemptions will appear here.</p>
        </div>
      ) : (
        <ol className="list-none m-0 p-0 border border-base-300 bg-base-100 divide-y divide-base-300">
          {entries.map((entry, index) => (
            <li key={`${entry.transactionHash}-${entry.kind}-${index}`} className="p-4">
              <p className="font-semibold m-0 text-[15px]">{entry.label}</p>
              <p className="text-sm text-base-content/60 m-0 mt-1">
                {entry.account && <span>{shortAddress(entry.account)} &middot; </span>}
                {formatUtc(entry.timestamp)}
                {entry.detail && <span> &middot; {entry.detail}</span>}
              </p>
              <a
                href={hashscanLink(targetNetwork.id, "transaction", entry.transactionHash)}
                target="_blank"
                rel="noreferrer"
                className="link text-primary text-sm"
              >
                View on Hashscan
              </a>
            </li>
          ))}
        </ol>
      )}
      {truncated && !error && (
        <p className="text-sm text-base-content/60 mt-3 mb-0">
          Older events of this market are beyond the 2,000 most recent contract events and are not shown. The full
          history is on{" "}
          <a
            href={hashscanLink(targetNetwork.id, "contract", contractAddress ?? "")}
            target="_blank"
            rel="noreferrer"
            className="link"
          >
            Hashscan
          </a>
          .
        </p>
      )}
    </div>
  );
}
