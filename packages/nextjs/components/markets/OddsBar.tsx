import { formatHbar, yesPercent } from "~~/utils/markets/units";

type OddsBarProps = {
  yesPool: bigint;
  noPool: bigint;
  /** Winning side once the market is settled. The losing numeral fades and the winner is tagged. */
  winner?: "YES" | "NO";
};

/** Huge YES/NO numerals with a thin pool-share bar, like the editorial mockup. */
export function OddsBar({ yesPool, noPool, winner }: OddsBarProps) {
  const yes = yesPercent(yesPool, noPool);
  // Round YES once and derive NO from it so the two numerals always add up to 100.
  const yesRounded = Math.round(yes);
  const noRounded = 100 - yesRounded;
  const total = yesPool + noPool;
  // While trading, YES leads visually; after settlement the winner does.
  const fadeYes = winner === "NO";
  const fadeNo = winner !== "NO";
  const wonTag = <span className="text-primary font-semibold">Won &middot; </span>;

  return (
    <div>
      <div className="grid grid-cols-2 gap-6 pb-6 border-b border-base-300">
        <div>
          <p className="text-[12px] uppercase tracking-[0.2em] text-base-content/60">
            {winner === "YES" && wonTag}
            Yes
          </p>
          <p
            className={`font-editorial font-black text-6xl md:text-7xl leading-none mt-1 ${fadeYes ? "opacity-40" : ""}`}
          >
            {yesRounded}
            <span className="text-2xl align-top">%</span>
          </p>
          <p className="text-sm mt-2">
            <strong>{formatHbar(yesPool)}</strong> pooled on Yes
          </p>
        </div>
        <div className="md:text-right">
          <p className="text-[12px] uppercase tracking-[0.2em] text-base-content/60">
            {winner === "NO" && wonTag}
            No
          </p>
          <p
            className={`font-editorial font-black text-6xl md:text-7xl leading-none mt-1 ${fadeNo ? "opacity-40" : ""}`}
          >
            {noRounded}
            <span className="text-2xl align-top">%</span>
          </p>
          <p className="text-sm mt-2">
            <strong>{formatHbar(noPool)}</strong> pooled on No
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4 py-4 text-sm">
        <div className="flex-1 h-[3px] flex overflow-hidden rounded-full bg-base-300" aria-hidden>
          <div className="bg-primary" style={{ width: `${yes}%` }} />
        </div>
        <span className="whitespace-nowrap">
          <strong>{formatHbar(total)} pooled</strong>
        </span>
      </div>
    </div>
  );
}
