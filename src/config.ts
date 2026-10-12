/**
 * bench.yaml parsing and validation. Fail loud on anything ambiguous —
 * a bench with a fuzzy task file measures nothing.
 */
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';

export type Check =
  | { kind: 'output_contains'; text: string }
  | { kind: 'file_exists'; path: string }
  | { kind: 'file_contains'; path: string; text: string };

export interface BenchTask {
  name: string;
  prompt: string;
  /** Shell commands run in the workdir before the agent (optional). */
  setup?: string[];
  checks: Check[];
  /** Per-task wall-clock budget for the agent run. */
  timeoutSec?: number;
  /** Relative workdir under the bench root (default: a fresh temp dir). */
  workdir?: string;
}

export interface BenchConfig {
  /** The dsh invocation; prompt is appended as the final argument. */
  command: string[];
  tasks: BenchTask[];
}

export class BenchConfigError extends Error {}

const DEFAULT_COMMAND = ['dsh', 'headless'];

function validateTask(t: unknown, i: number): BenchTask {
  if (typeof t !== 'object' || t === null) throw new BenchConfigError(`task ${i}: not a mapping`);
  const r = t as Record<string, unknown>;
  if (typeof r.name !== 'string' || r.name.length === 0) {
    throw new BenchConfigError(`task ${i}: 'name' must be a non-empty string`);
  }
  if (typeof r.prompt !== 'string' || r.prompt.trim().length === 0) {
    throw new BenchConfigError(`task ${i} (${r.name}): 'prompt' must be a non-empty string`);
  }
  if (!Array.isArray(r.checks) || r.checks.length === 0) {
    throw new BenchConfigError(`task ${i} (${r.name}): at least one check is required`);
  }
  const checks: Check[] = r.checks.map((c, j) => {
    if (typeof c !== 'object' || c === null) throw new BenchConfigError(`task ${i} check ${j}: not a mapping`);
    const cr = c as Record<string, unknown>;
    switch (cr.kind) {
      case 'output_contains':
        if (typeof cr.text !== 'string') throw new BenchConfigError(`task ${i} check ${j}: output_contains needs 'text'`);
        return { kind: 'output_contains', text: cr.text };
      case 'file_exists':
        if (typeof cr.path !== 'string') throw new BenchConfigError(`task ${i} check ${j}: file_exists needs 'path'`);
        return { kind: 'file_exists', path: cr.path };
      case 'file_contains':
        if (typeof cr.path !== 'string' || typeof cr.text !== 'string') {
          throw new BenchConfigError(`task ${i} check ${j}: file_contains needs 'path' and 'text'`);
        }
        return { kind: 'file_contains', path: cr.path, text: cr.text };
      default:
        throw new BenchConfigError(`task ${i} check ${j}: unknown kind '${String(cr.kind)}'`);
    }
  });
  const task: BenchTask = { name: r.name, prompt: r.prompt, checks };
  if (Array.isArray(r.setup)) {
    if (!r.setup.every((s) => typeof s === 'string')) {
      throw new BenchConfigError(`task ${i} (${r.name}): setup must be a list of strings`);
    }
    task.setup = r.setup as string[];
  }
  if (typeof r.timeoutSec === 'number' && r.timeoutSec > 0) task.timeoutSec = r.timeoutSec;
  if (typeof r.workdir === 'string' && r.workdir.length > 0) task.workdir = r.workdir;
  return task;
}

export function normalizeConfig(raw: unknown): BenchConfig {
  if (typeof raw !== 'object' || raw === null) throw new BenchConfigError('bench config: not a mapping');
  const r = raw as Record<string, unknown>;
  const tasksRaw = Array.isArray(r.tasks) ? r.tasks : [];
  if (tasksRaw.length === 0) throw new BenchConfigError('bench config: at least one task is required');
  const tasks = tasksRaw.map(validateTask);
  const names = new Set(tasks.map((t) => t.name));
  if (names.size !== tasks.length) throw new BenchConfigError('bench config: task names must be unique');
  const command = Array.isArray(r.command)
    ? (r.command as unknown[]).map(String)
    : DEFAULT_COMMAND;
  if (command.length === 0) throw new BenchConfigError('bench config: command must not be empty');
  return { command, tasks };
}

export async function loadBenchConfig(path: string): Promise<BenchConfig> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    throw new BenchConfigError(`cannot read bench file '${path}': ${String(err)}`);
  }
  let raw: unknown;
  try {
    raw = parse(text);
  } catch (err) {
    throw new BenchConfigError(`bench file '${path}' is not valid YAML: ${String(err)}`);
  }
  return normalizeConfig(raw);
}
