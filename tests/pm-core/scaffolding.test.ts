import { Scaffolding } from '../../src/pm-core/Scaffolding';
import * as path from 'path';
import * as fs from 'fs';

describe('T5.3 Project Scaffolding & Chroot Sandbox', () => {
    const baseProjectsDir = path.resolve(__dirname, '../../data/projects_test_env');
    let scaffolding: Scaffolding;

    beforeAll(() => {
        if (!fs.existsSync(baseProjectsDir)) {
            fs.mkdirSync(baseProjectsDir, { recursive: true });
        }
        scaffolding = new Scaffolding(baseProjectsDir);
    });

    afterAll(() => {
        if (fs.existsSync(baseProjectsDir)) {
            fs.rmSync(baseProjectsDir, { recursive: true, force: true });
        }
    });

    it('AC1: createProjectEnv generates standard structure', () => {
        const uuid = 'test_project_uuid_1';
        const projectPath = scaffolding.createProjectEnv(uuid, 'Test Nexus');

        expect(fs.existsSync(projectPath)).toBe(true);
        expect(fs.existsSync(path.join(projectPath, 'PROJECT.md'))).toBe(true);
        expect(fs.existsSync(path.join(projectPath, 'FILE_INDEX.md'))).toBe(true);

        const projectMd = fs.readFileSync(path.join(projectPath, 'PROJECT.md'), 'utf-8');
        expect(projectMd).toContain('project_id: "test_project_uuid_1"');
        expect(projectMd).toContain('# Test Nexus');
    });

    it('AC1: enforceSandbox throws SecurityException for Path Traversal', () => {
        const uuid = 'sandbox_test_uuid';
        scaffolding.createProjectEnv(uuid);

        // Allow reading inside project
        const validPath = scaffolding.enforceSandbox(uuid, 'PROJECT.md');
        expect(validPath).toBe(path.resolve(baseProjectsDir, uuid, 'PROJECT.md'));

        // Reject path traversal to other project
        expect(() => {
            scaffolding.enforceSandbox(uuid, '../other_project/secrets.txt');
        }).toThrow(/SecurityException/);

        // Reject path traversal to root
        expect(() => {
            scaffolding.enforceSandbox(uuid, '../../../../etc/passwd');
        }).toThrow(/SecurityException/);
        
        // Reject absolute path outside of project
        expect(() => {
            scaffolding.enforceSandbox(uuid, '/var/log/syslog');
        }).toThrow(/SecurityException/);
    });
});
