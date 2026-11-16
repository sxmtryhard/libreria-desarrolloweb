import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SessionStatus } from "@/features/accounts/ui/session-status";
import { currentSession } from "@/features/container";
import { roleLinksFor } from "@/shared/ui/navigation";
import { NavItem, SiteHeader } from "@/shared/ui/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Biblioteca de préstamos",
  description: "Proyecto del curso de Tendencias: desarrollo con agentes de IA",
};

/** Sesión de la cabecera (spec F33, reglas 1.5 y 1.6). Lee la cookie: va dentro de Suspense. */
async function HeaderSession() {
  return <SessionStatus session={await currentSession()} />;
}

/** Enlaces de la barra que dependen del rol (spec F34, regla 1.5). Lee la cookie: va dentro de Suspense. */
async function RoleLinks() {
  const session = await currentSession();
  const links = roleLinksFor(session?.role ?? null);
  return (
    <>
      {links.map((link) => (
        <NavItem key={link.href} link={link} />
      ))}
    </>
  );
}

function SiteFooter() {
  return (
    <footer className="bg-primary-deep text-surface">
      <p className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-6 px-4 py-2">
        Biblioteca de préstamos · Proyecto del curso de Tendencias
        <Link href="/acerca" className="inline-flex min-h-11 items-center text-surface underline hover:text-surface">
          Acerca del proyecto
        </Link>
      </p>
    </footer>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es">
      <body className="flex min-h-screen flex-col bg-surface text-ink">
        <a href="#contenido" className="skip-link">
          Saltar al contenido
        </a>
        <SiteHeader
          roleLinks={
            <Suspense fallback={null}>
              <RoleLinks />
            </Suspense>
          }
          session={
            <Suspense fallback={<p role="status">Comprobando la sesión…</p>}>
              <HeaderSession />
            </Suspense>
          }
        />
        <main id="contenido" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
