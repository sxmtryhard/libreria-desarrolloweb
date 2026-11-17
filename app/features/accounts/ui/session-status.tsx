import Link from "next/link";
import type { Session } from "@/shared/schema";
import { CHANGE_PASSWORD_LINK } from "./password-view";
import { sessionLabel } from "./role-labels";
import { SignOutButton } from "./sign-out-button";

/** Estado de la sesión en la cabecera (spec F33, reglas 1.5 y 1.6). Va sobre fondo oscuro. */
export function SessionStatus({ session }: { session: Session | null }) {
  if (session === null) {
    return (
      <Link
        href="/ingresar"
        className="inline-flex min-h-11 items-center rounded bg-surface px-4 font-semibold text-primary-strong underline hover:bg-surface-strong hover:text-primary-strong"
      >
        Ingresar
      </Link>
    );
  }
  return (
    <>
      <p className="break-all">{sessionLabel(session)}</p>
      <Link
        href={CHANGE_PASSWORD_LINK.href}
        className="inline-flex min-h-11 items-center rounded px-2 font-semibold text-surface underline hover:bg-primary-hover"
      >
        {CHANGE_PASSWORD_LINK.label}
      </Link>
      <SignOutButton />
    </>
  );
}
