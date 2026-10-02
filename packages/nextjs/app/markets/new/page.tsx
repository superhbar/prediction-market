"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
  priceToDecimal,
  tinybarToHbar,
} from "~~/utils/markets/units";
import { notification } from "~~/utils/scaffold-hbar";

function toInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
  const [expiryInput, setExpiryInput] = useState("");
  const [valueHbar, setValueHbar] = useState("");
  const [valueTouched, setValueTouched] = useState(false);

  const { currentPrice, isLoading: priceLoading } = useChainlinkHistory(feed);
  const { suggestedHbar, hbarPerUsd, isLoading: estimateLoading } = useCreationEstimate(config?.minReserve);
  const { writeContractAsync, isMining } = useScaffoldWriteContract({
    contractName: "PredictionMarkets",
    disableSimulate: true,
  });

  const [nowMs] = useState(() => Date.now());
  const liveStrike = currentPrice ? priceToDecimal(currentPrice.normalized) : "";
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
    const time = new Date(expiryInput).getTime();
    return Number.isNaN(time) ? null : Math.floor(time / 1000);
  }, [expiryInput]);

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
        await publicClient.waitForTransactionReceipt({ hash });
        const count = (await publicClient.readContract({
          address: deployed.address,
          abi: deployed.abi,
          functionName: "marketCount",
        })) as bigint;
        if (count > 0n) nextId = (count - 1n).toString();
      }
      router.push(nextId === null ? "/" : `/markets/${nextId}`);
    } catch {
      // Notification is handled by the scaffold transactor.
    }
  };

  return (
    <div className="max-w-[760px] mx-auto px-6 w-full pb-16">
      <p className="text-[12px] uppercase tracking-[0.2em] mt-10 text-base-content/60 m-0">New market</p>
      <h1 className="font-editorial font-black leading-[1.02] mt-3 text-4xl md:text-5xl">Open a market</h1>
      <p className="mt-4 text-[15px] leading-relaxed opacity-80">
        Pick a feed, set the strike and expiry. Creation books the settlement schedule and mints both position tokens.
      </p>

      <div className="border border-base-300 bg-base-100 p-7 mt-8 space-y-6">
        <div>
          <label className="text-sm font-medium block mb-2" htmlFor="feed">
            Price feed
          </label>
          <select
            id="feed"
            className="select select-bordered w-full"
            value={feed}
            onChange={event => setFeed(event.target.value)}
          >
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
            className="input input-bordered w-full font-editorial text-xl"
            value={strikeValue}
            inputMode="decimal"
            placeholder={priceLoading ? "Reading live price…" : "0.30"}
            onChange={event => {
              setStrike(event.target.value);
              setStrikeTouched(true);
            }}
          />
          <p className="text-sm opacity-70 mt-1">
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
            className="input input-bordered w-full"
            value={expiryInput}
            min={bounds ? toInputValue(bounds.min) : undefined}
            max={bounds ? toInputValue(bounds.max) : undefined}
            onChange={event => setExpiryInput(event.target.value)}
          />
          <p className="text-sm opacity-70 mt-1">
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
            className="input input-bordered w-full font-editorial text-xl"
            value={paymentValue}
            inputMode="decimal"
            placeholder={estimateLoading ? "Estimating…" : suggestedHbar}
            onChange={event => {
              setValueHbar(event.target.value);
              setValueTouched(true);
            }}
          />
          <p className="text-sm opacity-70 mt-1">
            {hbarPerUsd !== undefined ? (
              <>Covers two token creations at ${hbarPerUsd.toFixed(2)} HBAR per $1 plus reserve. Editable.</>
            ) : (
              "Estimate is loading. You can edit the amount."
            )}
          </p>
        </div>

        <button className="btn btn-primary w-full rounded-full" onClick={create} disabled={!canSubmit || isMining}>
          {isMining ? "Creating…" : "Create market"}
        </button>
      </div>
    </div>
  );
};

export default NewMarketPage;
