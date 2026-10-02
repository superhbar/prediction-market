import type { PricePoint } from "~~/hooks/markets/useChainlinkHistory";
import { formatPrice } from "~~/utils/markets/units";

type PriceChartProps = {
  points: PricePoint[];
  strike: bigint;
  feedLabel: string;
};

const WIDTH = 720;
const HEIGHT = 240;
const PAD = 12;

/** Inline SVG line chart from Chainlink rounds with a dashed strike line. No chart library. */
export function PriceChart({ points, strike, feedLabel }: PriceChartProps) {
  if (points.length === 0) {
    return (
      <div className="border border-base-300 bg-base-100 p-5">
        <p className="text-sm text-base-content/60 m-0">Price history is unavailable for {feedLabel}.</p>
      </div>
    );
  }

  const values = [...points.map(point => point.normalized), strike];
  const min = values.reduce((a, b) => (a < b ? a : b));
  const max = values.reduce((a, b) => (a > b ? a : b));
  const span = max - min === 0n ? 1n : max - min;

  const x = (index: number) => {
    if (points.length === 1) return WIDTH - PAD;
    return PAD + (index / (points.length - 1)) * (WIDTH - PAD * 2);
  };
  const y = (value: bigint) => {
    const ratio = Number(((value - min) * 10000n) / span) / 10000;
    return PAD + (1 - ratio) * (HEIGHT - PAD * 2);
  };

  const line = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${x(index).toFixed(1)},${y(point.normalized).toFixed(1)}`)
    .join(" ");
  const strikeY = y(strike);
  const last = points[points.length - 1];

  return (
    <div className="border border-base-300 bg-base-100 p-5">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-auto"
        role="img"
        aria-label={`${feedLabel} price chart`}
      >
        <line x1="0" y1={strikeY} x2={WIDTH} y2={strikeY} stroke="#8259ef" strokeWidth="1.5" strokeDasharray="6 6" />
        <text
          x={WIDTH - 8}
          y={strikeY - 8}
          fontSize="13"
          fill="#8259ef"
          textAnchor="end"
          fontStyle="italic"
          fontFamily="Fraunces,serif"
        >
          Strike {formatPrice(strike)}
        </text>
        <path d={line} fill="none" stroke="currentColor" strokeWidth="2.5" opacity="0.9" />
        <circle cx={x(points.length - 1)} cy={y(last.normalized)} r="5" fill="#8259ef" />
        <text
          x={x(points.length - 1) - 10}
          y={y(last.normalized) - 14}
          fontSize="13"
          fontWeight="600"
          fill="currentColor"
          textAnchor="end"
        >
          {formatPrice(last.normalized)}
        </text>
      </svg>
      <div className="editorial-rule my-4" />
      <p className="font-editorial italic text-[15px] leading-relaxed m-0">
        {points.length} Chainlink rounds, latest <strong>{formatPrice(last.normalized)}</strong> against a strike of{" "}
        <strong>{formatPrice(strike)}</strong>.
      </p>
    </div>
  );
}
