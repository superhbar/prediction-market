"use client";

/**
 * Shown when the account may not be able to receive a position token. `required` means it certainly cannot (no
 * automatic-association slots); otherwise it has a limited number of slots that may already be used.
 */
export function AssociationPrompt({
  side,
  required,
  onAssociate,
  isAssociating,
}: {
  side: "YES" | "NO";
  required: boolean;
  onAssociate: () => void;
  isAssociating: boolean;
}) {
  return (
    <div className="mt-3 text-sm rounded-xl bg-warning/10 p-3">
      <p className="m-0 text-base-content/80">
        {required
          ? `This account is not associated with the ${side} token yet.`
          : `This account is not associated with the ${side} token and has a limited number of automatic association slots. If they are all used, receiving the token fails, so associate it first to be safe.`}
      </p>
      <button className="btn btn-sm btn-outline mt-2" onClick={onAssociate} disabled={isAssociating}>
        {isAssociating ? "Associating…" : "Associate token"}
      </button>
    </div>
  );
}
