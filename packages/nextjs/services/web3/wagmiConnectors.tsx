import { type WalletList, connectorsForWallets } from "@rainbow-me/rainbowkit";
import { injectedWallet, metaMaskWallet, walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";
import { rainbowkitBurnerWallet } from "burner-connector";
import * as chains from "viem/chains";
import scaffoldConfig from "~~/scaffold.config";
import { BRAND } from "~~/utils/brand";

/**
 * The scaffold's shared WalletConnect project id is rate limited, and WalletConnect's analytics ping then fails
 * CORS and logs a console error on every page. WalletConnect is used only with your own
 * NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID. Without it the app offers the browser's injected wallet (MetaMask or any
 * other extension) and the burner wallet. RainbowKit's MetaMask entry is left out then, because on a desktop
 * without the extension it falls back to WalletConnect.
 */
const ownWalletConnectId = !!process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID;
const wallets = ownWalletConnectId ? [metaMaskWallet, walletConnectWallet] : [injectedWallet];

const DEV_CHAIN_IDS = new Set<number>([chains.hardhat.id, chains.foundry.id, chains.hederaTestnet.id]);

const hasDevNetwork = scaffoldConfig.targetNetworks.some(n => DEV_CHAIN_IDS.has(n.id));

export const wagmiConnectors = () => {
  if (typeof window === "undefined") {
    return [];
  }

  const walletGroups: WalletList = [
    {
      groupName: "Supported Wallets",
      wallets,
    },
  ];

  if (scaffoldConfig.enableBurnerWallet && hasDevNetwork) {
    walletGroups.push({
      groupName: "Development",
      wallets: [rainbowkitBurnerWallet],
    });
  }

  return connectorsForWallets(walletGroups, {
    appName: BRAND.name,
    projectId: scaffoldConfig.walletConnectProjectId,
  });
};
