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

  const isDarkMode = resolvedTheme === "editorial-dark";

  const handleToggle = () => {
    if (isDarkMode) {
      setTheme("editorial");
      return;
    }
    setTheme("editorial-dark");
  };

  if (!mounted) return null;

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label={isDarkMode ? "Switch to light theme" : "Switch to dark theme"}
      className={`btn btn-circle btn-sm border border-base-300 bg-base-100 shadow-none ${className}`}
    >
      {isDarkMode ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
    </button>
  );
};
