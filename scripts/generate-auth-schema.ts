import { DatabaseSync } from 'node:sqlite';
import { getMigrations } from 'better-auth/db/migration';
import { mkdir, writeFile } from 'node:fs/promises';
import { createAuth } from '../server/auth';
import type { Env } from '../server/env';
const DB = new DatabaseSync(':memory:');
try {
  const auth = createAuth({
    DB,
    APP_URL: 'http://localhost:8787',
    BETTER_AUTH_SECRET: 'schema-generation-only-do-not-use-in-production',
  } as unknown as Env);
  const migration = await getMigrations(auth.options);
  await mkdir('migrations', { recursive: true });
  await writeFile(
    'migrations/0001_auth.sql',
    `-- Generated from the installed Better Auth schema. Do not hand-edit auth tables.\n${await migration.compileMigrations()}\n`,
  );
  console.log('Generated migrations/0001_auth.sql');
} finally {
  DB.close();
}
