"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { parseEventLogs } from "viem";
import { usePublicClient } from "wagmi";
import { useChainlinkHistory } from "~~/hooks/markets/useChainlinkHistory";
import { useCreationEstimate } from "~~/hooks/markets/useCreationEstimate";
import { useMarketConfig } from "~~/hooks/markets/useMarketConfig";
import { useDeployedContractInfo, useScaffoldWriteContract, useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { FEED_KEYS } from "~~/utils/markets/feeds";
import { feedKeyToBytes32 } from "~~/utils/markets/feeds";
import {
  GAS,
  decimalToPrice,
  formatPrice,
  hbarToWeibar,
  isPositiveDecimal,
  suggestStrike,
  tinybarToHbar,
} from "~~/utils/markets/units";
import { notification } from "~~/utils/scaffold-hbar";

function toInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const subscribeNoop = () => () => {};

/** Default expiry: one hour from now, rounded up to the next 5 minutes. */
function defaultExpiry(nowMs: number): string {
  const step = 5 * 60 * 1000;
  return toInputValue(new Date(Math.ceil((nowMs + 60 * 60 * 1000) / step) * step));
}

const NewMarketPage = () => {
  const router = useRouter();
  const { targetNetwork } = useTargetNetwork();
  const publicClient = usePublicClient({ chainId: targetNetwork.id });
  const { data: deployed } = useDeployedContractInfo({ contractName: "PredictionMarkets" });
  const { config } = useMarketConfig();
  const [feed, setFeed] = useState<string>(FEED_KEYS[0]);
  const [strike, setStrike] = useState("");
  const [strikeTouched, setStrikeTouched] = useState(false);
  const [expiryInput, setExpiryInput] = useState<string | null>(null);
  const [valueHbar, setValueHbar] = useState("");
  const [valueTouched, setValueTouched] = useState(false);

  const { currentPrice, isLoading: priceLoading } = useChainlinkHistory(feed);
  const { suggestedHbar, hbarPerUsd, isLoading: estimateLoading } = useCreationEstimate(config?.minReserve);
  const { writeContractAsync, isMining } = useScaffoldWriteContract({
    contractName: "PredictionMarkets",
    disableSimulate: true,
  });

  const [nowMs] = useState(() => Date.now());
  // Expiry inputs use the browser's local time zone, so they render only after hydration:
  // the server's clock and zone would otherwise produce a different value and a hydration error.
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
  const expiryValue = expiryInput ?? (mounted ? defaultExpiry(nowMs) : "");
  const liveStrike = currentPrice ? suggestStrike(currentPrice.normalized) : "";
  const strikeValue = strikeTouched ? strike : liveStrike;
  const paymentValue = valueTouched ? valueHbar : suggestedHbar !== "" ? suggestedHbar : valueHbar;

  const bounds = useMemo(() => {
    if (!config) return null;
    return {
      min: new Date(nowMs + Number(config.minDuration) * 1000),
      max: new Date(nowMs + Number(config.maxDuration) * 1000),
    };
  }, [config, nowMs]);

  const expirySec = useMemo(() => {
    const time = new Date(expiryValue).getTime();
    return Number.isNaN(time) ? null : Math.floor(time / 1000);
  }, [expiryValue]);

  const expiryError =
    expirySec === null || !bounds
      ? null
      : expirySec < Math.floor(bounds.min.getTime() / 1000)
        ? `Expiry must be after ${bounds.min.toLocaleString()}.`
        : expirySec > Math.floor(bounds.max.getTime() / 1000)
          ? `Expiry must be before ${bounds.max.toLocaleString()}.`
          : null;

  const canSubmit =
    isPositiveDecimal(strikeValue) && expirySec !== null && expiryError === null && isPositiveDecimal(paymentValue);

  const create = async () => {
    if (!canSubmit || expirySec === null) {
      notification.error("Complete every field with a valid value.");
      return;
    }
    try {
      const hash = await writeContractAsync({
        functionName: "createMarket",
        args: [feedKeyToBytes32(feed), decimalToPrice(strikeValue), BigInt(expirySec)],
        value: hbarToWeibar(paymentValue),
        gas: BigInt(GAS.createMarket),
      });
      let nextId: string | null = null;
      if (hash && publicClient && deployed) {
        // Take the id from this transaction's own MarketCreated log: marketCount() - 1 could be
        // another creator's market if one landed in between.
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        const [created] = parseEventLogs({
          abi: deployed.abi,
          eventName: "MarketCreated",
          logs: receipt.logs.filter(log => log.address.toLowerCase() === deployed.address.toLowerCase()),
        });
        if (created) nextId = created.args.marketId.toString();
      }
      router.push(nextId === null ? "/" : `/markets/${nextId}`);
    } catch {
      // Notification is handled by the scaffold transactor.
    }
  };

  return (
    <div className="shell page">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold m-0">Create market</h1>
        <p className="mt-2 mb-0 text-base-content/60">
          Pick a feed, set the strike and expiry. Creation books the settlement schedule and mints both position tokens.
        </p>

        <div className="panel p-5 md:p-6 mt-6 space-y-5">
          <div>
            <label className="text-sm font-medium block mb-2" htmlFor="feed">
              Price feed
            </label>
            <select id="feed" className="select w-full" value={feed} onChange={event => setFeed(event.target.value)}>
              {FEED_KEYS.map(key => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium block mb-2" htmlFor="strike">
              Strike (USD)
            </label>
            <input
              id="strike"
              className="input w-full text-lg font-semibold tabular-nums"
              value={strikeValue}
              inputMode="decimal"
              placeholder={priceLoading ? "Reading live price…" : "0.30"}
              onChange={event => {
                setStrike(event.target.value);
                setStrikeTouched(true);
              }}
            />
            <p className="text-sm text-base-content/60 mt-2 mb-0">
              {currentPrice ? (
                <>Live Chainlink price: {formatPrice(currentPrice.normalized)}.</>
              ) : priceLoading ? (
                "Reading the live on-chain price…"
              ) : (
                "Live price is unavailable. Enter a strike by hand."
              )}{" "}
              YES wins at or above strike.
            </p>
          </div>

          <div>
            <label className="text-sm font-medium block mb-2" htmlFor="expiry">
              Expiry
            </label>
            <input
              id="expiry"
              type="datetime-local"
              className="input w-full"
              value={expiryValue}
              min={mounted && bounds ? toInputValue(bounds.min) : undefined}
              max={mounted && bounds ? toInputValue(bounds.max) : undefined}
              onChange={event => setExpiryInput(event.target.value)}
            />
            <p className="text-sm text-base-content/60 mt-2 mb-0">
              {config ? (
                <>
                  Between {Number(config.minDuration) / 60} minutes and {Number(config.maxDuration) / 86400} days from
                  now. Minimum reserve {tinybarToHbar(config.minReserve)} HBAR.
                </>
              ) : (
                "Loading limits…"
              )}
            </p>
            {expiryError && <p className="text-sm text-error mt-1">{expiryError}</p>}
          </div>

          <div>
            <label className="text-sm font-medium block mb-2" htmlFor="value">
              Payment (HBAR)
            </label>
            <input
              id="value"
              className="input w-full text-lg font-semibold tabular-nums"
              value={paymentValue}
              inputMode="decimal"
              placeholder={estimateLoading ? "Estimating…" : suggestedHbar}
              onChange={event => {
                setValueHbar(event.target.value);
                setValueTouched(true);
              }}
            />
            <p className="text-sm text-base-content/60 mt-2 mb-0">
              {hbarPerUsd !== undefined ? (
                <>
                  Covers two token creations at {hbarPerUsd.toFixed(2)} HBAR per $1, plus the settlement reserve. You
                  can edit it.
                </>
              ) : (
                "Estimate is loading. You can edit the amount."
              )}
            </p>
          </div>

          <button className="btn btn-primary w-full" onClick={create} disabled={!canSubmit || isMining}>
            {isMining ? "Creating…" : "Create market"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewMarketPage;
