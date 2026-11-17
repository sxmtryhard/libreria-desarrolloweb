"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { ErrorResponseSchema } from "@/shared/schema";
import { FORM_CLASS, FormFeedback, FormField, SUBMIT_CLASS } from "@/shared/ui/form-field";
import {
  AFTER_CHANGE_URL,
  type PasswordForm as PasswordFormData,
  passwordFailureMessage,
  passwordProblem,
} from "./password-view";

const ERROR_ID = "contrasena-error";
const EMPTY: PasswordFormData = { current: "", next: "", repeat: "" };

async function serverMessageOf(response: Response): Promise<string | null> {
  try {
    return ErrorResponseSchema.parse(await response.json()).error.message;
  } catch {
    return null;
  }
}

/** Envía el cambio; devuelve `null` si salió bien o el mensaje para mostrar (spec F15, regla 4.5). */
async function sendChange(form: PasswordFormData): Promise<string | null> {
  try {
    const response = await fetch("/api/accounts/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ current_password: form.current, new_password: form.next }),
    });
    if (response.ok) {
      return null;
    }
    return passwordFailureMessage(response.status, await serverMessageOf(response));
  } catch {
    return passwordFailureMessage(0, null);
  }
}

function buttonLabel(pending: boolean): string {
  if (pending) {
    return "Cambiando…";
  }
  return "Cambiar contraseña";
}

function describedBy(error: string | null): string | undefined {
  if (error === null) {
    return undefined;
  }
  return ERROR_ID;
}

/** Formulario «Cambiar contraseña» (spec F15, regla 4). Tras el éxito lleva a `/ingresar`. */
export function PasswordForm() {
  const router = useRouter();
  const [form, setForm] = useState<PasswordFormData>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function update(field: keyof PasswordFormData): (value: string) => void {
    return (value) => setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const problem = passwordProblem(form);
    if (problem !== null) {
      setError(problem);
      return;
    }
    setPending(true);
    setError(null);
    const failure = await sendChange(form);
    if (failure !== null) {
      setError(failure);
      setForm(EMPTY);
      setPending(false);
      return;
    }
    router.replace(AFTER_CHANGE_URL);
    router.refresh();
  }

  const common = { disabled: pending, describedBy: describedBy(error) };
  return (
    <form onSubmit={handleSubmit} noValidate className={FORM_CLASS}>
      <FormField
        id="contrasena-actual"
        label="Contraseña actual"
        type="password"
        autoComplete="current-password"
        value={form.current}
        onChange={update("current")}
        {...common}
      />
      <FormField
        id="contrasena-nueva"
        label="Contraseña nueva"
        type="password"
        autoComplete="new-password"
        value={form.next}
        onChange={update("next")}
        {...common}
      />
      <FormField
        id="contrasena-repetir"
        label="Repetir contraseña nueva"
        type="password"
        autoComplete="new-password"
        value={form.repeat}
        onChange={update("repeat")}
        {...common}
      />
      <FormFeedback errorId={ERROR_ID} error={error} success={null} />
      <button type="submit" disabled={pending} className={SUBMIT_CLASS}>
        {buttonLabel(pending)}
      </button>
    </form>
  );
}
