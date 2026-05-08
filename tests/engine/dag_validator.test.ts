import { validate_dag, CircularDependencyError } from '../../src/engine/dag_validator';

describe('DAG Validator', () => {
    test('should validate a simple DAG', () => {
        const tasks = ['A', 'B', 'C'];
        const edges: [string, string][] = [
            ['A', 'B'],
            ['B', 'C']
        ];
        expect(validate_dag(tasks, edges)).toBe(true);
    });

    test('should throw CircularDependencyError for a simple cycle (A->A)', () => {
        const tasks = ['A'];
        const edges: [string, string][] = [['A', 'A']];
        expect(() => validate_dag(tasks, edges)).toThrow(CircularDependencyError);
    });

    test('should throw CircularDependencyError for A->B->A', () => {
        const tasks = ['A', 'B'];
        const edges: [string, string][] = [
            ['A', 'B'],
            ['B', 'A']
        ];
        expect(() => validate_dag(tasks, edges)).toThrow(CircularDependencyError);
    });

    test('should throw CircularDependencyError for A->B->C->A', () => {
        const tasks = ['A', 'B', 'C'];
        const edges: [string, string][] = [
            ['A', 'B'],
            ['B', 'C'],
            ['C', 'A']
        ];
        expect(() => validate_dag(tasks, edges)).toThrow(CircularDependencyError);
    });

    test('should handle disconnected DAGs', () => {
        const tasks = ['A', 'B', 'C', 'D'];
        const edges: [string, string][] = [
            ['A', 'B'],
            ['C', 'D']
        ];
        expect(validate_dag(tasks, edges)).toBe(true);
    });

    test('performance: 500 nodes should be validated within 50ms', () => {
        const tasks = Array.from({ length: 500 }, (_, i) => `T${i}`);
        const edges: [string, string][] = [];
        for (let i = 0; i < 499; i++) {
            edges.push([`T${i}`, `T${i + 1}`]);
        }

        const start = performance.now();
        validate_dag(tasks, edges);
        const end = performance.now();

        expect(end - start).toBeLessThan(50);
    });
});
