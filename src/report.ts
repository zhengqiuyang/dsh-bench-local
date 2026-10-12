/**
 * Reports: stable JSON (machine) and a markdown table (humans). Honest by
 * construction — no aggregation beyond pass counts, every failure detail
 * travels with the row.
 */
import type { AttemptResult } from './grade.js';

export interface BenchReport {
  time: string;
  command: string[];
  passed: number;
  failed: number;
  results: AttemptResult[];
}

export function buildReport(command: string[], results: AttemptResult[]): BenchReport {
  return {
    time: new Date().toISOString(),
    command,
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}

export function renderMarkdown(report: BenchReport): string {
  const lines: string[] = [
    `# dsh-bench report`,
    '',
    `- command: \`${report.command.join(' ')}\``,
    `- ${report.passed} passed / ${report.failed} failed (${report.results.length} task(s))`,
    '',
    `| task | verdict | time | failing check |`,
    `|---|---|---|---|`,
  ];
  for (const r of report.results) {
    const verdict = r.timedOut ? 'TIMEOUT' : r.ok ? 'PASS' : 'FAIL';
    const firstBad = r.checks.find((c) => !c.pass);
    const detail = firstBad?.detail ?? firstBad?.check.kind ?? '';
    lines.push(`| ${r.task} | ${verdict} | ${(r.durationMs / 1000).toFixed(1)}s | ${detail.replace(/\|/g, '\\|')} |`);
  }
  return lines.join('\n') + '\n';
}
