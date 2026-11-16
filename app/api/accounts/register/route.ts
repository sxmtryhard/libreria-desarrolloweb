import { selfRegisterHandler } from "@/features/container";

/** Autorregistrarse (spec F10). */
export async function POST(request: Request): Promise<Response> {
  return selfRegisterHandler(request);
}
