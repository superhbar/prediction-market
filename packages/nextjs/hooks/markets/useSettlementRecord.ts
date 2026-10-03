"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PublishedRecord } from "~~/utils/markets/record";

type RecordStatus =
  { enabled: false } | { enabled: true; topicId: string; canPublish: boolean; record: PublishedRecord | null };

/**
 * A market's settlement record on the HCS record topic, through the app's /api/record route. `enabled` is false
 * when the server has no topic configured, and the panel then stays hidden. Publishing asks the server to
 * write the record; the server checks the market on chain and never writes one twice.
 */
export function useSettlementRecord(marketId: number, closed: boolean) {
  const queryClient = useQueryClient();
  const queryKey = ["settlementRecord", marketId];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async (): Promise<RecordStatus> => {
      const response = await fetch(`/api/record?marketId=${marketId}`);
      if (!response.ok) throw new Error(`Record lookup failed: ${response.status}`);
      return (await response.json()) as RecordStatus;
    },
    // A fresh record takes a few seconds to reach the mirror node, so poll briefly while one is expected.
    refetchInterval: query => {
      const value = query.state.data;
      return value?.enabled && closed && !value.record ? 15_000 : false;
    },
  });
  const publish = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/record", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ marketId }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? `Publishing failed: ${response.status}`);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
  return { status: data, isLoading, publish };
}
