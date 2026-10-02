import type { MetadataRoute } from "next";

/**
 * Web app manifest: the app is installable and opens standalone with the editorial theme.
 * There is deliberately no service worker. A wallet dApp needs the network for every action, and a cached
 * bundle could serve stale contract bindings after a redeploy.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Prediction Market on Hedera",
    short_name: "Predict",
    description: "Oracle-settled prediction markets on Hedera with HIP-1215 self-scheduled settlement.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f1e7",
    theme_color: "#1b1a17",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
