import { staffAccountHandler } from "@/features/container";

/** Crea una cuenta de bibliotecario; solo administradores (spec F13). */
export async function POST(request: Request): Promise<Response> {
  return staffAccountHandler(request);
}
