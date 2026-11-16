"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { ErrorResponseSchema } from "@/shared/schema";
import {
  type RegisterForm as RegisterFormData,
  registerFailureMessage,
  registrationProblem,
} from "./register-messages";
import { REGISTER_MESSAGES } from "./register-messages";
import { signInWithPassword } from "./sign-in-client";

const ERROR_ID = "registro-error";
const FIELD_CLASS =
  "mt-1 block min-h-11 w-full rounded border border-control-border bg-surface px-3 py-2 text-ink disabled:bg-surface-alt";

type Outcome = { kind: "signed_in" } | { kind: "created_only" } | { kind: "error"; message: string };

async function serverMessageOf(response: Response): Promise<string | null> {
  try {
    return ErrorResponseSchema.parse(await response.json()).error.message;
  } catch {
    return null;
  }
}

/** Crea la cuenta y, si sale bien, inicia la sesión con los mismos datos (spec F10, reglas 4.3–4.5). */
async function registerAndSignIn(form: RegisterFormData): Promise<Outcome> {
  const email = form.email.trim();
  try {
    const response = await fetch("/api/accounts/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: form.name, email, password: form.password }),
    });
    if (!response.ok) {
      return { kind: "error", message: registerFailureMessage(response.status, await serverMessageOf(response)) };
    }
  } catch {
    return { kind: "error", message: REGISTER_MESSAGES.failed };
  }
  const signInFailure = await signInWithPassword({ email, password: form.password });
  if (signInFailure !== null) {
    return { kind: "created_only" };
  }
  return { kind: "signed_in" };
}

function buttonLabel(pending: boolean): string {
  if (pending) {
    return "Creando cuenta…";
  }
  return "Crear cuenta";
}

function describedBy(error: string | null): string | undefined {
  if (error === null) {
    return undefined;
  }
  return ERROR_ID;
}

interface FieldProps {
  id: string;
  label: string;
  type: "text" | "email" | "password";
  autoComplete: string;
  value: string;
  onChange(value: string): void;
  disabled: boolean;
  error: string | null;
}

function Field({ id, label, type, autoComplete, value, onChange, disabled, error }: FieldProps) {
  return (
    <p>
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-describedby={describedBy(error)}
        className={FIELD_CLASS}
      />
    </p>
  );
}

/** La cuenta existe pero no se pudo iniciar la sesión: se manda a ingresar (regla 4.5). */
function CreatedOnly() {
  return (
    <>
      <p role="status" className="mt-6 font-semibold">
        {REGISTER_MESSAGES.createdButNoSession}
      </p>
      <p className="mt-2">
        <Link href="/ingresar" className="inline-flex min-h-11 items-center underline">
          Ir a ingresar
        </Link>
      </p>
    </>
  );
}

/** Formulario de autorregistro (spec F10, regla 4). */
export function RegisterForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [createdOnly, setCreatedOnly] = useState(false);

  function fail(message: string): void {
    setError(message);
    setPassword("");
    setRepeat("");
    setPending(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = { name, email, password, repeat };
    const problem = registrationProblem(form);
    if (problem !== null) {
      fail(problem);
      return;
    }
    setPending(true);
    setError(null);
    const outcome = await registerAndSignIn(form);
    if (outcome.kind === "error") {
      fail(outcome.message);
      return;
    }
    if (outcome.kind === "created_only") {
      setCreatedOnly(true);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  if (createdOnly) {
    return <CreatedOnly />;
  }

  const common = { disabled: pending, error };
  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="mt-6 space-y-4 rounded-lg border border-line bg-surface-alt p-4"
    >
      <Field
        id="registro-nombre"
        label="Nombre"
        type="text"
        autoComplete="name"
        value={name}
        onChange={setName}
        {...common}
      />
      <Field
        id="registro-correo"
        label="Correo"
        type="email"
        autoComplete="username"
        value={email}
        onChange={setEmail}
        {...common}
      />
      <Field
        id="registro-contrasena"
        label="Contraseña"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={setPassword}
        {...common}
      />
      <Field
        id="registro-repetir"
        label="Repetir contraseña"
        type="password"
        autoComplete="new-password"
        value={repeat}
        onChange={setRepeat}
        {...common}
      />
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
