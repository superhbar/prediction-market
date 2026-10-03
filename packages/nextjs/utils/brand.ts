/**
 * App identity in one place. Rename the app here; colors, fonts and radii live in styles/globals.css.
 * The hex values below repeat the theme for the places CSS variables cannot reach (the web app
 * manifest, the wallet modal and the route progress bar), so keep them in step with the themes.
 */
export const BRAND = {
  name: "Predera",
  shortName: "Predera",
  /** Letter on the header logo tile. Replace the LogoMark component in Header.tsx for a real logo. */
  logoLetter: "P",
  description:
    "Binary price prediction markets on Hedera. Stake HBAR on YES or NO, settled by Chainlink with a Pyth fallback.",
  /** Theme primary, used by the wallet modal accent and the route progress bar. */
  primaryColor: "#6b8afd",
  /** Primary of the "hedera-light" theme, used by the wallet modal in light mode. */
  primaryColorLight: "#4f6ef7",
  /** Theme page background, used by the manifest splash screen and browser chrome. */
  backgroundColor: "#0f1729",
} as const;

/** Coin tile colors per asset symbol; unknown symbols fall back to the theme's neutral surface. */
export const ASSET_COLORS: Record<string, { background: string; color: string }> = {
  HBAR: { background: "#000000", color: "#ffffff" },
  BTC: { background: "#f7931a", color: "#ffffff" },
  ETH: { background: "#627eea", color: "#ffffff" },
};
