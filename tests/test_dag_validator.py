import time
import pytest
from src.engine.dag_validator import validate_dag, CircularDependencyError

def test_valid_dag():
    tasks = ["A", "B", "C", "D"]
    edges = [("A", "B"), ("B", "C"), ("C", "D")]
    assert validate_dag(tasks, edges) == True

def test_circular_dependency():
    tasks = ["A", "B", "C"]
    edges = [("A", "B"), ("B", "C"), ("C", "A")]
    
    start_time = time.perf_counter()
    with pytest.raises(CircularDependencyError) as exc_info:
        validate_dag(tasks, edges)
    end_time = time.perf_counter()
    
    assert "Circular dependency detected" in str(exc_info.value)
    
    # Execution time < 50ms
    assert (end_time - start_time) * 1000 < 50

def test_complex_dag_no_cycle():
    tasks = [str(i) for i in range(100)]
    edges = [(str(i), str(i+1)) for i in range(99)]
    assert validate_dag(tasks, edges) == True
