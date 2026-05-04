/**
 * Error thrown when a circular dependency is detected in the DAG.
 */
export class CircularDependencyError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CircularDependencyError';
        Object.setPrototypeOf(this, CircularDependencyError.prototype);
    }
}

/**
 * Validate a Directed Acyclic Graph (DAG) for circular dependencies using DFS three-color marking.
 * 
 * @param tasks List of task IDs.
 * @param edges List of tuples [source_task_id, target_task_id] representing dependencies.
 * @returns true if DAG is valid, otherwise throws CircularDependencyError.
 * @throws {CircularDependencyError} If a cycle is detected.
 */
export function validate_dag(tasks: string[], edges: [string, string][]): boolean {
    // Build adjacency list
    const adj = new Map<string, string[]>();
    
    for (const task of tasks) {
        adj.set(task, []);
    }
    
    for (const [u, v] of edges) {
        // Handle cases where tasks might not be in the initial list
        if (!adj.has(u)) adj.set(u, []);
        if (!adj.has(v)) adj.set(v, []);
        adj.get(u)!.push(v);
    }

    /**
     * Color states:
     * 0 = Unvisited (White)
     * 1 = Visiting (Gray) - In current recursion stack
     * 2 = Visited (Black) - Fully explored
     */
    const colors = new Map<string, number>();
    for (const task of adj.keys()) {
        colors.set(task, 0);
    }

    function dfs(node: string): void {
        colors.set(node, 1);
        
        const neighbors = adj.get(node) || [];
        for (const neighbor of neighbors) {
            const color = colors.get(neighbor);
            if (color === 1) {
                throw new CircularDependencyError(`Circular dependency detected involving task ${neighbor}`);
            }
            if (color === 0) {
                dfs(neighbor);
            }
        }
        
        colors.set(node, 2);
    }

    for (const task of adj.keys()) {
        if (colors.get(task) === 0) {
            dfs(task);
        }
    }

    return true;
}
