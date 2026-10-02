"use client";

import React, { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bars3Icon } from "@heroicons/react/24/outline";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-hbar";
import { useOutsideClick } from "~~/hooks/scaffold-hbar";

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
                isActive ? "font-semibold underline underline-offset-4" : "opacity-70 hover:opacity-100"
              } py-1.5 px-3 text-sm gap-2 grid grid-flow-col transition-opacity`}
            >
              <span>{label}</span>
            </Link>
          </li>
        );
      })}
    </>
  );
};

/**
 * Site header
 */
export const Header = () => {
  const burgerMenuRef = useRef<HTMLDetailsElement>(null);
  useOutsideClick(burgerMenuRef, () => {
    burgerMenuRef?.current?.removeAttribute("open");
  });

  return (
    <div className="sticky lg:static top-0 navbar bg-base-200 min-h-0 shrink-0 justify-between z-20 border-b border-base-300 px-0 sm:px-2">
      <div className="navbar-start w-auto lg:w-1/2">
        <details className="dropdown" ref={burgerMenuRef}>
          <summary className="ml-1 btn btn-ghost lg:hidden hover:bg-transparent">
            <Bars3Icon className="h-1/2" />
          </summary>
          <ul
            className="menu menu-compact dropdown-content mt-3 p-2 shadow-sm bg-base-100 rounded-box w-52"
            onClick={() => {
              burgerMenuRef?.current?.removeAttribute("open");
            }}
          >
            <HeaderMenuLinks />
          </ul>
        </details>
        <Link href="/" passHref className="hidden lg:flex items-baseline gap-2 ml-4 mr-6 shrink-0">
          <span className="font-editorial font-black text-xl tracking-tight">prediction-market</span>
          <span className="text-[11px] uppercase tracking-[0.18em] border border-base-300 rounded-full px-2 py-0.5 text-base-content/60">
            on Hedera
          </span>
        </Link>
        <Link href="/" passHref className="flex lg:hidden items-baseline gap-2 ml-1 mr-4 shrink-0">
          <span className="font-editorial font-black text-lg tracking-tight">prediction-market</span>
        </Link>
        <ul className="hidden lg:flex lg:flex-nowrap menu menu-horizontal px-1 gap-2 ml-4">
          <HeaderMenuLinks />
        </ul>
      </div>
      <div className="navbar-end grow mr-4">
        <RainbowKitCustomConnectButton />
      </div>
    </div>
  );
};
