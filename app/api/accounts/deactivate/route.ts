import { deactivateAccountHandler } from "@/features/container";

/** Desactiva una cuenta; solo el personal (spec F14). */
export async function POST(request: Request): Promise<Response> {
  return deactivateAccountHandler(request);
}
