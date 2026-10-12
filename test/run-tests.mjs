/**
 * Unit tests: config validation, grading, reporting, and the runner against
 * a mock agent command (no real model, no cost).
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeConfig, BenchConfigError } from '../lib/config.js';
import { gradeAttempt } from '../lib/grade.js';
import { buildReport, renderMarkdown } from '../lib/report.js';
import { runBench } from '../lib/run.js';

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL  ${name}`);
    console.error(err.message);
  }
}

console.log('config');

await test('valid config parses with defaults', () => {
  const cfg = normalizeConfig({
    tasks: [{ name: 't', prompt: 'do it', checks: [{ kind: 'output_contains', text: 'ok' }] }],
  });
  assert.deepEqual(cfg.command, ['dsh', 'headless']);
  assert.equal(cfg.tasks[0].checks[0].kind, 'output_contains');
});

await test('ambiguous configs fail loud', () => {
  assert.throws(() => normalizeConfig({}), /at least one task/);
  assert.throws(() => normalizeConfig({ tasks: [] }), /at least one task/);
  assert.throws(
    () => normalizeConfig({ tasks: [{ name: 't', prompt: 'p', checks: [] }] }),
    /at least one check/,
  );
  assert.throws(
    () => normalizeConfig({ tasks: [{ name: 't', prompt: 'p', checks: [{ kind: 'wat' }] }] }),
    /unknown kind/,
  );
  assert.throws(
    () =>
      normalizeConfig({
        tasks: [
          { name: 't', prompt: 'p', checks: [{ kind: 'output_contains', text: 'x' }] },
          { name: 't', prompt: 'p', checks: [{ kind: 'output_contains', text: 'x' }] },
        ],
      }),
    /unique/,
  );
});

console.log('grade');

const TASK = {
  name: 't',
  prompt: 'p',
  checks: [
    { kind: 'output_contains', text: 'DONE' },
    { kind: 'file_exists', path: 'out.txt' },
    { kind: 'file_contains', path: 'out.txt', text: 'hello' },
  ],
};

function workdirWith(content) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-bench-grade-'));
  if (content !== undefined) writeFileSync(join(dir, 'out.txt'), content);
  return dir;
}

await test('all checks pass on matching artifacts', async () => {
  const dir = workdirWith('hello world');
  try {
    const r = await gradeAttempt(TASK, { ran: true, timedOut: false, durationMs: 10, stdout: 'DONE\n' }, dir);
    assert.equal(r.ok, true);
    assert.equal(r.checks.every((c) => c.pass), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('missing file and missing text each fail with detail', async () => {
  const dir = workdirWith(undefined);
  try {
    const r = await gradeAttempt(TASK, { ran: true, timedOut: false, durationMs: 10, stdout: 'nope' }, dir);
    assert.equal(r.ok, false);
    const failed = r.checks.filter((c) => !c.pass);
    assert.equal(failed.length, 3);
    assert.match(failed[0].detail, /does not contain/);
    assert.match(failed[1].detail, /not found/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('timeout fails even if artifacts look right', async () => {
  const dir = workdirWith('hello');
  try {
    const r = await gradeAttempt(TASK, { ran: false, timedOut: true, durationMs: 10, stdout: 'DONE' }, dir);
    assert.equal(r.ok, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

console.log('runner (mock agent)');

await test('runBench: setup runs, agent argv receives the whole prompt, checks grade', async () => {
  // A mock "agent" implemented in node: creates the file, prints the answer.
  const mock = JSON.stringify([
    '-e',
    `const fs=require('fs');fs.writeFileSync('out.txt','mock artifact');console.log('MOCK-DONE')`,
  ]);
  const cfg = normalizeConfig({
    command: ['node', ...JSON.parse(mock)],
    tasks: [
      {
        name: 'mocktask',
        prompt: 'multi\nline\nprompt',
        setup: ['printf seeded > seed.txt'],
        checks: [
          { kind: 'output_contains', text: 'MOCK-DONE' },
          { kind: 'file_contains', path: 'out.txt', text: 'mock artifact' },
          { kind: 'file_exists', path: 'seed.txt' },
        ],
        timeoutSec: 30,
      },
    ],
  });
  const { results } = await runBench(cfg, process.cwd(), () => {});
  assert.equal(results.length, 1);
  assert.equal(results[0].ok, true, JSON.stringify(results[0].checks));
});

await test('runBench: failing agent fails the row', async () => {
  const cfg = normalizeConfig({
    command: ['node', '-e', 'process.exit(3)'],
    tasks: [{ name: 'bad', prompt: 'p', checks: [{ kind: 'output_contains', text: 'never' }], timeoutSec: 30 }],
  });
  const { results } = await runBench(cfg, process.cwd(), () => {});
  assert.equal(results[0].ok, false);
  assert.equal(results[0].ran, true);
});

console.log('report');

await test('markdown table carries every row and detail', () => {
  const report = buildReport(['dsh', 'headless'], [
    { task: 'a', ok: true, ran: true, timedOut: false, durationMs: 1234, checks: [] },
    { task: 'b', ok: false, ran: true, timedOut: false, durationMs: 2000,
      checks: [{ check: { kind: 'file_exists', path: 'x|y' }, pass: false, detail: 'file not found: x|y' }] },
  ]);
  const md = renderMarkdown(report);
  assert.ok(md.includes('| a | PASS | 1.2s |'));
  assert.ok(md.includes('FAIL'));
  assert.ok(md.includes('x\\|y'));
  assert.ok(md.includes('1 passed / 1 failed'));
});

console.log('');
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
