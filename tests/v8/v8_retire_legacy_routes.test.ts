import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../..');

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', '.git', 'legacy', 'archive', 'webui'].includes(entry.name)) continue;
      walk(full, acc);
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

describe('V8-R10 legacy route and DAL retirement boundary', () => {
  test('production API entrypoint no longer opens the legacy better-sqlite3 DAL or data/nexus.db', () => {
    const source = read('src/api/index.ts');

    expect(source).not.toMatch(/\.\.\/db\/dal|new\s+DAL\(|data\/nexus\.db|createServer\(dal/);
    expect(source).toMatch(/PrismaDAL/);
    expect(source).toMatch(/createServer\([^,]+,\s*[^,]+,\s*prismaDal\)/);
  });

  test('createServer is not typed around the legacy DAL production dependency', () => {
    const source = read('src/api/server.ts');

    expect(source).not.toMatch(/import\s+DAL\s+from\s+['"]\.\.\/db\/dal['"]/);
    expect(source).not.toMatch(/createServer\(dal:\s*DAL/);
    expect(source).not.toMatch(/app\.(?:post|get|patch|put|delete)\(['"]\/v1\//);
  });

  test('V8 runtime router does not register legacy direct-DB task routes or import the old DAL', () => {
    const source = read('src/api/routes.ts');

    expect(source).not.toMatch(/import\s+DAL\s+from\s+['"]\.\.\/db\/dal['"]/);
    expect(source).not.toMatch(/dal\.|\(dal as any\)|\.\.\/db\/dal/);
    expect(source).not.toMatch(/router\.(?:post|get|patch|put|delete)\(['"]\/tasks\/(?:claim|:id\/release|:id\/submit_proof)['"]/);
  });

  test('daemon mainline uses V8 runtime API endpoints, not legacy /tasks direct DB flow or production DB fallback', () => {
    const source = read('src/daemon/main.ts');

    expect(source).not.toMatch(/(?<!\/runtime)\/tasks\/pending|(?<!\/runtime)\/tasks\/recover-timeouts|(?<!\/runtime)\/tasks\/\$\{task\.id\}\/claim|(?<!\/runtime)\/tasks\/\$\{task\.id\}\/status|(?<!\/runtime)\/runs(?:['"]|\/)/);
    expect(source).not.toMatch(/prisma\/data\/nexus\.db|data\/nexus\.db/);
    expect(source).toMatch(/\/runtime\/tasks/);
    expect(source).toMatch(/\/runtime\/runs/);
  });

  test('non-legacy src production files do not contain direct SQLite/raw SQL business-write paths', () => {
    const allowed = new Set([
      path.join(repoRoot, 'src/db/dal.ts'),
      path.join(repoRoot, 'src/db/prisma_dal.ts'),
    ]);
    const deny = /better-sqlite3|sqlite3|data\/nexus\.db|\$queryRaw|\$executeRaw/g;
    const offenders: string[] = [];

    for (const file of walk(path.join(repoRoot, 'src'))) {
      if (allowed.has(file)) continue;
      const rel = path.relative(repoRoot, file);
      const source = fs.readFileSync(file, 'utf8');
      const matches = source.match(deny);
      if (matches) offenders.push(`${rel}: ${Array.from(new Set(matches)).join(', ')}`);
    }

    expect(offenders).toEqual([]);
  });
});
