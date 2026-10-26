// Checks that MIGRATION_DATABASE_URL is reachable. Never prints the URL or password.
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local", quiet: true });

const url = process.env.MIGRATION_DATABASE_URL;
if (!url) {
  console.error("MIGRATION_DATABASE_URL is not set");
  process.exit(1);
}

// Strip any secret that might appear inside an error message.
function redact(text: string): string {
  const secrets = [url as string];
  try {
    const parsed = new URL(url as string);
    if (parsed.password) {
      secrets.push(parsed.password, decodeURIComponent(parsed.password));
    }
  } catch {
    // Unparseable URL: only the full string is redacted.
  }
  let out = text;
  for (const secret of secrets) {
    if (secret) out = out.split(secret).join("[redacted]");
  }
  return out;
}

let sql: postgres.Sql | undefined;

try {
  sql = postgres(url, { max: 1, connect_timeout: 10, onnotice: () => {} });
  const [row] = await sql`select version()`;
  console.log(`Connected: ${row.version}`);
} catch (err) {
  const e = err as { code?: string; name?: string; message?: string };
  console.error(`Error ${e.code ?? e.name ?? "UNKNOWN"}: ${redact(e.message ?? "")}`);
  process.exitCode = 1;
} finally {
  await sql?.end({ timeout: 5 });
}
