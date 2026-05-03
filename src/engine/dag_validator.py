class CircularDependencyError(Exception):
    pass

def validate_dag(tasks: list, edges: list) -> bool:
    """
    Validate a Directed Acyclic Graph (DAG) for circular dependencies using DFS three-color marking.
    
    :param tasks: List of task IDs.
    :param edges: List of tuples (source_task_id, target_task_id) representing dependencies.
    :return: True if DAG is valid, otherwise raises CircularDependencyError.
    """
    # Build adjacency list
    adj = {task: [] for task in tasks}
    for u, v in edges:
        if u not in adj:
            adj[u] = []
        if v not in adj:
            adj[v] = []
        adj[u].append(v)
        
    # Color states: 
    # 0 = Unvisited (White)
    # 1 = Visiting (Gray)
    # 2 = Visited (Black)
    colors = {task: 0 for task in adj.keys()}
    
    def dfs(node):
        colors[node] = 1
        for neighbor in adj.get(node, []):
            if colors[neighbor] == 1:
                raise CircularDependencyError(f"Circular dependency detected involving task {neighbor}")
            if colors[neighbor] == 0:
                dfs(neighbor)
        colors[node] = 2
        
    for task in adj.keys():
        if colors[task] == 0:
            dfs(task)
            
    return True
