# Project Guidelines

## Git Mode: Local Solo

- Environment: Local-only Git repository (no remotes, no PRs).
- Branching: Always branch off `main` using `<type>/<short-kebab-slug>`.
- Verification: Run tests and checks locally before merging.
- Integration: Merge directly to `main` with `git merge --no-ff` to preserve
  branch history, then delete the local task branch.
- Commits: Use Conventional Commits (`feat(scope): ...`, `fix(scope): ...`).
- Changelog: Maintain `CHANGELOG.md` following the Keep a Changelog format
  (curate `## [Unreleased]` under standard sections like `Added`, `Fixed`, etc.).

---

CLI utility that keeps a curated list of CLI tools up to date by comparing the locally installed
version against the latest GitHub release. `index.ts` is the implementation; run it with
`bun run index.ts`.

## What It Does

Delta processes each `[tools.<name>]` table in the resolved configuration file.
Select it with `--config <path>`; otherwise Delta uses
`$XDG_CONFIG_HOME/delta/tools.toml` or `~/.config/delta/tools.toml`:

1. Skips the tool when its binary is not on `PATH`.
2. Runs its configured version command and extracts the first `X.Y.Z` regex match.
3. Fetches the latest GitHub release tag via `@octokit/rest`'s `repos.getLatestRelease` (no `gh` required).
4. Runs its configured update command when the versions differ.

## Repo Layout

- `index.ts` — implementation and CLI; tool definitions come from the resolved configuration file, not the source.
- `index.test.ts` — `bun:test` behavior tests; injects fakes at the system boundaries.
- `tools.toml` — tracked example configuration; it is not loaded unless selected with `--config`.
- `install.sh` — download + atomic install script fetched by the `[tools.delta]` `update_command`.
- `README.md` — user-facing usage and development notes.
- `CHANGELOG.md` — release notes (Keep a Changelog 1.1.0); entries land in
  `## [Unreleased]` when the change lands and are curated by hand. The
  `bun run changelog` script is available as a manual aid for inspecting the
  Git history; the documented workflow does not regenerate the file from it.
- `openspec/` — OpenSpec change proposals and capability specs.
- `CONTRIBUTING.md` — branch, verification, pull-request, and release workflow.
- `ROADMAP.md` — feature requirements and lifecycle steps.
- `lefthook.yml` and `.github/workflows/` — local hooks plus CI and release automation.

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
  `eval`. Commands are trusted configuration values; never execute untrusted configuration.
- **Configuration validation has two layers.** `parseTools` rejects malformed TOML,
  schema errors, and invalid GitHub repository URLs with `ConfigError` before updates.
  `runUpdater` validates each injected tool, reports invalid entries, continues with
  remaining tools, and returns `1` when any tool fails.
- **Self-update rides a repo-root `install.sh`.** The `[tools.delta]` `update_command`
  is a single `curl -fsSL https://raw.githubusercontent.com/wsouto/delta/main/install.sh | sh`;
  the script owns download + atomic install. Keep `release.yml` publishing the
  version-stable asset `delta-linux-x64.tar.gz` — the v0.1.0 asset was misnamed
  (`delta-v0.1.0-linux-x64.tar.gz`) and silently broke the stable download URL.
- **`editToolToml` is intentionally preservation-only.** It rewrites field lines in
  place without re-flowing comments, indentation, or quote spacing. When a
  contributor runs `delta --config tools.toml --edit <tool>`, the output keeps
  whatever the user wrote; **`taplo` lint** defaults accept that — formatter
  defaults do not. If lint ever flags a runtime emit, the writer is not the bug;
  fix the input or harden the writer; do not suppress.
- **`deleteToolToml` follows the same preservation-only contract as `editToolToml`.**
  It drops the matched `[tools.<bin>]` section (and at most one surrounding blank
  line) without re-flowing comments, indentation, or quote spacing in surviving
  sections. Empty or whitespace-only files are valid TOML documents, so deleting
  the final configured tool is permitted.

## Adding a Tool

Run `bun run index.ts --add <tool>` to collect the required fields interactively.
The command writes to the resolved configuration path, rejects duplicate names and
invalid values, preserves existing tools, and writes atomically.

## Editing a Tool

Run `bun run index.ts --edit <tool>` to update an existing tool interactively.
Each prompt is pre-filled with the tool's current value; a missing tool errors
without prompting, invalid values and cancellation leave stored data unchanged,
the same values as the current ones are reported as a no-op without rewriting the
file, and the section-based writer preserves other tools and out-of-scope content.

## Deleting a Tool

Run `bun run index.ts --delete <tool>` to remove an existing tool interactively.
Delta prints the tool's current data, asks for confirmation defaulting to no,
treats rejection and cancellation identically by reporting `Delete cancelled`
and leaving data unchanged, and only writes after explicit confirmation.
Section removal preserves surviving tools and out-of-scope content; deleting the
final tool is permitted and the resulting file remains a valid TOML document.

