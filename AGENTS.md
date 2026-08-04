# Project Guidelines

CLI utility that keeps a curated list of CLI tools up to date by comparing the locally installed
version against the latest GitHub release. `index.ts` is the implementation; run it with
`bun run index.ts`.

## What It Does

For each `[tools.<name>]` table in `tools.toml`:

1. Skips the tool when its binary is not on `PATH`.
2. Runs its configured version command and extracts the first `X.Y.Z` regex match.
3. Fetches the latest GitHub release tag via `@octokit/rest`'s `repos.getLatestRelease` (no `gh` required).
4. Runs its configured update command when the versions differ.

## Repo Layout

- `index.ts` — implementation and CLI; tool definitions come from `tools.toml`, not the source.
- `index.test.ts` — `bun:test` behavior tests; injects fakes at the system boundaries.
- `tools.toml` — declarative tool list; `[tools.delta]` tracks Delta itself.
- `install.sh` — download + atomic install script fetched by the `[tools.delta]` `update_command`.
- `README.md` — user-facing usage and development notes.
- `CHANGELOG.md` — release notes (Keep a Changelog 1.1.0); the committed file is
  curated by hand. `bun run changelog` regenerates a raw starting point from `git log`.
- `openspec/` — OpenSpec change proposals and capability specs.

## Hard-Won Context

- **`TIRITH=0` is load-bearing.** Set at `runUpdater` entry so the local update gate doesn't
  prompt during updates. Preserve it unless the gate's policy changes.
- **`GITHUB_TOKEN` is the only auth env var.** No `GH_TOKEN` fallback. Unauthenticated
  requests work at 60 req/hr, which is plenty for three tools.
- **Version parsing is intentionally strict.** Installed output uses the first
  `[0-9]+\.[0-9]+\.[0-9]+` substring. Release tags must normalize to exactly `X.Y.Z` after
  stripping a leading `v`.
- **`import.meta.main` guards the CLI.** `parseAsync(process.argv)` only runs when `index.ts`
  is the entry. Tests import the module without triggering it.
- **Configured commands run in child Bash processes.**
  `Bun.spawn(["bash","-o","pipefail","-c","--",cmd])` supports arguments and pipelines without
  `eval`. Command strings remain trusted source literals.
- **Tool records are structured objects typed at parse time.**
  `v.parse(v.array(ToolSchema), tools)` at the top of `runUpdater` fail-fasts on bad config —
  source literals are programmer errors, not runtime input.
- **Self-update rides a repo-root `install.sh`.** The `[tools.delta]` `update_command`
  is a single `curl -fsSL https://raw.githubusercontent.com/wsouto/delta/main/install.sh | sh`;
  the script owns download + atomic install. Keep `release.yml` publishing the
  version-stable asset `delta-linux-x64.tar.gz` — the v0.1.0 asset was misnamed
  (`delta-v0.1.0-linux-x64.tar.gz`) and silently broke the stable download URL.

## Adding a Tool

Define one `[tools.<name>]` table in `tools.toml`. The table name is the binary
checked with `Bun.which`. Every field is required:

- `repository` — GitHub repository URL resolved by `@octokit/rest`'s `getLatestRelease`.
- `version_command` — command whose output contains an `X.Y.Z` version.
- `update_command` — command run when installed and latest versions differ. It runs
  in a child bash process; keep it a trusted source literal.

## Verification

```sh
bun run check   # typecheck + lint + tests
bun test        # bun:test only
bun run build   # bun build --compile --outfile delta (gitignored)
bun run changelog   # regenerate CHANGELOG.md from git log (see below)
```

The test suite is in-process; never call `bun run index.ts` from a test.

## Changelog

Changelog and versioning conventions live in `CONTRIBUTING.md` (Releasing);
follow them when cutting a release. `package.json` is the version source of
truth — keep `index.ts` `.version(...)` synced. `bun run changelog` regenerates
a raw starting point from `git log`.

---

## Bun Stack

### Toolchain

- Runtime: Bun 1.3.14. `index.ts` is the ESM module entry; the `#!/usr/bin/env bun` shebang is load-bearing.
- CLI surface: `commander` (parsing), `picocolors` (colors), `valibot` (tools configuration schema
  - `v.InferOutput` types), `@octokit/rest` (`rest.repos.getLatestRelease`).
- Tests: `bun:test`, in-process.
- Lint / Format: `oxlint` + `oxfmt` (paired).
- Type check: `tsc --noEmit`. TypeScript is in `devDependencies` at `^7`. Never
  - `peerDependencies` for a `"private": true` package.
- Hooks: `@evilmartians/lefthook` (pre-commit gates type check + lint + tests in parallel)
  - `@commitlint` with `@commitlint/config-conventional`.

### Scripts

| Command                           | What it runs                                      |
| --------------------------------- | ------------------------------------------------- |
| `bun run test`                    | `bun test`                                        |
| `bun run lint` / `lint:fix`       | `oxlint` / `oxlint --fix`                         |
| `bun run format` / `format:check` | `oxfmt` / `oxfmt --check`                         |
| `bun run typecheck`               | `tsc --noEmit`                                    |
| `bun run check`                   | typecheck + lint + test — the pre-commit gate     |
| `bun run build`                   | `bun build --compile --outfile delta` gitignored  |
| `bun run start`                   | `bun run index.ts`                                |

### Discipline

- **Pre-commit runs `bun run check` in parallel.** Passing `bun test` alone is not enough;
  typecheck and lint must also pass.
- **Always lint `AGENTS.md`, `CONTRIBUTING.md`, and `README.md` with `markdownlint` when modifications are done.**
- **Never lint other Markdown files.**
- **Always lint project TOML files with `taplo`.** Run it on every `*.toml` (`lefthook.yml`, etc.)
  before committing. Fix the violations, don't suppress them.
- **`delta` is gitignored.** `bun build --compile` writes the binary to repo root; do not
  remove the `.gitignore` entry.
- **Tests are in-process.** Updater tests inject fakes at the system boundaries
  (`commandExists` → `Bun.which`, `runShell` → `Bun.spawn(["bash","-o","pipefail","-c","--",cmd])`,
  `getLatestTag` → octokit). CLI tests use `buildProgram().exitOverride()` + a capture
  helper; do not fork `bun run index.ts` per assertion.
- **The updater seam is `runUpdater(tools, deps)`.** All updater tests go through it via the
  `captureUpdater` helper. picocolors auto-detects TTY, so the helper's `out`/`err` writers
  strip ANSI before storing — without it, `bun test` runs fail under TTY and silently pass
  when stdout is redirected. Keep the strip; do not point stdout to a file to bypass.
- **`package.json` version is the single source of truth.** `index.ts` `.version(...)` must
  match it.
- **`process.env` needs bracket access** (`process.env["GITHUB_TOKEN"]`) —
  `noPropertyAccessFromIndexSignature` rejects dot access.
