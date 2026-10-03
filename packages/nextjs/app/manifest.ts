import type { MetadataRoute } from "next";
import { BRAND } from "~~/utils/brand";

/**
 * Web app manifest: the app is installable and opens standalone with the Hedera dark theme.
 * There is deliberately no service worker. A wallet dApp needs the network for every action, and a cached
 * bundle could serve stale contract bindings after a redeploy.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.name,
    short_name: BRAND.shortName,
    description: BRAND.description,
    start_url: "/",
    display: "standalone",
    background_color: BRAND.backgroundColor,
    theme_color: BRAND.backgroundColor,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
