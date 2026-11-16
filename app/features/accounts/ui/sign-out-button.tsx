"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const SIGN_OUT_FAILED = "No se pudo cerrar la sesión. Intenta de nuevo.";

async function signOutOnServer(): Promise<boolean> {
  try {
    const response = await fetch("/api/session", { method: "DELETE" });
    return response.ok;
  } catch {
    return false;
  }
}

function buttonLabel(pending: boolean): string {
  if (pending) {
    return "Cerrando…";
  }
  return "Cerrar sesión";
}

/** Botón «Cerrar sesión» (spec F4, regla 4): al terminar lleva a `/ingresar`. */
export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleClick(): Promise<void> {
    setPending(true);
    setFailed(false);
    const closed = await signOutOnServer();
    if (!closed) {
      setFailed(true);
      setPending(false);
      return;
    }
    router.replace("/ingresar");
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="min-h-11 rounded border border-control-border bg-surface px-4 py-2 font-semibold text-primary-strong hover:bg-surface-strong"
      >
        {buttonLabel(pending)}
      </button>
      {failed && (
        <p role="alert" className="rounded bg-surface px-2 font-semibold text-danger">
          Error: {SIGN_OUT_FAILED}
        </p>
      )}
    </>
  );
}
