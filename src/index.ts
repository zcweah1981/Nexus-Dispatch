import { NexusToolchain } from './pm-core/NexusToolchain';

export { NexusToolchain };

// 简易测试/验证
if (require.main === module) {
    const toolchain = new NexusToolchain('test-project-123');
    
    // Test 1: Cyclic DAG (Should fail)
    toolchain.createDagPlan([
        { task_id: 'A', title: 'Task A', dependencies: ['B'] },
        { task_id: 'B', title: 'Task B', dependencies: ['A'] }
    ]).catch(e => {
        console.log("Cycle detection test passed:", e.message);
    });

    // Test 2: Artifact Validation
    toolchain.acceptArtifact('A', { type: 'live_url', payload: { url: 'http://test.com', http_code: 200 } });
}
