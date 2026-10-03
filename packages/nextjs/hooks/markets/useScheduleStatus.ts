"use client";

import { useQuery } from "@tanstack/react-query";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { longZeroToEntityId, mirrorBaseForChain } from "~~/utils/markets/hashscan";
import { type MirrorSchedule, fetchSchedule } from "~~/utils/markets/mirror";
import { schedulePollInterval } from "~~/utils/markets/refresh";

export type ScheduleStatus = "none" | "pending" | "executed" | "deleted" | "unknown";

/** Poll pending or unknown schedules until the mirror confirms execution or deletion. */
export function useScheduleStatus(scheduleAddress: string | undefined): {
  schedule: MirrorSchedule | null;
  scheduleId: string | null;
  status: ScheduleStatus;
  isLoading: boolean;
} {
  const { targetNetwork } = useTargetNetwork();
  const scheduleId = scheduleAddress ? longZeroToEntityId(scheduleAddress) : null;
  const lookupId = scheduleId && scheduleId !== "0.0.0" ? scheduleId : null;
  const { data, isPending, error } = useQuery({
    queryKey: ["marketSchedule", targetNetwork.id, lookupId],
    enabled: lookupId !== null,
    queryFn: async () => {
      const schedule = await fetchSchedule(mirrorBaseForChain(targetNetwork.id), lookupId!);
      if (!schedule) throw new Error("Schedule status is unavailable.");
      return schedule;
    },
    refetchInterval: query => schedulePollInterval(query.state.data),
  });

  const schedule = lookupId ? (data ?? null) : null;
  const status: ScheduleStatus = !lookupId
    ? "none"
    : error || !schedule
      ? "unknown"
      : schedule.executedTimestamp
        ? "executed"
        : schedule.deleted
          ? "deleted"
          : "pending";
  return { schedule, scheduleId: lookupId, status, isLoading: !!lookupId && isPending && !error };
}
