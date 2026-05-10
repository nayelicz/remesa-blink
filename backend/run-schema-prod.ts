// run-schema-prod.ts — corre ambos schemas contra DATABASE_URL
// Uso: npx tsx run-schema-prod.ts
import "dotenv/config";
import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const schemas = [
    path.join(__dirname, "../db/schema.sql"),
    path.join(__dirname, "../db/pricing_schema.sql"),
  ];

  for (const file of schemas) {
    if (!fs.existsSync(file)) {
      console.warn(`⚠️  No encontrado: ${file}`);
      continue;
    }
    const sql = fs.readFileSync(file, "utf8");
    console.log(`▶ Ejecutando ${path.basename(file)}...`);
    await pool.query(sql);
    console.log(`✅ ${path.basename(file)} aplicado`);
  }

  await pool.end();
  console.log("🎉 Schema completo aplicado correctamente");
}

run().catch(err => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
