"use client";

/** The warning and button shown when the account must associate a position token before receiving it. */
export function AssociationPrompt({
  side,
  onAssociate,
  isAssociating,
}: {
  side: "YES" | "NO";
  onAssociate: () => void;
  isAssociating: boolean;
}) {
  return (
    <div className="mt-3 text-sm rounded-xl bg-warning/10 p-3">
      <p className="m-0 text-base-content/80">This account is not associated with the {side} token yet.</p>
      <button className="btn btn-sm btn-outline mt-2" onClick={onAssociate} disabled={isAssociating}>
        {isAssociating ? "Associating…" : "Associate token"}
      </button>
    </div>
  );
}
