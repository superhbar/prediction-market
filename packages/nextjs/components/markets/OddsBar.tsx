import type { ReactNode } from "react";
import { OutcomeBar } from "~~/components/markets/ui";
import { formatHbar, yesPercent } from "~~/utils/markets/units";

type OddsBarProps = {
  yesPool: bigint;
  noPool: bigint;
  /** Winning side once the market is settled. The losing side fades and the winner is tagged. */
  winner?: "YES" | "NO";
  /** Optional line under the bar, such as the countdown. */
  footer?: ReactNode;
};

/** Pool split as implied odds: YES and NO shares, the two-tone bar and the total pooled. */
export function OddsBar({ yesPool, noPool, winner, footer }: OddsBarProps) {
  const yes = yesPercent(yesPool, noPool);
  // Round YES once and derive NO from it so the two sides always add up to 100.
  const yesRounded = Math.round(yes);
  const noRounded = 100 - yesRounded;

  return (
    <section className="panel p-5 md:p-6">
      <div className="grid grid-cols-2 gap-4">
        <Side label="Yes" percent={yesRounded} pool={yesPool} won={winner === "YES"} faded={winner === "NO"} />
        <Side label="No" percent={noRounded} pool={noPool} won={winner === "NO"} faded={winner === "YES"} alignEnd />
      </div>
      <div className="mt-5">
        <OutcomeBar yes={yes} height="h-2.5" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 mt-3 text-sm text-base-content/60">
        <span>
          <span className="font-semibold text-base-content tabular-nums">{formatHbar(yesPool + noPool)}</span> pooled
        </span>
        {footer}
      </div>
    </section>
  );
}

type SideProps = {
  label: "Yes" | "No";
  percent: number;
  pool: bigint;
  won: boolean;
  faded: boolean;
  alignEnd?: boolean;
};

function Side({ label, percent, pool, won, faded, alignEnd }: SideProps) {
  const color = label === "Yes" ? "text-yes" : "text-no";
  return (
    <div className={`${alignEnd ? "text-right" : ""} ${faded ? "opacity-40" : ""}`}>
      <p className={`m-0 flex items-center gap-2 text-sm font-semibold ${color} ${alignEnd ? "justify-end" : ""}`}>
        {label}
        {won && <span className="rounded-full bg-primary/15 text-primary px-2 py-0.5 text-xs">Won</span>}
      </p>
      <p className="m-0 mt-1 text-4xl md:text-5xl font-bold tabular-nums tracking-tight">
        {percent}
        <span className="text-xl text-base-content/50">%</span>
      </p>
      <p className="m-0 mt-1 text-sm text-base-content/60 tabular-nums">{formatHbar(pool)}</p>
    </div>
  );
}
