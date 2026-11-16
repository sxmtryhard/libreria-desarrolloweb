"use client";

import { FirebaseError } from "firebase/app";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { getClientAuth } from "@/shared/ui/firebase-client";
import {
  type Credentials,
  messageForAuthCode,
  messageForStatus,
  prepareCredentials,
  SIGN_IN_MESSAGES,
} from "./sign-in-messages";

const ERROR_ID = "ingreso-error";
const FIELD_CLASS =
  "mt-1 block min-h-11 w-full rounded border border-control-border bg-surface px-3 py-2 text-ink disabled:bg-surface-alt";

function messageForError<T>(error: T): string {
  if (error instanceof FirebaseError) {
    return messageForAuthCode(error.code);
  }
  return SIGN_IN_MESSAGES.failed;
}

/**
 * Ingresa (spec F4, regla 1): Firebase comprueba la contraseña, el servidor cambia el token por la cookie
 * y el cliente de Firebase se cierra. Devuelve `null` si salió bien o el mensaje que hay que mostrar.
 */
async function signIn(credentials: Credentials): Promise<string | null> {
  const auth = getClientAuth();
  try {
    const result = await signInWithEmailAndPassword(auth, credentials.email, credentials.password);
    const idToken = await result.user.getIdToken();
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id_token: idToken }),
    });
    await signOut(auth);
    if (!response.ok) {
      return messageForStatus(response.status);
    }
    return null;
  } catch (error) {
    return messageForError(error);
  }
}

function buttonLabel(pending: boolean): string {
  if (pending) {
    return "Ingresando…";
  }
  return "Ingresar";
}

function describedBy(error: string | null): string | undefined {
  if (error === null) {
    return undefined;
  }
  return ERROR_ID;
}

/** Formulario de ingreso (spec F4, reglas 1 y 2). */
export function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const credentials = prepareCredentials(email, password);
    if (credentials === null) {
      setError(SIGN_IN_MESSAGES.missing);
      return;
    }
    setPending(true);
    setError(null);
    const failure = await signIn(credentials);
    if (failure !== null) {
      setError(failure);
      setPassword("");
      setPending(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="mt-6 space-y-4 rounded-lg border border-line bg-surface-alt p-4"
    >
      <p>
        <label htmlFor="ingreso-correo" className="font-semibold">
          Correo
        </label>
        <input
          id="ingreso-correo"
          name="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={pending}
          aria-describedby={describedBy(error)}
          className={FIELD_CLASS}
        />
      </p>
      <p>
        <label htmlFor="ingreso-contrasena" className="font-semibold">
          Contraseña
        </label>
        <input
          id="ingreso-contrasena"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={pending}
          aria-describedby={describedBy(error)}
          className={FIELD_CLASS}
        />
      </p>
      {error !== null && (
        <p id={ERROR_ID} role="alert" className="font-semibold text-danger">
          Error: {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 w-full rounded bg-primary px-4 py-2 font-semibold text-surface hover:bg-primary-hover disabled:bg-primary-strong md:w-auto"
      >
        {buttonLabel(pending)}
      </button>
    </form>
  );
}
