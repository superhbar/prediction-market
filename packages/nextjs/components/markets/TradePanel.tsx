"use client";

import { useState } from "react";
import type { Address } from "viem";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { useSaucerPool } from "~~/hooks/markets/useSaucerPool";
import { useTargetNetwork, useTransactor } from "~~/hooks/scaffold-hbar";
import { hashscanLink } from "~~/utils/markets/hashscan";
import {
  EXCHANGE_RATE_PRECOMPILE,
  SAUCERSWAP,
  SWAP_DEADLINE_SECONDS,
  erc20ApproveAbi,
  exchangeRateAbi,
  minimumOut,
  saucerFactoryAbi,
  saucerRouterAbi,
} from "~~/utils/markets/saucerswap";
import { type Market, MarketState } from "~~/utils/markets/types";
import { GAS, formatHbar, hbarToTinybar, isPositiveDecimal, tinybarToWeibar } from "~~/utils/markets/units";

type Side = "YES" | "NO";
type Mode = "buy" | "sell";

const deadline = () => BigInt(Math.floor(Date.now() / 1000)) + SWAP_DEADLINE_SECONDS;

/**
 * Trade a position before settlement on SaucerSwap V1. Staking adds to the market's pools at the pool-share
 * rate; this panel buys from or sells to whoever provides liquidity, at the AMM price. Quotes come from the
 * router's getAmountsOut; nothing here computes a payout.
 */
export function TradePanel({ market }: { market: Market }) {
  const { targetNetwork } = useTargetNetwork();
  const deployment = SAUCERSWAP[targetNetwork.id];
  const [side, setSide] = useState<Side>("YES");
  const token = side === "YES" ? market.yesToken : market.noToken;
  const pool = useSaucerPool(token);

  if (!deployment || market.state !== MarketState.Open) return null;

  return (
    <section className="panel p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-base-content/70 m-0">Trade on SaucerSwap</p>
        {pool.pair && (
          <a
            href={hashscanLink(targetNetwork.id, "contract", pool.pair)}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-primary"
          >
            Pool on Hashscan
          </a>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 mt-3">
        {(["YES", "NO"] as const).map(option => (
          <button
            key={option}
            onClick={() => setSide(option)}
            className={`btn btn-sm h-9 ${
              side === option
                ? option === "YES"
                  ? "bg-yes text-base-200 border-yes"
                  : "bg-no text-base-200 border-no"
                : "btn-ghost border-base-300"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
      {pool.isLoading ? (
        <p className="text-sm mt-4 mb-0 text-base-content/60">Looking for a pool…</p>
      ) : pool.pair && pool.reserves ? (
        <SwapForm
          side={side}
          token={token}
          price={pool.price}
          reserves={pool.reserves}
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
  router: Address;
  whbarToken: Address;
  onDone: () => void;
};

function SwapForm({ side, token, price, reserves, router, whbarToken, onDone }: SwapFormProps) {
  const { address: account } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const [mode, setMode] = useState<Mode>("buy");
  const [amount, setAmount] = useState("1");
  const { writeContractAsync, isPending } = useWriteContract();
  const transact = useTransactor();

  const amountValid = isPositiveDecimal(amount);
  // Position tokens and tinybar both have 8 decimals, so one parser serves both directions.
  const amountIn = amountValid ? hbarToTinybar(amount) : 0n;
  const path = mode === "buy" ? [whbarToken, token] : [token, whbarToken];

  const { data: amountsOut } = useReadContract({
    address: router,
    abi: saucerRouterAbi,
    functionName: "getAmountsOut",
    args: amountIn > 0n ? [amountIn, path] : undefined,
    chainId: targetNetwork.id,
    query: { enabled: amountIn > 0n },
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
    if (!account || quoted === undefined) return;
    try {
      if (mode === "buy") {
        await transact(() =>
          writeContractAsync({
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
    }
  };

  return (
    <div className="mt-4">
      <p className="m-0 text-sm text-base-content/70">
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
      <button
        className="btn btn-primary w-full mt-4"
        disabled={!account || !amountValid || quoted === undefined || isPending}
        onClick={submit}
      >
        {isPending
          ? "Confirm in wallet…"
          : mode === "buy"
            ? `Buy ${side} with ${amountValid ? amount : "-"} HBAR`
            : needsApproval
              ? `Approve and sell ${amountValid ? amount : "-"} ${side}`
              : `Sell ${amountValid ? amount : "-"} ${side}`}
      </button>
      <p className="text-xs text-base-content/50 mt-3 mb-0">
        Trades fill against the SaucerSwap pool, not the market&apos;s stake pools. Whoever holds a position token at
        settlement redeems it.
      </p>
    </div>
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
  const { writeContractAsync, isPending } = useWriteContract();
  const transact = useTransactor();

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
    if (!account || !valid) return;
    const tokenAmount = hbarToTinybar(tokens);
    // A few percent over the quoted fee covers rate drift between this read and execution; the router
    // keeps the fee and adds the rest as liquidity.
    const fee = ((feeTinybar as bigint) * 103n) / 100n;
    try {
      await transact(() =>
        writeContractAsync({
          address: token,
          abi: erc20ApproveAbi,
          functionName: "approve",
          args: [router, tokenAmount],
          gas: BigInt(GAS.approve),
        }),
      );
      await transact(() =>
        writeContractAsync({
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
      <button className="btn btn-primary w-full mt-4" disabled={!account || !valid || isPending} onClick={open}>
        {isPending ? "Confirm in wallet…" : `Open ${side}/HBAR pool`}
      </button>
    </div>
  );
}