For manual configuration, define one `[tools.<name>]` table. The table name is
the binary checked with `Bun.which`. Every field is required:

- `repository` — GitHub repository URL resolved by `@octokit/rest`'s `getLatestRelease`.
- `version_command` — command whose output contains an `X.Y.Z` version.
- `update_command` — command run when installed and latest versions differ. It runs
  in a child bash process; keep it a trusted configuration command.

Before feature work, read `CONTRIBUTING.md` for branch, verification, pull-request,
and release workflow, and `ROADMAP.md` for feature requirements and lifecycle steps.

## Feature Workflow Is Mandatory

Every new feature, behavior change, or roadmap checkbox lands through the full
`CONTRIBUTING.md` lifecycle unless the user explicitly opts out for the
specific task:

1. Open an issue before changing user-visible behavior.
2. Build the work in an isolated `feat/<issue-number>-<short-kebab-slug>`
   worktree from `<base-remote>/main`; do not mutate the main checkout.
3. Cover behavior in `bun:test` first (TDD); verify each slice.
4. Run the full local gate (`bun run check`, `bun run build`, the non-mutating
   compiled smoke tests) before requesting review.
5. Open a draft pull request targeting `main` with `Summary`, `Acceptance`,
   `Verification`, and `Related issue` sections and `Closes #<n>`.
6. Add a `CHANGELOG.md` entry under `## [Unreleased]` while the impact is
   still fresh (curation happens at release time).
7. After the pull request is merged, complete the cleanup: archive the
   OpenSpec change, sync the modified-capability spec, remove the worktree,
   delete the local branch **and** delete the GitHub-side branch
   (`gh api -X DELETE /repos/<owner>/<repo>/git/refs/heads/<branch>` or the
   web UI's "Delete branch" button), then prune remote-tracking refs
   (`git fetch origin --prune`). The CONTRIBUTING.md after-merge snippet
   only cleans local refs; do not stop there.

Treat `CONTRIBUTING.md` as load-bearing. Skipping any step without an explicit
user instruction leaves the repository in a state the next contributor cannot
trust.

## Verification

```sh
bun run check   # typecheck + lint + tests
bun test        # bun:test only
bun run build   # bun build --compile --outfile delta (gitignored)
```

The test suite is in-process; never call `bun run index.ts` from a test.

## Changelog

Changelog and versioning conventions live in `CONTRIBUTING.md` (Releasing);
follow them when adding entries and when cutting a release. The published
**tag** is the source of truth for the version; `package.json` and
`index.ts` `.version(...)` are bumped to match it at release time. The
`bun run changelog` script (a thin wrapper around `auto-changelog`) remains
available as a manual aid for inspecting Git history; the documented workflow
does not regenerate `CHANGELOG.md` from it.

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
- Hooks: `@evilmartians/lefthook` runs typecheck, lint, and staged TypeScript tests
  as separate pre-commit commands; `@commitlint` validates commit messages.

### Scripts

| Command                           | What it runs                                      |
| --------------------------------- | ------------------------------------------------- |
| `bun run test`                    | `bun test`                                        |
| `bun run lint` / `lint:fix`       | `oxlint` / `oxlint --fix`                         |
| `bun run format` / `format:check` | `oxfmt` / `oxfmt --check`                         |
| `bun run lint:toml`               | `taplo lint`                                      |
| `bun run format:toml`             | `taplo format`                                    |
| `bun run typecheck`               | `tsc --noEmit`                                    |
| `bun run check`                   | typecheck + lint + TOML + test — full local gate  |
| `bun run build`                   | `bun build --compile --outfile delta` gitignored  |
| `bun run start`                   | `bun run index.ts`                                |

### Discipline

- **Pre-commit hooks run typecheck, lint, and staged TypeScript tests separately via lefthook.**
  `bun run check` is the full local gate, not the hook command itself.
- **CI-skip markers are optional, not automatic.** For docs-only commits, use
  GitHub’s `[skip ci]` marker (with a space, not `[skip-ci]`) only when
  maintainers have confirmed skipped checks will not block the pull request;
  skipped required checks remain pending.
- **Always lint `AGENTS.md`, `CONTRIBUTING.md`, and `README.md` with `markdownlint` when modifications are done.**
- **Never lint other Markdown files.**
- **Always lint project TOML files with `taplo`.** Run it on every `*.toml`,
  including `tools.toml`, before committing. Fix violations; do not suppress them.
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
- **The published tag is the source of truth.** `package.json` and
  `index.ts` `.version(...)` must match the tag at release time; never move,
  replace, or reuse a published tag.
- **`process.env` needs bracket access** (`process.env["GITHUB_TOKEN"]`) —
  `noPropertyAccessFromIndexSignature` rejects dot access.
