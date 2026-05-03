import { nexus_create_project_env, safeReadFile, safeWriteFile, SecurityException } from '../src/utils/sandbox';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Sandbox Utilities', () => {
    let testBasePath: string;
    const testProjectId = 'test-uuid-1234';
    let projectRoot: string;

    beforeEach(() => {
        // Create a temporary directory for testing
        testBasePath = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-test-'));
        projectRoot = path.join(testBasePath, testProjectId);
    });

    afterEach(() => {
        // Clean up the temporary directory
        fs.rmSync(testBasePath, { recursive: true, force: true });
    });

    it('should create project environment skeleton', () => {
        const root = nexus_create_project_env(testProjectId, testBasePath);
        
        expect(root).toBe(projectRoot);
        expect(fs.existsSync(path.join(root, 'PROJECT.md'))).toBe(true);
        expect(fs.existsSync(path.join(root, 'FILE_INDEX.md'))).toBe(true);
        expect(fs.existsSync(path.join(root, 'docs'))).toBe(true);
        expect(fs.existsSync(path.join(root, 'src'))).toBe(true);
        expect(fs.existsSync(path.join(root, 'governance'))).toBe(true);
    });

    it('should allow reading and writing within sandbox', () => {
        nexus_create_project_env(testProjectId, testBasePath);
        
        const validPath = path.join(projectRoot, 'src', 'test.txt');
        
        expect(() => {
            safeWriteFile(validPath, 'hello world', testProjectId, testBasePath);
        }).not.toThrow();

        const content = safeReadFile(validPath, testProjectId, testBasePath);
        expect(content).toBe('hello world');
    });

    it('should block path traversal outside sandbox', () => {
        nexus_create_project_env(testProjectId, testBasePath);
        
        // Attempt to read something outside, like the parent directory
        const maliciousPath = path.join(projectRoot, '..', 'secrets.txt');
        
        // Just create the file outside sandbox so it actually exists if we bypassed it
        fs.writeFileSync(maliciousPath, 'secret data', 'utf-8');

        expect(() => {
            safeReadFile(maliciousPath, testProjectId, testBasePath);
        }).toThrow(SecurityException);
        
        expect(() => {
            safeReadFile(maliciousPath, testProjectId, testBasePath);
        }).toThrow(/Path traversal blocked/);
        
        expect(() => {
            safeWriteFile(maliciousPath, 'override', testProjectId, testBasePath);
        }).toThrow(SecurityException);
    });
});
