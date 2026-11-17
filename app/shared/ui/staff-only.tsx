import type { ReactNode } from "react";
import type { Role } from "@/shared/schema";
import { FORM_MESSAGES } from "./form-messages";

const STAFF_ROLES: readonly Role[] = ["BIBLIOTECARIO", "ADMINISTRADOR"];

/** Muestra `children` solo al personal; a los demás, el aviso de F34 (spec F36, regla 1.2). */
export function StaffOnly({ role, children }: { role: Role; children: ReactNode }) {
  if (!STAFF_ROLES.includes(role)) {
    return (
      <p role="alert" className="mt-6 font-semibold text-danger">
        Error: {FORM_MESSAGES.forbiddenScreen}
      </p>
    );
  }
  return children;
}
