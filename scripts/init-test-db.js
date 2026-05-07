#!/usr/bin/env node
/*
 * Nexus Dispatch V8-R1 test DB initializer.
 * Creates an isolated SQLite test DB from the checked-in Prisma schema.
 * It never copies existing SQLite files; it runs `prisma db push` against DATABASE_URL.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const argPath = process.argv[2];
const dbPath = path.resolve(
  repoRoot,
  argPath || path.join(os.tmpdir(), `nexus-v8-test-${process.pid}.db`),
);

const forbidden = new Set([
  path.join(repoRoot, 'data', 'nexus.db'),
  path.join(repoRoot, 'prisma', 'data', 'nexus.db'),
]);

if (forbidden.has(dbPath)) {
  console.error(`Refusing to initialize forbidden DB path: ${dbPath}`);
  process.exit(2);
}

if (dbPath.startsWith(path.join(repoRoot, 'data') + path.sep) || dbPath.startsWith(path.join(repoRoot, 'prisma', 'data') + path.sep)) {
  console.error(`Refusing to initialize DB under ignored runtime data directory: ${dbPath}`);
  process.exit(2);
}

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
for (const suffix of ['', '-wal', '-shm', '-journal']) {
  const candidate = `${dbPath}${suffix}`;
  if (fs.existsSync(candidate)) {
    fs.rmSync(candidate, { force: true });
  }
}

const dbUrl = `file:${dbPath}`;
execFileSync('npx', ['prisma', 'db', 'push', '--skip-generate', '--accept-data-loss'], {
  cwd: repoRoot,
  env: { ...process.env, DATABASE_URL: dbUrl },
  stdio: 'pipe',
});

console.log(JSON.stringify({
  ok: true,
  db_path: dbPath,
  database_url: dbUrl,
  schema_source: 'prisma/schema.prisma',
}));
