"use client";

import type { Association } from "~~/hooks/markets/useTokenAssociation";

const MESSAGE: Record<"needs-association" | "may-need-association" | "unknown", (side: string) => string> = {
  "needs-association": side => `This account is not associated with the ${side} token yet.`,
  "may-need-association": side =>
    `This account is not associated with the ${side} token and has a limited number of automatic association slots. If they are all used, receiving the token fails, so associate it first to be safe.`,
  unknown: side =>
    `Could not check whether this account can receive the ${side} token (retrying). If it has no free automatic association slots, associate it first.`,
};

/** Warning and one-click association for an account that may not be able to receive a position token. */
export function AssociationPrompt({
  side,
  association,
  onAssociate,
  isAssociating,
}: {
  side: "YES" | "NO";
  association: Association;
  onAssociate: () => void;
  isAssociating: boolean;
}) {
  if (association !== "needs-association" && association !== "may-need-association" && association !== "unknown")
    return null;
  return (
    <div className="mt-3 text-sm rounded-xl bg-warning/10 p-3">
      <p className="m-0 text-base-content/80">{MESSAGE[association](side)}</p>
      <button className="btn btn-sm btn-outline mt-2" onClick={onAssociate} disabled={isAssociating}>
        {isAssociating ? "Associating…" : "Associate token"}
      </button>
    </div>
  );
}
