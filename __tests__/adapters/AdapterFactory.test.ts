import { AdapterFactory, BaseAdapter } from '../../src/adapters/index';

describe('T2.2: Adapter Factory', () => {
    it('should get correct adapter types', () => {
        const openclaw = AdapterFactory.get_adapter('openclaw');
        expect(openclaw).toBeDefined();

        const hermesmcp = AdapterFactory.get_adapter('hermes_mcp');
        expect(hermesmcp).toBeDefined();

        expect(() => AdapterFactory.get_adapter('unknown')).toThrow('Unsupported adapter type: unknown');
    });
});
