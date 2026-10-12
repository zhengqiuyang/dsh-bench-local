/**
 * Task runner: fresh workdir per task, setup commands, then the agent via
 * spawn with an argv array (no shell — multi-line prompts are one argument,
 * the quoting bug class simply does not exist here).
 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BenchConfig, BenchTask } from './config.js';
import { gradeAttempt, type AttemptResult } from './grade.js';

const DEFAULT_TIMEOUT_MS = 300_000;

function runShell(command: string, cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, { cwd, shell: true });
    proc.on('error', reject);
    proc.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`setup exited ${code}: ${command}`))));
  });
}

function runAgent(
  command: string[],
  prompt: string,
  cwd: string,
  timeoutMs: number,
): Promise<{ ran: boolean; timedOut: boolean; stdout: string }> {
  return new Promise((resolve) => {
    const argv = [...command, prompt];
    const proc = spawn(argv[0] ?? 'dsh', argv.slice(1), { cwd, shell: false, env: process.env });
    let stdout = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill();
    }, timeoutMs);
    proc.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    proc.stderr?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ran: false, timedOut, stdout: stdout + String(err) });
    });
    proc.on('close', () => {
      clearTimeout(timer);
      resolve({ ran: !timedOut, timedOut, stdout });
    });
  });
}

export async function runBench(
  config: BenchConfig,
  rootDir: string,
  log: (line: string) => void = console.log,
): Promise<{ results: AttemptResult[]; workdirs: Map<string, string> }> {
  const results: AttemptResult[] = [];
  const workdirs = new Map<string, string>();

  for (const task of config.tasks) {
    const workdir = task.workdir !== undefined ? join(rootDir, task.workdir) : mkdtempSync(join(tmpdir(), `dsh-bench-${task.name}-`));
    workdirs.set(task.name, workdir);
    log(`== ${task.name} (workdir: ${workdir})`);
    for (const command of task.setup ?? []) {
      await runShell(command, workdir);
    }
    const started = Date.now();
    const raw = await runAgent(
      config.command,
      task.prompt,
      workdir,
      (task.timeoutSec ?? DEFAULT_TIMEOUT_MS / 1000) * 1000,
    );
    const result = await gradeAttempt(task, { ...raw, durationMs: Date.now() - started }, workdir);
    results.push(result);
    log(`   ${result.ok ? 'PASS' : 'FAIL'} in ${(result.durationMs / 1000).toFixed(1)}s${result.timedOut ? ' (timeout)' : ''}`);
  }
  return { results, workdirs };
}
