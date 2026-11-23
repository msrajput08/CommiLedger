import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
export function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(readFileSync('migrations/0001_auth.sql', 'utf8'));
  sqlite.exec(readFileSync('migrations/0002_application.sql', 'utf8'));
  sqlite.exec(readFileSync('migrations/0003_workflows.sql', 'utf8'));
  const prepare = (sql: string) => {
    const args: unknown[] = [];
    const statement = {
      bind: (...values: unknown[]) => {
        args.splice(0, args.length, ...values);
        return statement;
      },
      all: async () => {
        const s = sqlite.prepare(sql);
        const values = args.map((v) =>
          v instanceof Date ? v.getTime() : v === undefined ? null : v,
        ) as (string | number | null)[];
        let results: any[] = [],
          changes = 0,
          last = 0;
        if (s.columns().length) {
          results = s.all(...values);
          if (!/^\s*(SELECT|PRAGMA)/i.test(sql)) {
            const row = sqlite.prepare('SELECT changes() as n,last_insert_rowid() as id').get() as {
              n: number;
              id: number;
            };
            changes = row.n;
            last = row.id;
          }
        } else {
          const r = s.run(...values);
          changes = Number(r.changes);
          last = Number(r.lastInsertRowid);
        }
        return { success: true, results, meta: { changes, last_row_id: last } };
      },
      first: async (column?: string) => {
        const r = (await statement.all()).results[0];
        return r ? (column ? r[column] : r) : null;
      },
      run: async () => statement.all(),
      raw: async () => {
        const r = await statement.all();
        return r.results.map((row) => Object.values(row));
      },
    };
    return statement;
  };
  const db = {
    prepare,
    exec: async (sql: string) => {
      sqlite.exec(sql);
      return { count: 1, duration: 0 };
    },
    batch: async (statements: ReturnType<typeof prepare>[]) => {
      sqlite.exec('BEGIN');
      try {
        const result = [];
        for (const s of statements) result.push(await s.all());
        sqlite.exec('COMMIT');
        return result;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
    dump: async () => new ArrayBuffer(0),
  };
  return { db: db as unknown as D1Database, sqlite, close: () => sqlite.close() };
}
