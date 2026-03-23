/** Ejecuta el keeper una sola vez (para tests) */
import "dotenv/config";
import { ejecutarPagos } from "./src/keeper/cron.js";

ejecutarPagos()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
