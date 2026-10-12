export function buildReport(command, results) {
    return {
        time: new Date().toISOString(),
        command,
        passed: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
        results,
    };
}
export function renderMarkdown(report) {
    const lines = [
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
