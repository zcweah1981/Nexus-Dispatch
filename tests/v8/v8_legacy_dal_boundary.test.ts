import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(__dirname, '../..');
const boundaryDocPath = path.join(repoRoot, 'docs/v8/legacy-dal-boundary.md');
const repositoryPath = path.join(repoRoot, 'src/repositories/v8.ts');

describe('V8-R1 legacy DAL retirement boundary', () => {
  test('documents legacy DAL as read-only archive reference outside the V8 mainline', () => {
    const doc = fs.readFileSync(boundaryDocPath, 'utf8');

    expect(doc).toContain('legacy DAL 只读适配 / archive 边界');
    expect(doc).toContain('不得参与 V8 新主流程');
    expect(doc).toContain('V8 Repository 是唯一主线数据访问入口');
    expect(doc).toContain('src/db/dal.ts');
    expect(doc).toContain('tests/legacy/**');
    expect(doc).toContain('R2 Runtime API + FSM Controller 输入');
  });

  test('keeps the V8 Repository source free from legacy SQLite/DAL dependencies', () => {
    const source = fs.readFileSync(repositoryPath, 'utf8');

    expect(source).not.toMatch(/src\/db\/dal|\.\.\/db\/dal|better-sqlite3|sqlite3|data\/nexus\.db|prisma\/data\/nexus\.db/);
    expect(source).toContain("from '@prisma/client'");
    expect(source).toContain('ProjectRepository');
    expect(source).toContain('TaskRepository');
    expect(source).toContain('RunRepository');
    expect(source).toContain('ReportRepository');
  });
});
