"use client";

import { type FormEvent, useState } from "react";
import { FIELD_CLASS, FORM_CLASS, FormFeedback, FormField, SUBMIT_CLASS } from "@/shared/ui/form-field";
import { FORM_MESSAGES } from "@/shared/ui/form-messages";
import { postForm } from "@/shared/ui/post-form";
import { RegisteredAccountSchema } from "../schema";
import {
  DESK_ACCOUNT_ROLE_OPTIONS,
  type DeskAccountForm as DeskAccountFormData,
  deskAccountProblem,
  deskAccountSuccessMessage,
  toRegisterAccountBody,
} from "./desk-account-view";

const ERROR_ID = "cuenta-error";
const EMPTY: DeskAccountFormData = { name: "", email: "", role: "", password: "", repeat: "" };

function buttonLabel(pending: boolean): string {
  if (pending) {
    return FORM_MESSAGES.pending;
  }
  return "Registrar cuenta";
}

function describedBy(error: string | null): string | undefined {
  if (error === null) {
    return undefined;
  }
  return ERROR_ID;
}

interface RoleSelectProps {
  value: string;
  onChange(value: string): void;
  disabled: boolean;
  describedBy: string | undefined;
}

function RoleSelect({ value, onChange, disabled, describedBy: described }: RoleSelectProps) {
  return (
    <p>
      <label htmlFor="cuenta-rol" className="font-semibold">
        Rol
      </label>
      <select
        id="cuenta-rol"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-describedby={described}
        className={FIELD_CLASS}
      >
        <option value="">Elige un rol</option>
        {DESK_ACCOUNT_ROLE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </p>
  );
}

/** Formulario para registrar una cuenta en el mostrador (spec F36, reglas 3 y 4). Usa `POST /api/accounts` (F3). */
export function DeskAccountForm() {
  const [form, setForm] = useState<DeskAccountFormData>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function update(field: keyof DeskAccountFormData): (value: string) => void {
    return (value) => setForm((current) => ({ ...current, [field]: value }));
  }

  /** Tras un error se conservan nombre, correo y rol, y se borran las contraseñas (regla 3.5). */
  function fail(message: string): void {
    setError(message);
    setForm((current) => ({ ...current, password: "", repeat: "" }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSuccess(null);
    const problem = deskAccountProblem(form);
    if (problem !== null) {
      fail(problem);
      return;
    }
    setPending(true);
    setError(null);
    const outcome = await postForm("/api/accounts", toRegisterAccountBody(form), RegisteredAccountSchema);
    setPending(false);
    if (!outcome.ok) {
      fail(outcome.message);
      return;
    }
    setSuccess(deskAccountSuccessMessage(outcome.value));
    setForm(EMPTY);
  }

  const common = { disabled: pending, describedBy: describedBy(error) };
  return (
    <form onSubmit={handleSubmit} noValidate className={FORM_CLASS}>
      <FormField
        id="cuenta-nombre"
        label="Nombre"
        type="text"
        autoComplete="off"
        value={form.name}
        onChange={update("name")}
        {...common}
      />
      <FormField
        id="cuenta-correo"
        label="Correo"
        type="email"
        autoComplete="off"
        value={form.email}
        onChange={update("email")}
        {...common}
      />
      <RoleSelect value={form.role} onChange={update("role")} {...common} />
      <FormField
        id="cuenta-contrasena"
        label="Contraseña inicial"
        type="password"
        autoComplete="new-password"
        value={form.password}
        onChange={update("password")}
        {...common}
      />
      <FormField
        id="cuenta-repetir"
        label="Repetir contraseña"
        type="password"
        autoComplete="new-password"
        value={form.repeat}
        onChange={update("repeat")}
        {...common}
      />
      <FormFeedback errorId={ERROR_ID} error={error} success={success} />
      <button type="submit" disabled={pending} className={SUBMIT_CLASS}>
        {buttonLabel(pending)}
      </button>
    </form>
  );
}
