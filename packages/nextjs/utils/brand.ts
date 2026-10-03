/**
 * App identity in one place. Rename the app here and replace public/logo.png; colors, fonts and radii live in styles/globals.css.
 * The hex values below repeat the theme for the places CSS variables cannot reach (the web app
 * manifest, the wallet modal and the route progress bar), so keep them in step with the themes.
 */
export const BRAND = {
  name: "Predera",
  shortName: "Predera",
  description:
    "Binary price prediction markets on Hedera. Stake HBAR on YES or NO, settled by Chainlink with a Pyth fallback.",
  /** Theme primary, used by the wallet modal accent and the route progress bar. */
  primaryColor: "#6b8afd",
  /** Primary of the "hedera-light" theme, used by the wallet modal in light mode. */
  primaryColorLight: "#4f6ef7",
  /** Theme page background, used by the manifest splash screen and browser chrome. */
  backgroundColor: "#0f1729",
} as const;

/**
 * Coin icons per asset symbol, served from public/coins. BTC, ETH and USD come from the CC0
 * cryptocurrency-icons set; HBAR is the official Hedera icon that ships with the scaffold. Add an entry
 * when you add a feed; unknown symbols fall back to a lettered tile.
 */
export const ASSET_ICONS: Record<string, string> = {
  HBAR: "/coins/hbar.svg",
  BTC: "/coins/btc.svg",
  ETH: "/coins/eth.svg",
  USD: "/coins/usd.svg",
};
