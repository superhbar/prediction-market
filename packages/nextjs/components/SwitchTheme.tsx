"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { MoonIcon, SunIcon } from "@heroicons/react/24/outline";

function subscribe() {
  return () => {};
}

export const SwitchTheme = ({ className }: { className?: string }) => {
  const { setTheme, resolvedTheme } = useTheme();
  // False during SSR and hydration, true once mounted: same timing as the
  // previous mounted-flag effect, without setting state inside an effect.
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  const isDarkMode = resolvedTheme === "hedera";

  const handleToggle = () => {
    setTheme(isDarkMode ? "hedera-light" : "hedera");
  };

  if (!mounted) return null;

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label={isDarkMode ? "Switch to light theme" : "Switch to dark theme"}
      className={`grid h-9 w-9 place-items-center rounded-[10px] border border-base-300 bg-base-100 text-base-content/70 hover:text-base-content ${className ?? ""}`}
    >
      {isDarkMode ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
    </button>
  );
};
