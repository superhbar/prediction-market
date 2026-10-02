"use client";

import { useEffect, useState } from "react";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { longZeroToEntityId, mirrorBaseForChain } from "~~/utils/markets/hashscan";
import { type MirrorSchedule, fetchSchedule } from "~~/utils/markets/mirror";

export type ScheduleStatus = "none" | "pending" | "executed" | "deleted" | "unknown";

/**
 * Reads schedule status from the mirror node: executed timestamp, deletion
 * flag and expiration time. Zero address means no schedule.
 */
export function useScheduleStatus(scheduleAddress: string | undefined): {
  schedule: MirrorSchedule | null;
  scheduleId: string | null;
  status: ScheduleStatus;
  isLoading: boolean;
} {
  const { targetNetwork } = useTargetNetwork();
  const [snapshot, setSnapshot] = useState<{ key: string | null; schedule: MirrorSchedule | null }>({
    key: null,
    schedule: null,
  });

  const scheduleId = scheduleAddress ? longZeroToEntityId(scheduleAddress) : null;
  const hasSchedule = scheduleId !== null && scheduleId !== "0.0.0";
  const lookupId = hasSchedule ? scheduleId : null;

  useEffect(() => {
    if (!lookupId || snapshot.key === lookupId) return;
    let cancelled = false;
    fetchSchedule(mirrorBaseForChain(targetNetwork.id), lookupId)
      .then(result => {
        if (!cancelled) setSnapshot({ key: lookupId, schedule: result });
      })
      .catch(() => {
        if (!cancelled) setSnapshot({ key: lookupId, schedule: null });
      });
    return () => {
      cancelled = true;
    };
  }, [lookupId, snapshot.key, targetNetwork.id]);

  const current = lookupId !== null && snapshot.key === lookupId;
  const schedule = current ? snapshot.schedule : null;

  let status: ScheduleStatus = "unknown";
  if (!hasSchedule) {
    status = "none";
  } else if (schedule) {
    if (schedule.executedTimestamp) status = "executed";
    else if (schedule.deleted) status = "deleted";
    else status = "pending";
  }

  return { schedule, scheduleId: lookupId, status, isLoading: hasSchedule && !current };
}
