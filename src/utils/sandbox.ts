import * as fs from 'fs';
import * as path from 'path';

export class SecurityException extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SecurityException';
    }
}

/**
 * Creates the project physical directory skeleton and base files.
 * @param projectId UUID of the project
 * @param basePath The base path for all projects (e.g., /.hermes/projects)
 */
export function nexus_create_project_env(projectId: string, basePath: string = '/.hermes/projects'): string {
    const projectRoot = path.resolve(basePath, projectId);

    // Create directories
    const dirs = [
        projectRoot,
        path.join(projectRoot, 'docs'),
        path.join(projectRoot, 'src'),
        path.join(projectRoot, 'governance'),
    ];

    for (const dir of dirs) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    // Create base files
    const projectMdPath = path.join(projectRoot, 'PROJECT.md');
    if (!fs.existsSync(projectMdPath)) {
        const today = new Date().toISOString().split('T')[0];
        const template = `---
project_id: "${projectId}"
status: "active"
created_at: "${today}"
---
# 项目名称：[提取自指令的名称]

## 1. 核心目标 (Objective)
> 要求：一句话讲清系统要解决什么问题，实现什么商业价值。
- 目标描述：...

## 2. 红线与约束 (Constraints & Anti-Goals)
> 要求：明确规定“不能做什么”、“必须用什么”。
`;
        fs.writeFileSync(projectMdPath, template, 'utf-8');
    }

    const fileIndexPath = path.join(projectRoot, 'FILE_INDEX.md');
    if (!fs.existsSync(fileIndexPath)) {
        fs.writeFileSync(fileIndexPath, `# File Index for ${projectId}\n`, 'utf-8');
    }

    const prdMdPath = path.join(projectRoot, 'docs', 'PRD.md');
    if (!fs.existsSync(prdMdPath)) {
        fs.writeFileSync(prdMdPath, `# PRD Draft\n`, 'utf-8');
    }

    const rulesMdPath = path.join(projectRoot, 'governance', 'RULES.md');
    if (!fs.existsSync(rulesMdPath)) {
        fs.writeFileSync(rulesMdPath, `# Governance Rules\n`, 'utf-8');
    }

    return projectRoot;
}

/**
 * Ensures the target path is strictly within the allowed project root directory.
 * Prevents Path Traversal attacks (e.g., ../../etc/passwd)
 */
function enforceSandbox(targetPath: string, projectRoot: string): string {
    const absoluteTarget = path.resolve(targetPath);
    const absoluteRoot = path.resolve(projectRoot);

    if (!absoluteTarget.startsWith(absoluteRoot + path.sep) && absoluteTarget !== absoluteRoot) {
        throw new SecurityException(`Path traversal blocked: ${targetPath} is outside the allowed directory ${projectRoot}`);
    }

    return absoluteTarget;
}

/**
 * Safely reads a file, ensuring it remains within the project's sandbox.
 */
export function safeReadFile(targetPath: string, projectId: string, basePath: string = '/.hermes/projects'): string {
    const projectRoot = path.resolve(basePath, projectId);
    const safePath = enforceSandbox(targetPath, projectRoot);

    if (!fs.existsSync(safePath)) {
        throw new Error(`File not found: ${safePath}`);
    }

    return fs.readFileSync(safePath, 'utf-8');
}

/**
 * Safely writes a file, ensuring it remains within the project's sandbox.
 */
export function safeWriteFile(targetPath: string, content: string, projectId: string, basePath: string = '/.hermes/projects'): void {
    const projectRoot = path.resolve(basePath, projectId);
    const safePath = enforceSandbox(targetPath, projectRoot);

    const dir = path.dirname(safePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(safePath, content, 'utf-8');
}
