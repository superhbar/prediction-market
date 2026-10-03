/**
 * App identity in one place. Rename the app here; colors, fonts and radii live in styles/globals.css.
 * The hex values below repeat the theme for the places CSS variables cannot reach (the web app
 * manifest, the wallet modal and the route progress bar), so keep them in step with the themes.
 */
export const BRAND = {
  name: "Prediction Market",
  shortName: "Predict",
  /** Letter on the header logo tile. Replace the LogoMark component in Header.tsx for a real logo. */
  logoLetter: "P",
  description:
    "Binary price prediction markets on Hedera. Stake HBAR on YES or NO, settled by Chainlink with a Pyth fallback.",
  /** Theme primary, used by the wallet modal accent and the route progress bar. */
  primaryColor: "#8259ef",
  /** Primary of the "hedera-light" theme, used by the wallet modal in light mode. */
  primaryColorLight: "#7044e6",
  /** Theme page background, used by the manifest splash screen and browser chrome. */
  backgroundColor: "#0a0a12",
} as const;
