import type { PricePoint } from "~~/hooks/markets/useChainlinkHistory";
import { formatPrice } from "~~/utils/markets/units";

type PriceChartProps = {
  points: PricePoint[];
  strike: bigint;
  feedLabel: string;
  /** Market expiry: the first round at or after it is the settlement round and gets a marker. */
  expiry?: bigint;
};

const WIDTH = 720;
const HEIGHT = 240;
const PAD = 12;

/** Inline SVG line chart from Chainlink rounds with a dashed strike line. No chart library. */
export function PriceChart({ points, strike, feedLabel, expiry }: PriceChartProps) {
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
  const lastY = y(last.normalized);
  // When the strike is the chart's maximum its label goes under the line, so it is not clipped.
  const strikeLabelY = strikeY < PAD + 16 ? strikeY + 18 : strikeY - 8;
  const settleIndex = expiry === undefined ? -1 : points.findIndex(point => point.timestamp >= expiry);
  // Near the right edge the marker label flips to the left of its line so it is not clipped.
  const settleLabelLeft = settleIndex >= 0 && x(settleIndex) > WIDTH * 0.7;

  return (
    <div className="border border-base-300 bg-base-100 p-5">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-auto"
        role="img"
        aria-label={`${feedLabel} price chart`}
      >
        <line x1="0" y1={strikeY} x2={WIDTH} y2={strikeY} stroke="#8259ef" strokeWidth="1.5" strokeDasharray="6 6" />
        {settleIndex >= 0 && (
          <g>
            <line
              x1={x(settleIndex)}
              y1={PAD}
              x2={x(settleIndex)}
              y2={HEIGHT - PAD}
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray="2 4"
              opacity="0.5"
            />
            <text
              x={settleLabelLeft ? x(settleIndex) - 6 : x(settleIndex) + 6}
              y={HEIGHT - PAD}
              fontSize="12"
              fill="currentColor"
              opacity="0.7"
              textAnchor={settleLabelLeft ? "end" : "start"}
            >
              Settlement round
            </text>
            <circle
              cx={x(settleIndex)}
              cy={y(points[settleIndex].normalized)}
              r="7"
              fill="none"
              stroke="#8259ef"
              strokeWidth="2"
            />
          </g>
        )}
        <text
          x={8}
          y={strikeLabelY}
          fontSize="13"
          fill="#8259ef"
          textAnchor="start"
          fontStyle="italic"
          fontFamily="Fraunces,serif"
        >
          Strike {formatPrice(strike)}
        </text>
        <path d={line} fill="none" stroke="currentColor" strokeWidth="2.5" opacity="0.9" />
        <circle cx={x(points.length - 1)} cy={lastY} r="5" fill="#8259ef" />
        <text
          x={x(points.length - 1) - 10}
          y={lastY - 14}
          fontSize="13"
          fontWeight="600"
          fill="currentColor"
          stroke="var(--color-base-100)"
          strokeWidth="4"
          paintOrder="stroke"
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
