"use client";

import { useState } from "react";
import type { Address } from "viem";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { AssociationPrompt } from "~~/components/markets/AssociationPrompt";
import { useNow } from "~~/hooks/markets/useNow";
import { useSaucerPool } from "~~/hooks/markets/useSaucerPool";
import { useTokenAssociation } from "~~/hooks/markets/useTokenAssociation";
import { useTargetNetwork, useTransactor } from "~~/hooks/scaffold-hbar";
import scaffoldConfig from "~~/scaffold.config";
import { hashscanLink } from "~~/utils/markets/hashscan";
import {
  EXCHANGE_RATE_PRECOMPILE,
  SAUCERSWAP,
  SWAP_DEADLINE_SECONDS,
  erc20ApproveAbi,
  exchangeRateAbi,
  minimumOut,
  poolDepth,
  saucerFactoryAbi,
  saucerRouterAbi,
} from "~~/utils/markets/saucerswap";
import { type Market, MarketState } from "~~/utils/markets/types";
import {
  GAS,
  formatHbar,
  formatMultiple,
  hbarToTinybar,
  impliedChanceBps,
  isPositiveDecimal,
  payoutMultipleBps,
  tinybarToWeibar,
} from "~~/utils/markets/units";

type Side = "YES" | "NO";
type Mode = "buy" | "sell";

const deadline = () => BigInt(Math.floor(Date.now() / 1000)) + SWAP_DEADLINE_SECONDS;

/**
 * Trade a position before settlement on SaucerSwap V1. Staking adds to the market's pools at the pool-share
 * rate; this panel buys from or sells to whoever provides liquidity, at the AMM price. Quotes come from the
 * router's getAmountsOut; nothing here computes a payout.
 */
