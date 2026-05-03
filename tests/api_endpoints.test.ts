import { createServer } from '../src/api/server';
import DAL from '../src/db/dal';
import request from 'supertest';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const testDbPath = path.resolve(__dirname, `../data/test_${uuidv4()}.db`);
let dal: DAL;
let app: any;
const AUTH_TOKEN = 'test-token';

beforeAll(() => {
    // Create data dir if not exists
    if (!fs.existsSync(path.dirname(testDbPath))) {
        fs.mkdirSync(path.dirname(testDbPath), { recursive: true });
    }
    
    dal = new DAL(testDbPath);
    
    // Init schema
    const schemaSql = fs.readFileSync(path.resolve(__dirname, '../src/db/migrations/V1__init_schema.sql'), 'utf-8');
    dal.initSchema(schemaSql);
    
    app = createServer(dal, AUTH_TOKEN);
});

afterAll(() => {
    dal.close();
    if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(`${testDbPath}-wal`)) {
        fs.unlinkSync(`${testDbPath}-wal`);
    }
    if (fs.existsSync(`${testDbPath}-shm`)) {
        fs.unlinkSync(`${testDbPath}-shm`);
    }
});

describe('API Endpoints: /v1/agents/register and /v1/projects/init', () => {
    it('should register a new agent successfully', async () => {
        const response = await request(app)
            .post('/v1/agents/register')
            .set('Authorization', `Bearer ${AUTH_TOKEN}`)
            .send({
                id: 'worker-node-1',
                lane: 'DEV'
            });
            
        expect(response.status).toBe(200);
        expect(response.body.id).toBe('worker-node-1');
        expect(response.body.lane).toBe('DEV');
        expect(response.body.status).toBe('online');
        
        // Verify in DB
        const worker = (dal as any).db.prepare('SELECT * FROM nexus_workers WHERE id = ?').get('worker-node-1');
        expect(worker).toBeDefined();
        expect(worker.lane).toBe('DEV');
        expect(worker.status).toBe('online');
    });

    it('should fail to register an agent without required fields', async () => {
        const response = await request(app)
            .post('/v1/agents/register')
            .set('Authorization', `Bearer ${AUTH_TOKEN}`)
            .send({
                lane: 'DEV'
            });
            
        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Missing required fields');
    });

    it('should update existing agent lane and heartbeat on re-register', async () => {
        // Initial register
        await request(app)
            .post('/v1/agents/register')
            .set('Authorization', `Bearer ${AUTH_TOKEN}`)
            .send({ id: 'worker-node-2', lane: 'DEV' });
            
        const initialWorker = (dal as any).db.prepare('SELECT * FROM nexus_workers WHERE id = ?').get('worker-node-2');
        const initialHeartbeat = initialWorker.last_heartbeat;
        
        // Wait a bit
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Re-register with different lane
        const response = await request(app)
            .post('/v1/agents/register')
            .set('Authorization', `Bearer ${AUTH_TOKEN}`)
            .send({ id: 'worker-node-2', lane: 'PROD' });
            
        expect(response.status).toBe(200);
        expect(response.body.lane).toBe('PROD');
        
        const updatedWorker = (dal as any).db.prepare('SELECT * FROM nexus_workers WHERE id = ?').get('worker-node-2');
        expect(updatedWorker.lane).toBe('PROD');
        expect(updatedWorker.last_heartbeat).not.toBe(initialHeartbeat);
    });

    it('should init a project successfully', async () => {
        const response = await request(app)
            .post('/v1/projects/init')
            .set('Authorization', `Bearer ${AUTH_TOKEN}`)
            .send({
                name: 'Test Project V1',
                description: 'A test project for API verification'
            });
            
        expect(response.status).toBe(201);
        expect(response.body.id).toBeDefined();
        expect(response.body.name).toBe('Test Project V1');
        expect(response.body.status).toBe('active');
        
        const projectId = response.body.id;
        
        // Verify in DB
        const project = (dal as any).db.prepare('SELECT * FROM nexus_projects WHERE id = ?').get(projectId);
        expect(project).toBeDefined();
        expect(project.name).toBe('Test Project V1');
        expect(project.description).toBe('A test project for API verification');
        
        // Verify file system
        const projectRoot = path.resolve(process.env.NEXUS_ROOT || '/root/.hermes/projects', projectId);
        expect(fs.existsSync(projectRoot)).toBe(true);
        expect(fs.existsSync(path.join(projectRoot, 'PROJECT.md'))).toBe(true);
        expect(fs.existsSync(path.join(projectRoot, 'FILE_INDEX.md'))).toBe(true);
        
        // Cleanup test files
        fs.rmSync(projectRoot, { recursive: true, force: true });
    });

    it('should fail to init project without a name', async () => {
         const response = await request(app)
            .post('/v1/projects/init')
            .set('Authorization', `Bearer ${AUTH_TOKEN}`)
            .send({
                description: 'Missing name'
            });
            
        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Missing required field');
    });
});
