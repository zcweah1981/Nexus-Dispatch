import { AdapterFactory, OpenClawAdapter, HermesMCPAdapter } from '../../src/adapters/index';

describe('T2.2: Adapter Factory', () => {
    it('should get correct adapter types', () => {
        const openclaw = AdapterFactory.get_adapter('openclaw');
        expect(openclaw).toBeInstanceOf(OpenClawAdapter);

        const hermesmcp = AdapterFactory.get_adapter('hermes_mcp');
        expect(hermesmcp).toBeInstanceOf(HermesMCPAdapter);

        expect(() => AdapterFactory.get_adapter('unknown')).toThrow('Unsupported adapter type: unknown');
    });

    it('should adapt task for openclaw', () => {
        const adapter = AdapterFactory.get_adapter('openclaw');
        const mockTask = { id: 'task-123', title: 'Test Task', description: 'Mock description' };
        const result = adapter.adapt(mockTask);

        expect(result.task_id).toBe('task-123');
        expect(result.payload.messages).toBeDefined();
        expect(result.payload.messages[1].content).toContain('Test Task');
        expect(result.payload.tools).toBeDefined();
        expect(result.payload.tools[0].function.name).toBe('submit_proof');
    });

    it('should adapt task for hermes_mcp', () => {
        const adapter = AdapterFactory.get_adapter('hermes_mcp');
        const mockTask = { id: 'task-456', title: 'Hermes Task' };
        const result = adapter.adapt(mockTask);

        expect(result.task_id).toBe('task-456');
        expect(result.payload.mcp_intent).toBe('execute_task');
        expect(result.payload.parameters.title).toBe('Hermes Task');
    });
});