export function TradePanel({
  market,
  embedded = false,
}: {
  market: Market;
  /** Rendered inside PositionCard, which supplies the panel frame and the tab that names it. */
  embedded?: boolean;
}) {
  const { targetNetwork } = useTargetNetwork();
  const deployment = SAUCERSWAP[targetNetwork.id];
  const [side, setSide] = useState<Side>("YES");
  const token = side === "YES" ? market.yesToken : market.noToken;
  const pool = useSaucerPool(token);
  const nowSec = useNow();

  if (!deployment || market.state !== MarketState.Open) return null;

  return (
    <section className={embedded ? "" : "panel p-5"}>
      <div className="flex items-center justify-between gap-2">
        {embedded ? (
          <p className="text-sm text-base-content/60 m-0">
            Buy or sell YES and NO tokens on SaucerSwap at the pool price.
          </p>
        ) : (
          <p className="text-sm font-semibold text-base-content/70 m-0">Trade on SaucerSwap</p>
        )}
        {pool.pair && (
          <a
            href={hashscanLink(targetNetwork.id, "contract", pool.pair)}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-primary shrink-0"
          >
            Pool on Hashscan
          </a>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 mt-3" role="radiogroup" aria-label="Outcome">
        {(["YES", "NO"] as const).map(option => {
          const selected = side === option;
          const yes = option === "YES";
          return (
            <button
              key={option}
              role="radio"
              aria-checked={selected}
              onClick={() => setSide(option)}
              className={`py-3 rounded-xl font-semibold transition-colors ${
                yes
                  ? selected
                    ? "bg-yes text-base-200"
                    : "bg-yes/10 text-yes hover:bg-yes/20"
                  : selected
                    ? "bg-no text-base-200"
                    : "bg-no/10 text-no hover:bg-no/20"
              }`}
            >
              {yes ? "Yes" : "No"}
            </button>
          );
        })}
      </div>
      {pool.status === "loading" ? (
        <p className="text-sm mt-4 mb-0 text-base-content/60">Looking for a pool…</p>
      ) : pool.status === "error" ? (
        <div className="mt-4 text-sm text-base-content/70">
          <p className="m-0">Could not read the SaucerSwap pool.</p>
          <button className="btn btn-sm btn-ghost mt-2 border-base-300" onClick={pool.refetch}>
            Retry
          </button>
        </div>
      ) : pool.status === "ready" && pool.reserves ? (
        <SwapForm
          side={side}
          token={token}
          price={pool.price}
          reserves={pool.reserves}
          sidePool={side === "YES" ? market.yesPool : market.noPool}
          otherPool={side === "YES" ? market.noPool : market.yesPool}
          expired={nowSec >= market.expiry}
          router={deployment.router}
          whbarToken={deployment.whbarToken}
          onDone={pool.refetch}
        />
      ) : (
        <OpenPoolForm
          side={side}
          token={token}
          router={deployment.router}
          factory={deployment.factory}
          onDone={pool.refetch}
        />
      )}
    </section>
  );
}

type SwapFormProps = {
  side: Side;
  token: Address;
  price: bigint | undefined;
  reserves: { hbar: bigint; token: bigint };
  sidePool: bigint;
  otherPool: bigint;
  /** Pools are final after expiry, so the payout and the implied chance stop being estimates. */
  expired: boolean;
  router: Address;
  whbarToken: Address;
  onDone: () => void;
};

function SwapForm({
  side,
  token,
  price,
  reserves,
  sidePool,
  otherPool,
  expired,
  router,
  whbarToken,
  onDone,
}: SwapFormProps) {
  const { address: account, chainId: walletChainId } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const [mode, setMode] = useState<Mode>("buy");
  const [amount, setAmount] = useState("1");
  const { writeContractAsync } = useWriteContract();
  const transact = useTransactor();
  // Covers the whole approve-then-swap sequence through its receipts, not only the wallet prompt.
  const [busy, setBusy] = useState(false);
  const wrongNetwork = !!account && walletChainId !== targetNetwork.id;
  // A buy sends the token to the buyer, which fails when the account has no free association slot. The check runs
  // in both modes, so switching to Buy never shows an answer from before a sell.
  const { association, associate, isAssociating } = useTokenAssociation(token, true);
  const blockedByAssociation = mode === "buy" && (association === "checking" || association === "needs-association");

  const amountValid = isPositiveDecimal(amount);
  // Position tokens and tinybar both have 8 decimals, so one parser serves both directions.
  const amountIn = amountValid ? hbarToTinybar(amount) : 0n;
  const path = mode === "buy" ? [whbarToken, token] : [token, whbarToken];

  const { data: amountsOut, refetch: refetchQuote } = useReadContract({
    address: router,
    abi: saucerRouterAbi,
    functionName: "getAmountsOut",
    args: amountIn > 0n ? [amountIn, path] : undefined,
    chainId: targetNetwork.id,
    // The minimum output comes from this quote, so it follows the pool as other trades move it.
    query: { enabled: amountIn > 0n, refetchInterval: scaffoldConfig.pollingInterval },
  });
  const quoted = amountsOut ? (amountsOut as readonly bigint[])[1] : undefined;

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: token,
    abi: erc20ApproveAbi,
    functionName: "allowance",
    args: account ? [account, router] : undefined,
    chainId: targetNetwork.id,
    query: { enabled: !!account && mode === "sell" },
  });
  const needsApproval = mode === "sell" && amountIn > 0n && ((allowance as bigint | undefined) ?? 0n) < amountIn;

  const submit = async () => {
    if (!account || quoted === undefined || wrongNetwork || busy) return;
    // Pinning the chain and account makes the wallet refuse a switch made after this click, instead of sending
    // the next transaction of the sequence on another network or from another account.
    const pinned = { chainId: targetNetwork.id, account } as const;
    setBusy(true);
    try {
      if (mode === "buy") {
        await transact(() =>
          writeContractAsync({
            ...pinned,
            address: router,
            abi: saucerRouterAbi,
            functionName: "swapExactETHForTokens",
            args: [minimumOut(quoted), path, account, deadline()],
            value: tinybarToWeibar(amountIn),
            gas: BigInt(GAS.swapBuy),
          }),
        );
      } else {
        if (needsApproval) {
          await transact(() =>
            writeContractAsync({
              ...pinned,
              address: token,
              abi: erc20ApproveAbi,
              functionName: "approve",
              args: [router, amountIn],
              gas: BigInt(GAS.approve),
            }),
          );
          await refetchAllowance();
        }
        await transact(() =>
          writeContractAsync({
            ...pinned,
            address: router,
            abi: saucerRouterAbi,
            functionName: "swapExactTokensForETH",
            args: [amountIn, minimumOut(quoted), path, account, deadline()],
            gas: BigInt(GAS.swapSell),
          }),
        );
      }
      onDone();
    } catch {
      // The transactor already shows the error.
    } finally {
      setBusy(false);
      void refetchQuote();
    }
  };

  return (
    <div className="mt-4">
      <ImpliedChance side={side} price={price} sidePool={sidePool} otherPool={otherPool} expired={expired} />
      <p className="m-0 mt-3 text-sm text-base-content/70">
        1 {side} ≈{" "}
        <span className="font-semibold text-base-content tabular-nums">{price ? formatHbar(price) : "-"}</span>
        <span className="text-base-content/50">
          {" "}
          · pool {formatHbar(reserves.hbar)} / {formatHbar(reserves.token).replace("HBAR", side)}
        </span>
      </p>
      <div className="mt-3 inline-flex rounded-lg border border-base-300 p-0.5">
        {(["buy", "sell"] as const).map(option => (
          <button
            key={option}
            onClick={() => setMode(option)}
            className={`rounded-md px-3 py-1 text-sm font-semibold capitalize ${
              mode === option ? "bg-base-300 text-base-content" : "text-base-content/60"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
      <label className="mt-3 flex items-center gap-2 rounded-[10px] border border-base-300 px-3 h-11 focus-within:border-primary">
        <input
          value={amount}
          onChange={event => setAmount(event.target.value)}
          inputMode="decimal"
          aria-label={mode === "buy" ? "HBAR to spend" : `${side} tokens to sell`}
          className="w-full bg-transparent text-base outline-none tabular-nums"
        />
        <span className="text-sm text-base-content/60">{mode === "buy" ? "HBAR" : side}</span>
      </label>
      <dl className="mt-3 text-sm grid grid-cols-[1fr_auto] gap-y-1">
        <dt className="text-base-content/60">You receive (quote)</dt>
        <dd className="m-0 text-right font-semibold tabular-nums">
          {quoted === undefined ? "-" : mode === "buy" ? formatHbar(quoted).replace("HBAR", side) : formatHbar(quoted)}
        </dd>
        <dt className="text-base-content/60">Minimum after 1% slippage</dt>
        <dd className="m-0 text-right tabular-nums">
          {quoted === undefined
            ? "-"
            : mode === "buy"
              ? formatHbar(minimumOut(quoted)).replace("HBAR", side)
              : formatHbar(minimumOut(quoted))}
        </dd>
      </dl>
      {mode === "buy" && (
        <AssociationPrompt
          side={side}
          association={association}
          onAssociate={associate}
          isAssociating={isAssociating}
        />
      )}
      <button
        className="btn btn-primary w-full mt-4"
        disabled={!account || wrongNetwork || !amountValid || quoted === undefined || busy || blockedByAssociation}
        onClick={submit}
      >
        {busy
          ? "Confirm in wallet…"
          : wrongNetwork
            ? `Switch your wallet to ${targetNetwork.name}`
            : mode === "buy"
              ? `Buy ${side} with ${amountValid ? amount : "-"} HBAR`
              : needsApproval
                ? `Approve and sell ${amountValid ? amount : "-"} ${side}`
                : `Sell ${amountValid ? amount : "-"} ${side}`}
      </button>
      <PoolDepth side={side} reserves={reserves} />
      <p className="text-xs text-base-content/50 mt-3 mb-0">
        Trades fill against the SaucerSwap pool, not the market&apos;s stake pools, and keep running after staking
        closes. Whoever holds a position token at settlement redeems it.
      </p>
    </div>
  );
}

type ImpliedChanceProps = {
  side: Side;
  price: bigint | undefined;
  sidePool: bigint;
  otherPool: bigint;
  expired: boolean;
};

/**
 * The chance the pool price implies: what a token costs on SaucerSwap over what it pays if its side wins.
 * Display only, read from pools; redeem amounts still come from quotePayout.
 */
function ImpliedChance({ side, price, sidePool, otherPool, expired }: ImpliedChanceProps) {
  const multiple = payoutMultipleBps(sidePool, otherPool);
  const chance = price !== undefined ? impliedChanceBps(price, sidePool, otherPool) : undefined;
  if (multiple === undefined || chance === undefined) return null;
  const percent = Number(chance) / 100;
  return (
    <div className="rounded-[10px] border border-base-300 bg-base-200 px-3 py-2.5">
      <p className="m-0 text-xs text-base-content/60">Traders price {side} at</p>
      <p className={`m-0 text-2xl font-bold tabular-nums ${side === "YES" ? "text-yes" : "text-no"}`}>
        {percent > 100 ? ">100" : percent.toFixed(0)}% chance
      </p>
      <p className="m-0 mt-1 text-xs text-base-content/60">
        1 {side} costs {price !== undefined ? formatHbar(price) : "-"} and pays{" "}
        {formatMultiple(multiple).replace("x", "")} HBAR if {side} wins
        {expired ? "" : " (estimate: stakes can still change the payout until expiry)"}.
      </p>
    </div>
  );
}

const DEPTH_SIZES = [100_000_000n, 1_000_000_000n, 5_000_000_000n];

/**
 * An order-book style view of the pool: the average price a buy or sell of each size would fill at, and how far
 * that is from the current price. SaucerSwap is an AMM, so this is the curve, not resting orders.
 */
function PoolDepth({ side, reserves }: { side: Side; reserves: { hbar: bigint; token: bigint } }) {
  const { buys, sells } = poolDepth(reserves, DEPTH_SIZES);
  const impact = (bps: bigint) => `${(Number(bps) / 100).toFixed(1)}%`;
  return (
    <details className="mt-4 group">
      <summary className="cursor-pointer text-sm font-semibold text-base-content/70">Pool depth</summary>
      <table className="mt-2 w-full text-xs tabular-nums">
        <thead className="text-base-content/50">
          <tr>
            <th className="text-left font-medium pb-1">Size</th>
            <th className="text-right font-medium pb-1">Buy avg</th>
            <th className="text-right font-medium pb-1">Sell avg</th>
          </tr>
        </thead>
        <tbody>
          {DEPTH_SIZES.map((size, index) => (
            <tr key={size.toString()}>
              <td className="py-0.5">{formatHbar(size).replace(" HBAR", "")}</td>
              <td className="py-0.5 text-right text-yes">
                {buys[index].received > 0n
                  ? `${formatHbar(buys[index].averagePrice)} (+${impact(buys[index].impactBps)})`
                  : "-"}
              </td>
              <td className="py-0.5 text-right text-no">
                {sells[index].received > 0n
                  ? `${formatHbar(sells[index].averagePrice)} (-${impact(sells[index].impactBps)})`
                  : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="m-0 mt-2 text-xs text-base-content/50">
        Buys spend that many HBAR, sells sell that many {side}. Prices are HBAR per {side}, from the pool&apos;s
        constant-product curve with SaucerSwap&apos;s 0.3% fee. SaucerSwap is an AMM, so there are no resting orders:
        bigger trades move further along the curve.
      </p>
    </details>
  );
}

type OpenPoolFormProps = {
  side: Side;
  token: Address;
  router: Address;
  factory: Address;
  onDone: () => void;
};

function OpenPoolForm({ side, token, router, factory, onDone }: OpenPoolFormProps) {
  const { address: account } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const [tokens, setTokens] = useState("2");
  const [hbar, setHbar] = useState("1");
  const { writeContractAsync } = useWriteContract();
  const transact = useTransactor();
  const { chainId: walletChainId } = useAccount();
  const [busy, setBusy] = useState(false);
  const wrongNetwork = !!account && walletChainId !== targetNetwork.id;

  // The factory charges a fixed USD fee in tinycents; the exchange-rate precompile converts it to tinybar.
  const { data: feeTinycents } = useReadContract({
    address: factory,
    abi: saucerFactoryAbi,
    functionName: "pairCreateFee",
    chainId: targetNetwork.id,
  });
  const { data: feeTinybar } = useReadContract({
    address: EXCHANGE_RATE_PRECOMPILE,
    abi: exchangeRateAbi,
    functionName: "tinycentsToTinybars",
    args: feeTinycents !== undefined ? [feeTinycents as bigint] : undefined,
    chainId: targetNetwork.id,
    query: { enabled: feeTinycents !== undefined },
  });

  const valid = isPositiveDecimal(tokens) && isPositiveDecimal(hbar) && feeTinybar !== undefined;

  const open = async () => {
    if (!account || !valid || wrongNetwork || busy) return;
    const pinned = { chainId: targetNetwork.id, account } as const;
    setBusy(true);
    const tokenAmount = hbarToTinybar(tokens);
    // A few percent over the quoted fee covers rate drift between this read and execution; the router
    // keeps the fee and adds the rest as liquidity.
    const fee = ((feeTinybar as bigint) * 103n) / 100n;
    try {
      await transact(() =>
        writeContractAsync({
          ...pinned,
          address: token,
          abi: erc20ApproveAbi,
          functionName: "approve",
          args: [router, tokenAmount],
          gas: BigInt(GAS.approve),
        }),
      );
      await transact(() =>
        writeContractAsync({
          ...pinned,
          address: router,
          abi: saucerRouterAbi,
          functionName: "addLiquidityETHNewPool",
          args: [token, tokenAmount, 0n, 0n, account, deadline()],
          value: tinybarToWeibar(hbarToTinybar(hbar) + fee),
          gas: BigInt(GAS.openPool),
        }),
      );
      onDone();
    } catch {
      // The transactor already shows the error.
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4">
      <p className="m-0 text-sm text-base-content/70">
        No SaucerSwap pool for {side} yet. Anyone holding {side} tokens can open one: the ratio you deposit sets the
        starting price, and you receive the pool&apos;s LP token.
      </p>
      <div className="grid grid-cols-2 gap-2 mt-3">
        <label className="flex items-center gap-2 rounded-[10px] border border-base-300 px-3 h-11 focus-within:border-primary">
          <input
            value={tokens}
            onChange={event => setTokens(event.target.value)}
            inputMode="decimal"
            aria-label={`${side} tokens to deposit`}
            className="w-full bg-transparent outline-none tabular-nums"
          />
          <span className="text-sm text-base-content/60">{side}</span>
        </label>
        <label className="flex items-center gap-2 rounded-[10px] border border-base-300 px-3 h-11 focus-within:border-primary">
          <input
            value={hbar}
            onChange={event => setHbar(event.target.value)}
            inputMode="decimal"
            aria-label="HBAR to deposit"
            className="w-full bg-transparent outline-none tabular-nums"
          />
          <span className="text-sm text-base-content/60">HBAR</span>
        </label>
      </div>
      <p className="text-xs text-base-content/60 mt-2 mb-0">
        SaucerSwap&apos;s pool fee: {feeTinybar !== undefined ? formatHbar(feeTinybar as bigint) : "…"} ($2, at the
        network exchange rate), paid on top of your HBAR deposit.
      </p>
      <button
        className="btn btn-primary w-full mt-4"
        disabled={!account || wrongNetwork || !valid || busy}
        onClick={open}
      >
        {busy
          ? "Confirm in wallet…"
          : wrongNetwork
            ? `Switch your wallet to ${targetNetwork.name}`
            : `Open ${side}/HBAR pool`}
      </button>
    </div>
  );
}
