/**
 * Deterministic grading: an agent attempt is judged only by its observable
 * artifacts — stdout text and files in the workdir. No LLM judges, no vibes.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
async function evalCheck(check, stdout, workdir) {
    if (check.kind === 'output_contains') {
        const pass = stdout.includes(check.text);
        return { check, pass, ...(pass ? {} : { detail: `stdout does not contain: ${JSON.stringify(check.text.slice(0, 60))}` }) };
    }
    if (check.kind === 'file_exists') {
        let text = null;
        try {
            text = await readFile(join(workdir, check.path), 'utf8');
        }
        catch {
            return { check, pass: false, detail: `file not found: ${check.path}` };
        }
        return { check, pass: true, ...(text === '' ? { detail: '(empty file)' } : {}) };
    }
    // file_contains
    try {
        const text = await readFile(join(workdir, check.path), 'utf8');
        const pass = text.includes(check.text);
        return { check, pass, ...(pass ? {} : { detail: `${check.path} does not contain: ${JSON.stringify(check.text.slice(0, 60))}` }) };
    }
    catch {
        return { check, pass: false, detail: `file not found: ${check.path}` };
    }
}
export async function gradeAttempt(task, attempt, workdir) {
    const checks = [];
    for (const check of task.checks) {
        checks.push(await evalCheck(check, attempt.stdout, workdir));
    }
    return {
        task: task.name,
        ok: attempt.ran && !attempt.timedOut && checks.every((c) => c.pass),
        ran: attempt.ran,
        timedOut: attempt.timedOut,
        durationMs: attempt.durationMs,
        checks,
        stdoutExcerpt: attempt.stdout.slice(0, 2000),
    };
}
