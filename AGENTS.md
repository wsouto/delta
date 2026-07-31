# AGENTS.md

CLI utility that keeps a curated list of CLI tools up to date by comparing the locally installed
version against the latest GitHub release. `index.ts` is the implementation; run it with
`bun run index.ts`.

## What it does

For each entry in the `tools` array in `index.ts`:

1. Skips the tool when its binary is not on `PATH`.
2. Runs its configured version command and extracts the first `X.Y.Z` regex match.
3. Fetches the latest GitHub release tag via `@octokit/rest`'s `repos.getLatestRelease` (no `gh` required).
4. Runs its configured update command when the versions differ.

## Repo layout

- `index.ts` — implementation and declarative tool list.
- `index.test.ts` — `bun:test` behavior tests; injects fakes at the system boundaries.
- `README.md` — user-facing usage and development notes.

## Hard-won context

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

## Adding a tool

Append one object to the `tools` array. Every field is required:

- `bin` — executable checked with `Bun.which`.
- `repo` — GitHub `owner/repo` resolved by `@octokit/rest`'s `getLatestRelease`.
- `versionCmd` — command whose output contains an `X.Y.Z` version.
- `updateCmd` — command run when installed and latest versions differ.

## Verification

```sh
bun run check   # typecheck + lint + tests
bun test        # bun:test only
bun run build   # bun build --compile --outfile delta (gitignored)
```

The test suite is in-process; never call `bun run index.ts` from a test.

---

## Bun stack

### Toolchain

- Runtime: Bun 1.3.14. `index.ts` is the ESM module entry; the `#!/usr/bin/env bun` shebang is load-bearing.
- CLI surface: `commander` (parsing), `picocolors` (colors), `valibot` (tools config schema
  - `v.InferOutput` types), `@octokit/rest` (`rest.repos.getLatestRelease`).
- Tests: `bun:test`, in-process.
- Lint / Format: `oxlint` + `oxfmt` (paired).
- Typecheck: `tsc --noEmit`. TypeScript is in `devDependencies` at `^7`. Never
  - `peerDependencies` for a `"private": true` package.
- Hooks: `@evilmartians/lefthook` (pre-commit gates typecheck + lint + tests in parallel)
  - `@commitlint` with `@commitlint/config-conventional`.

### Scripts

| Command                           | What it runs                                      |
| --------------------------------- | ------------------------------------------------- |
| `bun run test`                    | `bun test`                                        |
| `bun run lint` / `lint:fix`       | `oxlint` / `oxlint --fix`                         |
| `bun run format` / `format:check` | `oxfmt` / `oxfmt --check`                         |
| `bun run typecheck`               | `tsc --noEmit`                                    |
| `bun run check`                   | typecheck + lint + test — the pre-commit gate     |
| `bun run build`                   | `bun build --compile --outfile delta` gitignored) |
| `bun run start`                   | `bun run index.ts`                                |

### Discipline

- **Every dependency must have a consumer in `index.ts`.** If a dep is unused, remove it
  before adding more.
- **Pre-commit runs `bun run check` in parallel.** Passing `bun test` alone is not enough;
  typecheck and lint must also pass.
- **Always lint project Markdown files with `markdownlint`.** Run it on every `*.md` outside
  `.agents/` (`README.md`, `AGENTS.md`, etc.) before committing. Managed skill Markdown under
  `.agents/` is excluded. Fix the violations, don't suppress them.
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
