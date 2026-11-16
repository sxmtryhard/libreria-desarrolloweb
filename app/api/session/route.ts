import { signInHandler, signOutHandler } from "@/features/container";

/** Ingresar: cambia el token de Firebase por la cookie de sesión (spec F4, regla 1). */
export async function POST(request: Request): Promise<Response> {
  return signInHandler(request);
}

/** Cerrar sesión (spec F4, regla 4). */
export async function DELETE(request: Request): Promise<Response> {
  return signOutHandler(request);
}
