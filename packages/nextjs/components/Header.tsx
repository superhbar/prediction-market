"use client";

import React, { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bars3Icon } from "@heroicons/react/24/outline";
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
        const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <li key={href}>
            <Link
              href={href}
              passHref
              className={`${
                isActive ? "bg-base-content/10 text-base-content" : "text-base-content/60 hover:text-base-content"
              } rounded-lg py-1.5 px-3 text-sm font-medium transition-colors`}
            >
              {label}
            </Link>
          </li>
        );
      })}
    </>
  );
};

/** Brand mark: a Hedera-purple gradient tile. Swap it for your own logo. */
const LogoMark = () => (
  <span
    aria-hidden
    className="grid place-items-center w-8 h-8 rounded-lg bg-gradient-to-br from-hedera-purple to-hedera-cobalt text-white text-sm font-bold"
  >
    {BRAND.logoLetter}
  </span>
);

/**
 * Site header
 */
export const Header = () => {
  const burgerMenuRef = useRef<HTMLDetailsElement>(null);
  useOutsideClick(burgerMenuRef, () => {
    burgerMenuRef?.current?.removeAttribute("open");
  });

  return (
    <div className="sticky top-0 z-20 border-b border-base-content/10 bg-base-200/70 backdrop-blur-xl">
      <div className="navbar min-h-0 h-16 max-w-[1200px] mx-auto px-4 sm:px-6 justify-between">
        <div className="navbar-start w-auto gap-2">
          <details className="dropdown lg:hidden" ref={burgerMenuRef}>
            <summary className="btn btn-ghost btn-sm px-2" aria-label="Menu">
              <Bars3Icon className="h-5 w-5" />
            </summary>
            <ul
              className="menu dropdown-content mt-3 p-2 panel w-52 gap-1"
              onClick={() => {
                burgerMenuRef?.current?.removeAttribute("open");
              }}
            >
              <HeaderMenuLinks />
            </ul>
          </details>
          <Link href="/" passHref className="flex items-center gap-2.5 shrink-0">
            <LogoMark />
            <span className="font-semibold tracking-tight hidden sm:inline">{BRAND.name}</span>
            <span className="hidden md:inline text-[11px] font-medium rounded-full px-2 py-0.5 bg-primary/15 text-primary">
              Hedera
            </span>
          </Link>
          <ul className="hidden lg:flex flex-nowrap menu menu-horizontal px-1 gap-1 ml-6">
            <HeaderMenuLinks />
          </ul>
        </div>
        <div className="navbar-end grow">
          <RainbowKitCustomConnectButton />
        </div>
      </div>
    </div>
  );
};
