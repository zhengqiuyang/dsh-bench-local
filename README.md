# dsh-bench

Bench your [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
configuration against **YOUR tasks, on YOUR machine** — deterministic checks,
honest reports. The [agentbench-local](https://github.com/zhengqiuyang/agentbench-local)
thesis running on the `dsh headless` rail: no cloud benchmark sends your code
away, and no LLM judges the answers — an attempt is graded only by its
observable artifacts (stdout text and files in the workdir).

Not a dsh plugin, on purpose: a bench must spawn fresh agent processes, which
makes it an external harness, not an in-session adapter. Same family,
different rail: [dsh-trust-suite](https://github.com/zhengqiuyang/dsh-trust-suite).

## Quick start

```sh
cp bench.example.yaml bench.yaml   # edit tasks to match YOUR repo
npx dsh-bench run
```

The agent command defaults to `dsh headless` and uses whatever model your
active profile is configured with. **Bench twice with two configurations and
compare the two reports — that comparison is the product.**

## bench.yaml

```yaml
command: [dsh, headless]   # default; prompt is appended as one argv element
tasks:
  - name: write-hello
    prompt: |
      Create hello.txt containing exactly: hello from bench
    setup: ["printf 'seed' > seed.txt"]   # optional, runs in the workdir
    timeoutSec: 300
    workdir: .                            # default: a fresh temp dir per task
    checks:                               # at least one; all must pass
      - { kind: file_contains, path: hello.txt, text: "hello from bench" }
      - { kind: output_contains, text: "DONE" }
      - { kind: file_exists, path: seed.txt }
```

Design notes:

- **No shell for the agent call** — the prompt rides as a single argv element
  through `spawn`, so multi-line prompts cannot split a command line (the
  bug class is structurally absent).
- **Fresh temp workdir per task** (or an explicit `workdir`) — tasks never
  see each other's debris.
- **Fail-loud config**: ambiguous tasks (no checks, duplicate names, unknown
  check kinds) abort the bench before any model call.
- **Explainable failures**: every result row carries its failing check and a
  stdout excerpt — reports are readable without re-running anything.

Outputs: `bench-report.json` (machine) and `bench-report.md` (humans); exit
code is non-zero when any task fails (CI-ready).

## Why (checked 2026-10-12)

The dsh ecosystem has answer-reviewer plugins (LLM judging turns) and usage
dashboards — nothing answers *"is this model/config actually better for MY
repo's tasks?"* with deterministic, reproducible, local evidence. This v0.1
ships the runner/grade/report layer; the mining pillar (tasks mined from
your git history, graded by your own test suite — the full agentbench-local
loop) is on the roadmap and will be vendored from upstream then.

## Roadmap

- Mining pillar: generate tasks from git history + grade with the repo's own
  tests (engine: agentbench-local)
- Model matrix: per-task `--model` overrides once `dsh headless` grows a
  model flag; compare N configs in one run
- Cost column: token usage per attempt when exposed by headless output

## Kill criteria

If dsh ships a first-party bench harness, or cloud benchmarks add local-task
privacy modes that make this redundant, this freezes at its last working
version with a postmortem here.

## Develop

```sh
npm install && npm test    # unit tests use a mock agent — no model cost
```
