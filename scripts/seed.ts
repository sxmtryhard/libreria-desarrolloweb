import { runSeed } from "@/shared/server/seed";
import { firebaseSeedAccounts } from "@/shared/server/seed.firebase";

/** `npm run seed`: crea una cuenta de ejemplo por rol (spec F0, regla 6). Solo lo ejecuta la persona. */
async function main(): Promise<void> {
  const result = await runSeed({ accounts: firebaseSeedAccounts, password: process.env.SEED_PASSWORD });
  for (const line of result.lines) {
    console.log(line);
  }
  if (!result.ok) {
    process.exitCode = 1;
  }
}

function fail<T>(error: T): void {
  if (error instanceof Error) {
    console.error(`El seed falló: ${error.message}`);
  } else {
    console.error("El seed falló por un error inesperado.");
  }
  process.exitCode = 1;
}

main().catch(fail);
