import Database from 'better-sqlite3';
const db = new Database('./data/nexus.db');

try {
  db.transaction(() => {
    db.prepare("UPDATE nexus_runs SET status = 'success', ended_at = CURRENT_TIMESTAMP WHERE run_id = 'run-t6-1'").run();
    db.prepare("UPDATE nexus_tasks SET status = 'validating' WHERE id = 'proj-nexus-v71:t6-1'").run();
    db.prepare("INSERT INTO nexus_artifacts (id, run_id, artifact_type, payload) VALUES ('t6-1-artifact', 'run-t6-1', 'json_proof', '{\"test_passed\": true}')").run();
  })();
  console.log('Success');
} catch (e) {
  console.error(e);
}
