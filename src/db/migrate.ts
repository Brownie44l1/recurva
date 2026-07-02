import { getDb, closeDb } from './client';
import { logger } from '../logger';
import * as fs from 'fs';
import * as path from 'path';

const MIGRATIONS_DIR = path.join(import.meta.dirname, '../../migrations');

async function ensureMigrationsTable(sql: ReturnType<typeof getDb>) {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER NOT NULL,
      name TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (version, name)
    )
  `;

  // If the old primary key (only on version) exists, upgrade it to composite (version, name)
  const cols = await sql<{ attname: string }[]>`
    SELECT a.attname
    FROM   pg_index i
    JOIN   pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
    WHERE  i.indrelid = 'schema_migrations'::regclass AND i.indisprimary
  `;
  if (cols.length === 1 && cols[0].attname === 'version') {
    logger.info('Upgrading schema_migrations primary key to (version, name)');
    await sql`ALTER TABLE schema_migrations DROP CONSTRAINT schema_migrations_pkey`;
    await sql`ALTER TABLE schema_migrations ADD PRIMARY KEY (version, name)`;
  }
}

async function getAppliedMigrations(sql: ReturnType<typeof getDb>): Promise<Set<string>> {
  const rows = await sql<{ name: string }[]>`SELECT name FROM schema_migrations`;
  return new Set(rows.map((r) => r.name));
}

async function getMigrationFiles(): Promise<{ version: number; name: string; filePath: string }[]> {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  return files.map((f) => {
    const match = f.match(/^(\d+)_(.+)\.sql$/);
    if (!match) throw new Error(`Invalid migration filename: ${f} (must be NNN_description.sql)`);
    return {
      version: parseInt(match[1]!),
      name: match[2]!,
      filePath: path.join(MIGRATIONS_DIR, f),
    };
  });
}

async function migrate() {
  const sql = getDb();
  await ensureMigrationsTable(sql);

  const applied = await getAppliedMigrations(sql);
  const migrations = await getMigrationFiles();

  for (const migration of migrations) {
    if (applied.has(migration.name)) {
      logger.debug({ version: migration.version, name: migration.name }, 'Migration already applied');
      continue;
    }

    const content = fs.readFileSync(migration.filePath, 'utf-8');

    await sql.begin(async (tx) => {
      await tx.unsafe(content);
      await tx`
        INSERT INTO schema_migrations (version, name)
        VALUES (${migration.version}, ${migration.name})
      `;
    });

    logger.info({ version: migration.version, name: migration.name }, 'Migration applied');
  }

  logger.info('All migrations up to date');
  await closeDb();
}

async function rollback() {
  const sql = getDb();
  await ensureMigrationsTable(sql);

  const last = await sql<{ version: number; name: string }[]>`
    SELECT version, name FROM schema_migrations ORDER BY version DESC, applied_at DESC LIMIT 1
  `;

  if (last.length === 0) {
    logger.info('No migrations to roll back');
    await closeDb();
    return;
  }

  const { version, name } = last[0]!;
  const migration = (await getMigrationFiles()).find((m) => m.version === version && m.name === name);

  if (!migration) {
    logger.error({ version, name }, 'Migration file not found for rollback');
    process.exit(1);
  }

  const content = fs.readFileSync(migration.filePath, 'utf-8');
  const rollbackMatch = content.match(/-- ROLLBACK:\n([\s\S]*)/);

  if (!rollbackMatch) {
    logger.error({ version, name }, 'No ROLLBACK section found in migration');
    process.exit(1);
  }

  await sql.begin(async (tx) => {
    await tx.unsafe(rollbackMatch[1]!);
    await tx`DELETE FROM schema_migrations WHERE version = ${version} AND name = ${name}`;
  });

  logger.info({ version, name }, 'Migration rolled back');
  await closeDb();
}

const args = process.argv.slice(2);
if (args.includes('--rollback')) {
  await rollback();
} else {
  await migrate();
}

