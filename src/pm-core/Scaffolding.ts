import * as fs from 'fs';
import * as path from 'path';

export class Scaffolding {
    private baseProjectsDir: string;

    constructor(baseProjectsDir: string = '/root/.hermes/projects') {
        this.baseProjectsDir = baseProjectsDir;
    }

    /**
     * Initializes the standard physical directory tree for a new project.
     * Generates PROJECT.md and FILE_INDEX.md
     */
    public createProjectEnv(uuid: string, projectName: string = "New Project"): string {
        const projectPath = path.join(this.baseProjectsDir, uuid);

        if (!fs.existsSync(projectPath)) {
            fs.mkdirSync(projectPath, { recursive: true });
        }

        const projectMdContent = `---
project_id: "${uuid}"
status: "active"
---
# ${projectName}

## 1. Objective
(To be defined)

## 2. Constraints
(To be defined)
`;

        const fileIndexMdContent = `# File Index

- PROJECT.md
- FILE_INDEX.md
`;

        fs.writeFileSync(path.join(projectPath, 'PROJECT.md'), projectMdContent);
        fs.writeFileSync(path.join(projectPath, 'FILE_INDEX.md'), fileIndexMdContent);

        return projectPath;
    }

    /**
     * A chroot wrapper to prevent Path Traversal.
     * Intercepts underlying file read/write operations and throws SecurityException if the path
     * resolves outside the provided project UUID directory.
     */
    public enforceSandbox(uuid: string, targetPath: string): string {
        const rootPath = path.resolve(this.baseProjectsDir, uuid);
        // Target path might be relative or absolute.
        // If relative, resolve it against the rootPath. If absolute, it stays absolute.
        const resolvedTargetPath = path.resolve(rootPath, targetPath);

        // Ensure the resolved target path starts exactly with the root path
        if (!resolvedTargetPath.startsWith(rootPath + path.sep) && resolvedTargetPath !== rootPath) {
            throw new Error(`SecurityException: Access denied to path outside of project sandbox. (Attempted: ${targetPath})`);
        }

        return resolvedTargetPath;
    }

    public readFileInSandbox(uuid: string, filePath: string): string {
        const safePath = this.enforceSandbox(uuid, filePath);
        return fs.readFileSync(safePath, 'utf8');
    }

    public writeFileInSandbox(uuid: string, filePath: string, content: string): void {
        const safePath = this.enforceSandbox(uuid, filePath);
        fs.writeFileSync(safePath, content, 'utf8');
    }
}
