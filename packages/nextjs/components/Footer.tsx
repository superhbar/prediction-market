import React from "react";
import { HederaPortalFaucet } from "@scaffold-hbar-ui/components";
import { hedera } from "viem/chains";
import { useFetchHbarPrice } from "~~/hooks/scaffold-hbar";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar/useTargetNetwork";

const LINKS = [
  { label: "Source", href: "https://github.com/superhbar/prediction-market" },
  { label: "Scaffold-HBAR", href: "https://github.com/hedera-dev/scaffold-hbar" },
  { label: "Hedera docs", href: "https://docs.hedera.com/" },
];

/**
 * Site footer: network facts and tools on the left, links on the right. Nothing floats over content.
 */
export const Footer = () => {
  const { targetNetwork } = useTargetNetwork();
  const isTestnet = targetNetwork.id !== hedera.id;
  const { price: hbarPrice } = useFetchHbarPrice();

  return (
    <footer className="border-t border-base-300">
      <div className="shell py-6 flex flex-col md:flex-row gap-4 md:items-center justify-between text-sm">
        <div className="flex flex-wrap items-center gap-3 text-base-content/60">
          <span className="inline-flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-success" aria-hidden />
            {targetNetwork.name}
          </span>
          {hbarPrice > 0 && (
            <span className="font-mono tabular-nums">
              HBAR <span className="text-base-content">${hbarPrice.toFixed(4)}</span>
            </span>
          )}
          {isTestnet && <HederaPortalFaucet showIcon />}
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-1 text-base-content/60">
          {LINKS.map(link => (
            <a key={link.href} href={link.href} target="_blank" rel="noreferrer" className="hover:text-base-content">
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
};
