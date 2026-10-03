"use client";

// @refresh reset
import { AddressInfoDropdown } from "./AddressInfoDropdown";
import { HbarBalance } from "./HbarBalance";
import { RevealBurnerPKModal } from "./RevealBurnerPKModal";
import { SetBurnerPKModal } from "./SetBurnerPKModal";
import { WrongNetworkDropdown } from "./WrongNetworkDropdown";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Address } from "viem";
import { useNetworkColor } from "~~/hooks/scaffold-hbar";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar/useTargetNetwork";
import { getBlockExplorerAddressLink } from "~~/utils/scaffold-hbar";

/**
 * Custom Wagmi Connect Button (watch balance + custom design)
 */
export const RainbowKitCustomConnectButton = () => {
  const networkColor = useNetworkColor();
  const { targetNetwork } = useTargetNetwork();

  return (
    <ConnectButton.Custom>
      {({ account, chain, openConnectModal, mounted }) => {
        const connected = mounted && account && chain;
        const blockExplorerAddressLink = account
          ? getBlockExplorerAddressLink(targetNetwork, account.address)
          : undefined;

        return (
          <>
            {(() => {
              if (!connected) {
                return (
                  <button className="btn btn-primary btn-sm h-9" onClick={openConnectModal} type="button">
                    Connect Wallet
                  </button>
                );
              }

              if (chain.unsupported || chain.id !== targetNetwork.id) {
                return <WrongNetworkDropdown />;
              }

              return (
                // One joined control: network | balance | account menu.
                <div className="flex h-9 items-center whitespace-nowrap rounded-[10px] border border-base-300 bg-base-100 text-[13px]">
                  <span className="hidden md:inline-flex items-center gap-2 px-3 font-semibold">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: networkColor }} aria-hidden />
                    {chain.name}
                  </span>
                  <span className="hidden sm:inline-flex h-full items-center border-l border-base-300 px-3">
                    <HbarBalance address={account.address as Address} />
                  </span>
                  <span className="h-full border-l border-base-300" aria-hidden />
                  <AddressInfoDropdown
                    address={account.address as Address}
                    displayName={account.displayName}
                    ensAvatar={account.ensAvatar}
                    blockExplorerAddressLink={blockExplorerAddressLink}
                  />
                  <RevealBurnerPKModal />
                  <SetBurnerPKModal />
                </div>
              );
            })()}
          </>
        );
      }}
    </ConnectButton.Custom>
  );
};
