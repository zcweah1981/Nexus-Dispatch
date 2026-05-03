import sqlite3
import json

db_path = '/root/.hermes/projects/dispatch-system/dispatch_runtime.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

try:
    cursor.execute("UPDATE tasks SET status='completed' WHERE task_id='t2-1-0cf2e9'")
    cursor.execute(
        "INSERT INTO completion_reports (project_id, task_id, report_status, summary, payload_json) VALUES (?, ?, ?, ?, ?)",
        ("proj-nexus-v71", "t2-1-0cf2e9", "success", "Implemented /api/v1/agents/register and /api/v1/projects/init endpoints", '{"git_commit_sha": "b00524e947d46d40e36aafc02161af0bd75e5d9c"}')
    )
    conn.commit()
    print("Reported successfully.")
except Exception as e:
    print(f"Failed to report: {e}")
finally:
    conn.close()
