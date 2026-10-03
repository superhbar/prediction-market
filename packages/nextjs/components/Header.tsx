"use client";

import React, { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bars3Icon } from "@heroicons/react/24/outline";
import { SwitchTheme } from "~~/components/SwitchTheme";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-hbar";
import { useOutsideClick } from "~~/hooks/scaffold-hbar";
import { BRAND } from "~~/utils/brand";

type HeaderMenuLink = {
  label: string;
  href: string;
};

export const menuLinks: HeaderMenuLink[] = [
  {
    label: "Markets",
    href: "/",
  },
  {
    label: "Create",
    href: "/markets/new",
  },
  {
    label: "Portfolio",
    href: "/portfolio",
  },
  {
    label: "Debug",
    href: "/debug",
  },
];

export const HeaderMenuLinks = () => {
  const pathname = usePathname();

  return (
    <>
      {menuLinks.map(({ label, href }) => {
        const isActive =
          href === "/"
            ? pathname === "/" || (pathname.startsWith("/markets/") && !pathname.startsWith("/markets/new"))
            : pathname.startsWith(href);
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={`${
                isActive ? "bg-base-100 text-base-content" : "text-base-content/60 hover:text-base-content"
              } block rounded-lg px-4 py-1.5 text-[13.5px] font-semibold transition-colors`}
            >
              {label}
            </Link>
          </li>
        );
      })}
    </>
  );
};

/** Logo mark from public/logo.png. Replace that file with your own. */
const LogoMark = () => (
  // eslint-disable-next-line @next/next/no-img-element
  <img src="/logo.png" alt="" width={28} height={28} className="w-7 h-7" />
);

/**
 * Site header: logo left, navigation as one centered segmented control, wallet and theme right.
 */
export const Header = () => {
  const burgerMenuRef = useRef<HTMLDetailsElement>(null);
  useOutsideClick(burgerMenuRef, () => {
    burgerMenuRef?.current?.removeAttribute("open");
  });

  return (
    <header className="sticky top-0 z-20 border-b border-base-300 bg-base-200">
      <div className="shell h-[60px] grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="flex items-center gap-2">
          <details className="dropdown lg:hidden" ref={burgerMenuRef}>
            <summary className="btn btn-ghost btn-sm px-2" aria-label="Menu">
              <Bars3Icon className="h-5 w-5" />
            </summary>
            <ul
              className="menu dropdown-content mt-3 p-1.5 panel w-48 gap-0.5"
              onClick={() => {
                burgerMenuRef?.current?.removeAttribute("open");
              }}
            >
              <HeaderMenuLinks />
            </ul>
          </details>
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <LogoMark />
            <span className="hidden sm:inline text-[17px] font-bold">{BRAND.name}</span>
          </Link>
        </div>
        <nav aria-label="Main">
          <ul className="hidden lg:flex items-center gap-0.5 rounded-xl border border-base-300 p-1">
            <HeaderMenuLinks />
          </ul>
        </nav>
        <div className="flex items-center justify-end gap-2">
          <RainbowKitCustomConnectButton />
          <SwitchTheme />
        </div>
      </div>
    </header>
  );
};
