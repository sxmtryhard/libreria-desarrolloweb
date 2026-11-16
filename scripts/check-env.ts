import { checkEnv, formatEnvReport, isEnvValid } from "@/shared/server/env";

/** `npm run check:env`: muestra el estado de cada variable de entorno, nunca su valor (spec F0, regla 5.3). */
const report = checkEnv(process.env);
for (const line of formatEnvReport(report)) {
  console.log(line);
}
if (!isEnvValid(report)) {
  console.log("\nHay variables con problema. Revisa tu archivo .env (ver docs/empezar.md).");
  process.exitCode = 1;
}
