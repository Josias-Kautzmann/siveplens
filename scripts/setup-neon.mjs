import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Caminho do .env.local
const envPath = path.resolve(__dirname, '../.env.local');
let databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl && fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  // Encontra a linha DATABASE_URL=...
  const match = envContent.match(/^DATABASE_URL\s*=\s*(.+)$/m);
  if (match) {
    databaseUrl = match[1].trim();
    // Limpa aspas se houver
    if (databaseUrl.startsWith('"') && databaseUrl.endsWith('"')) {
      databaseUrl = databaseUrl.slice(1, -1);
    }
    if (databaseUrl.startsWith("'") && databaseUrl.endsWith("'")) {
      databaseUrl = databaseUrl.slice(1, -1);
    }
  }
}

if (!databaseUrl) {
  console.error("❌ DATABASE_URL não encontrada no ambiente nem no arquivo .env.local!");
  console.error("Por favor, configure a variável DATABASE_URL no .env.local antes de rodar o setup.");
  process.exit(1);
}

console.log("🔌 Conectando ao banco Neon...");
console.log(`🔗 Target: ${databaseUrl.split('@')[1] || 'URL oculta'}`);

const sql = postgres(databaseUrl, { ssl: 'require' });

try {
  console.log("📖 Lendo drizzle/neon_setup.sql...");
  const sqlPath = path.resolve(__dirname, '../drizzle/neon_setup.sql');
  const schemaSql = fs.readFileSync(sqlPath, 'utf8');

  console.log("⏳ Implantando tabelas, índices e stored procedures...");
  // Executa todo o script SQL bruto diretamente
  await sql.unsafe(schemaSql);

  console.log("✅ Banco de dados Neon configurado e pronto com sucesso!");
} catch (error) {
  console.error("❌ Ocorreu um erro ao executar os comandos no Neon:", error);
  process.exit(1);
} finally {
  await sql.end();
}
