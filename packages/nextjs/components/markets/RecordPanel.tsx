"use client";

import { useSettlementRecord } from "~~/hooks/markets/useSettlementRecord";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { hashscanLink } from "~~/utils/markets/hashscan";
import { isRecordable } from "~~/utils/markets/record";
import type { Market } from "~~/utils/markets/types";

/** Consensus timestamp "1791030000.123456789" to a readable UTC time. */
function consensusTime(timestamp: string): string {
  return new Date(Number(timestamp.split(".")[0]) * 1000).toUTCString().replace(" GMT", " UTC");
}

/**
 * The market's settlement record on the Hedera Consensus Service: the terms and the result, timestamped and
 * ordered by consensus in a public topic. Hidden when the server has no record topic configured.
 */
export function RecordPanel({ marketId, market }: { marketId: number; market: Market }) {
  const { targetNetwork } = useTargetNetwork();
  const closed = isRecordable(market);
  const { status, publish } = useSettlementRecord(marketId, closed);
  if (!status?.enabled) return null;
  const topicLink = hashscanLink(targetNetwork.id, "topic", status.topicId);

  return (
    <section className="panel p-5">
      <p className="text-sm font-semibold text-base-content/70 m-0">Public record on HCS</p>
      {status.record ? (
        <>
          <p className="text-sm mt-2 mb-0">
            Recorded as message <span className="font-semibold">#{status.record.sequenceNumber}</span> of topic{" "}
            <a href={topicLink} target="_blank" rel="noreferrer" className="text-primary">
              {status.topicId}
            </a>
            {"consensusTimestamp" in status.record && status.record.consensusTimestamp
              ? `, ${consensusTime(status.record.consensusTimestamp)}`
              : ""}
            .
          </p>
          <p className="text-xs text-base-content/50 mt-2 mb-0">
            {status.record.record.outcome === "Unresolved"
              ? ""
              : `${status.record.record.state}, ${status.record.record.outcome}. `}
            Anyone can read the topic from the mirror node; consensus fixes the order and time.
          </p>
        </>
      ) : closed ? (
        <>
          <p className="text-sm mt-2 mb-0 text-base-content/70">
            This market&apos;s result is not on the record topic yet.
          </p>
          {status.canPublish && (
            <button
              className="btn btn-sm btn-outline mt-3"
              disabled={publish.isPending}
              onClick={() => publish.mutate()}
            >
              {publish.isPending ? "Publishing…" : "Publish settlement record"}
            </button>
          )}
          {publish.error && <p className="text-xs text-error mt-2 mb-0">{publish.error.message}</p>}
        </>
      ) : (
        <p className="text-sm mt-2 mb-0 text-base-content/70">
          Once this market settles, its terms and result are published to topic{" "}
          <a href={topicLink} target="_blank" rel="noreferrer" className="text-primary">
            {status.topicId}
          </a>
          .
        </p>
      )}
    </section>
  );
}
