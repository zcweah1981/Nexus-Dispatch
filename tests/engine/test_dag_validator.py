import pytest
import time
from src.engine.dag_validator import validate_dag, CircularDependencyError

def test_validate_dag_valid():
    tasks = ["A", "B", "C", "D"]
    edges = [("A", "B"), ("A", "C"), ("B", "D"), ("C", "D")]
    assert validate_dag(tasks, edges) is True

def test_validate_dag_circular():
    tasks = ["A", "B", "C"]
    edges = [("A", "B"), ("B", "C"), ("C", "A")]
    
    start_time = time.time()
    with pytest.raises(CircularDependencyError):
        validate_dag(tasks, edges)
    end_time = time.time()
    
    execution_time = (end_time - start_time) * 1000  # ms
    assert execution_time < 50, f"Execution time {execution_time}ms exceeded 50ms limit"

def test_validate_dag_complex_circular():
    tasks = ["A", "B", "C", "D", "E"]
    edges = [("A", "B"), ("B", "C"), ("C", "D"), ("D", "B"), ("C", "E")]
    
    start_time = time.time()
    with pytest.raises(CircularDependencyError):
        validate_dag(tasks, edges)
    end_time = time.time()
    
    execution_time = (end_time - start_time) * 1000
    assert execution_time < 50

def test_validate_dag_empty():
    assert validate_dag([], []) is True

def test_validate_dag_disconnected():
    tasks = ["A", "B", "C", "D"]
    edges = [("A", "B"), ("C", "D")]
    assert validate_dag(tasks, edges) is True
