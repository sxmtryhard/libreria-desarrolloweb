/** Campo con etiqueta para los formularios del personal (spec F36, regla 4.5). */

export const FIELD_CLASS =
  "mt-1 block min-h-11 w-full rounded border border-control-border bg-surface px-3 py-2 text-ink disabled:bg-surface-alt";

export const SUBMIT_CLASS =
  "min-h-11 w-full rounded bg-primary px-4 py-2 font-semibold text-surface hover:bg-primary-hover disabled:bg-primary-strong md:w-auto";

export const FORM_CLASS = "mt-6 space-y-4 rounded-lg border border-line bg-surface-alt p-4";

interface FormFieldProps {
  id: string;
  label: string;
  type: "text" | "email" | "password" | "number";
  autoComplete: string;
  value: string;
  onChange(value: string): void;
  disabled: boolean;
  describedBy: string | undefined;
  inputMode?: "numeric";
}

export function FormField({
  id,
  label,
  type,
  autoComplete,
  value,
  onChange,
  disabled,
  describedBy,
  inputMode,
}: FormFieldProps) {
  return (
    <p>
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        inputMode={inputMode}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-describedby={describedBy}
        className={FIELD_CLASS}
      />
    </p>
  );
}

/** Éxito (`role="status"`) o error (`role="alert"`) del último envío (regla 4.4). */
export function FormFeedback({
  errorId,
  error,
  success,
}: {
  errorId: string;
  error: string | null;
  success: string | null;
}) {
  if (error !== null) {
    return (
      <p id={errorId} role="alert" className="font-semibold text-danger">
        Error: {error}
      </p>
    );
  }
  if (success !== null) {
    return (
      <p role="status" className="font-semibold text-success">
        {success}
      </p>
    );
  }
  return null;
}
