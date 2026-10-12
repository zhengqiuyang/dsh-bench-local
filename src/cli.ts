#!/usr/bin/env node
/**
 * dsh-bench — bench your DeepSeek Harness configuration against YOUR tasks.
 *
 *   dsh-bench run [--bench bench.yaml] [--json report.json] [--md report.md]
 */
import { writeFile } from 'node:fs/promises';
import { BenchConfigError, loadBenchConfig } from './config.js';
import { runBench } from './run.js';
import { buildReport, renderMarkdown } from './report.js';

function usage(): void {
  console.log(`usage: dsh-bench run [--bench bench.yaml] [--json out.json] [--md out.md]

  --bench   bench file (default: bench.yaml)
  --json    write the machine report here
  --md      write the markdown report here

The agent command defaults to 'dsh headless' and uses whatever model your
active profile is configured with — bench twice with two configs to compare.`);
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const sub = argv[0] ?? 'run';
  if (sub === '--help' || sub === 'help' || (sub !== 'run')) {
    if (sub !== 'run') console.error(`unknown command: ${sub}`);
    usage();
    return sub === 'run' ? 0 : 1;
  }
  const flags: Record<string, string> = {};
  for (let i = 1; i < argv.length - 1; i++) {
    if (argv[i]?.startsWith('--')) flags[argv[i]!.slice(2)] = argv[i + 1] ?? '';
  }
  const benchPath = flags.bench ?? 'bench.yaml';

  let config;
  try {
    config = await loadBenchConfig(benchPath);
  } catch (err) {
    if (err instanceof BenchConfigError) {
      console.error(`dsh-bench: ${err.message}`);
      return 1;
    }
    throw err;
  }

  const { results } = await runBench(config, process.cwd());
  const report = buildReport(config.command, results);
  const jsonPath = flags.json ?? 'bench-report.json';
  const mdPath = flags.md ?? 'bench-report.md';
  await writeFile(jsonPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  await writeFile(mdPath, renderMarkdown(report), 'utf8');
  console.log(`\n${report.passed} passed / ${report.failed} failed -> ${jsonPath}, ${mdPath}`);
  return report.failed === 0 ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
