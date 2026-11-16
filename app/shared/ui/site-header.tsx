"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";
import { isCurrentPage, NAV_LINKS, type NavLink } from "./navigation";

const MENU_ID = "menu-principal";
const LINK_CLASS =
  "inline-flex min-h-11 items-center whitespace-nowrap rounded px-3 text-surface underline hover:text-surface";
const CURRENT_LINK_CLASS = `${LINK_CLASS} bg-primary font-bold decoration-2`;

/** Plegado bajo «Menú» hasta 1024 px; desde ahí siempre visible y en horizontal (spec F33, regla 1.7). */
function menuClass(open: boolean): string {
  const wide = "lg:flex lg:flex-1 lg:flex-row lg:items-center lg:justify-between lg:gap-6 lg:pb-0";
  if (open) {
    return `flex w-full flex-col gap-3 pb-3 ${wide}`;
  }
  return `hidden ${wide}`;
}

function linkClass(current: boolean): string {
  if (current) {
    return CURRENT_LINK_CLASS;
  }
  return LINK_CLASS;
}

function ariaCurrent(current: boolean): "page" | undefined {
  if (current) {
    return "page";
  }
  return undefined;
}

/** Un enlace de la barra, marcado si es la pantalla actual (spec F33, regla 1.4). */
export function NavItem({ link }: { link: NavLink }) {
  const current = isCurrentPage(usePathname(), link.href);
  return (
    <li>
      <Link href={link.href} aria-current={ariaCurrent(current)} className={linkClass(current)}>
        {link.label}
      </Link>
    </li>
  );
}

interface SiteHeaderProps {
  /** Enlaces que dependen del rol, ya resueltos en el servidor como elementos `NavItem` (spec F34, regla 1.5). */
  roleLinks: ReactNode;
  /** Bloque de sesión, ya resuelto en el servidor. */
  session: ReactNode;
}

/** Cabecera de todas las pantallas (spec F33, regla 1). */
export function SiteHeader({ roleLinks, session }: SiteHeaderProps) {
  const pathname = usePathname();
  // El menú recuerda en qué pantalla se abrió: al navegar a otra queda cerrado.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;

  function toggle(): void {
    if (open) {
      setOpenAt(null);
      return;
    }
    setOpenAt(pathname);
  }

  return (
    <header className="bg-primary-strong text-surface">
      <nav
        aria-label="Principal"
        className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-6 px-4 py-2"
      >
        <Link href="/" className="inline-flex min-h-11 items-center text-lg font-bold text-surface hover:text-surface">
          Biblioteca de préstamos
        </Link>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={MENU_ID}
          onClick={toggle}
          className="min-h-11 min-w-11 rounded border border-surface px-3 font-semibold text-surface lg:hidden"
        >
          Menú
        </button>
        <div id={MENU_ID} className={menuClass(open)}>
          <ul className="flex flex-col gap-1 lg:flex-row lg:gap-2">
            {NAV_LINKS.map((link) => (
              <NavItem key={link.href} link={link} />
            ))}
            {roleLinks}
          </ul>
          <div className="flex flex-wrap items-center gap-3">{session}</div>
        </div>
      </nav>
    </header>
  );
}
