#!/usr/bin/env node
/*
 * R13_API_DEPLOY_VALIDATION_CONTRACT
 * Low-risk API Server deployment validation:
 * - runs Prisma schema validation;
 * - runs a focused V8 test subset;
 * - optionally probes the live Runtime API health boundary.
 *
 * This script never opens SQLite and never performs business DB writes.
 */

const { spawnSync } = require('child_process');
const http = require('http');

const args = new Set(process.argv.slice(2));
const skipTests = args.has('--skip-tests');
const skipHealth = args.has('--skip-health');
const json = args.has('--json');

const apiBase = process.env.NEXUS_API_BASE || `http://127.0.0.1:${process.env.NEXUS_API_PORT || process.env.PORT || '8000'}`;
const projectId = process.env.NEXUS_PROJECT_ID || process.env.PROJECT_ID || 'nexus-dispatch';
const token = process.env.API_AUTH_TOKEN || process.env.PM_API_TOKEN || '';
const results = [];

function record(name, status, detail) {
  results.push({ name, status, detail });
  if (!json) {
    const mark = status === 'pass' ? 'PASS' : status === 'skip' ? 'SKIP' : 'FAIL';
    console.log(`[${mark}] ${name}: ${detail}`);
  }
}

function run(name, command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    stdio: json ? 'pipe' : 'inherit',
    shell: false,
    env: process.env,
  });
  if (result.status === 0) {
    record(name, 'pass', `${command} ${commandArgs.join(' ')}`);
    return true;
  }
  const stderr = result.stderr ? result.stderr.toString().slice(-800) : '';
  record(name, 'fail', `${command} ${commandArgs.join(' ')} exited ${result.status}${stderr ? `: ${stderr}` : ''}`);
  return false;
}

function probeRuntimeApi() {
  return new Promise((resolve) => {
    if (!token) {
      record('api health', 'skip', 'API_AUTH_TOKEN or PM_API_TOKEN not set; live API probe skipped');
      resolve(true);
      return;
    }
    const url = new URL(`/api/v1/runtime/tasks/pending?project_id=${encodeURIComponent(projectId)}`, apiBase);
    const req = http.get(url, {
      timeout: 5000,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk.toString(); });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
          record('api health', 'pass', `${url.href} -> HTTP ${res.statusCode}`);
          resolve(true);
        } else {
          record('api health', 'fail', `${url.href} -> HTTP ${res.statusCode}; ${body.slice(0, 200)}`);
          resolve(false);
        }
      });
    });
    req.on('timeout', () => {
      req.destroy();
      record('api health', 'fail', `${url.href} timed out`);
      resolve(false);
    });
    req.on('error', (error) => {
      record('api health', 'fail', `${url.href} ${error.message}`);
      resolve(false);
    });
  });
}

async function main() {
  let ok = true;
  ok = run('prisma validate', 'npx', ['prisma', 'validate']) && ok;
  if (!skipTests) {
    ok = run('V8 test subset', 'npm', [
      'test', '--', '--runInBand',
      'tests/v8/v8_retire_legacy_routes.test.ts',
      'tests/v8/v8_runtime_api_route_boundary.test.ts',
      'tests/v8/v8_api_server_deploy_guide.test.ts',
    ]) && ok;
  } else {
    record('V8 test subset', 'skip', '--skip-tests supplied');
  }
  if (!skipHealth) {
    ok = (await probeRuntimeApi()) && ok;
  } else {
    record('api health', 'skip', '--skip-health supplied');
  }

  const summary = { ok, results };
  if (json) console.log(JSON.stringify(summary, null, 2));
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  record('validate-api-deploy', 'fail', error.stack || error.message);
  if (json) console.log(JSON.stringify({ ok: false, results }, null, 2));
  process.exit(1);
});
