import { changePasswordHandler } from "@/features/container";

/** Cambia la contraseña de quien tiene la sesión (spec F15). */
export async function POST(request: Request): Promise<Response> {
  return changePasswordHandler(request);
}
