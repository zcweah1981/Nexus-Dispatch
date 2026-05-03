import { AdapterFactory, OpenClawAdapter, HermesMCPAdapter } from '../../src/adapters/index';
import { Task } from '../../src/db/dal';

describe('AdapterFactory', () => {
    const mockTask: Task = {
        id: 'task-123',
        project_id: 'proj-1',
        title: 'Test Task',
        objective: 'Write a unit test',
        lane: 'LANE_CODE',
        status: 'created',
        max_retries: 3,
        retry_count: 0,
        payload_schema: {
            type: 'object',
            properties: {
                test_passed: { type: 'boolean' }
            },
            required: ['test_passed']
        },
        ext_meta: {},
        created_at: new Date().toISOString()
    };

    it('should return OpenClawAdapter', () => {
        const adapter = AdapterFactory.getAdapter('openclaw');
        expect(adapter).toBeInstanceOf(OpenClawAdapter);
        const payload = adapter.buildPayload(mockTask);
        expect(payload.model).toBe('openclaw-v1');
        expect(payload.messages[1].content).toContain(mockTask.objective);
        expect(payload.tools[0].function.parameters).toEqual(mockTask.payload_schema);
    });

    it('should return HermesMCPAdapter', () => {
        const adapter = AdapterFactory.getAdapter('hermes_mcp');
        expect(adapter).toBeInstanceOf(HermesMCPAdapter);
        const payload = adapter.buildPayload(mockTask);
        expect(payload.jsonrpc).toBe('2.0');
        expect(payload.method).toBe('execute_task');
        expect(payload.params.objective).toBe(mockTask.objective);
        expect(payload.params.schema).toEqual(mockTask.payload_schema);
    });

    it('should throw error on unknown adapter', () => {
        expect(() => AdapterFactory.getAdapter('unknown')).toThrow('Unsupported adapter type: unknown');
    });
});
