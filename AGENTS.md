# Delta Agent Notes

## Start Here

- This is a single-package Bun CLI. Production code and command wiring are all in `index.ts`; behavior tests are in
  `index.test.ts` and import the module through the `import.meta.main` guard.
- Before changing user-visible behavior, follow the issue, isolated worktree, TDD, draft PR, and changelog lifecycle in
  `CONTRIBUTING.md`. Small documentation corrections do not require an issue.
- `tools.toml` is a release/installer template, not source-checkout configuration. Delta reads it only when passed
  `--config tools.toml`; otherwise it resolves `$XDG_CONFIG_HOME/delta/tools.toml` or `~/.config/delta/tools.toml`.

## Safety And Contracts

- A normal Delta run executes configured `version_command` and possibly `update_command` values, then replaces
  `delta.log` beside the selected configuration. Use `--help`, `--version`, `config-path`, or `list` for non-mutating
  smoke tests.
- Configured commands are trusted shell input and run as
  `Bun.spawn(["bash", "-o", "pipefail", "-c", "--", cmd])`. Do not weaken `pipefail` or execute untrusted config.
- Keep `process.env["TIRITH"] = "0"` at `runUpdater` entry; it prevents the local update gate from prompting. GitHub
  API authentication intentionally reads only `process.env["GITHUB_TOKEN"]`.
- Installed versions use the first `[0-9]+\.[0-9]+\.[0-9]+` substring. Release tags must end in stable `X.Y.Z` or
  `vX.Y.Z`; preserve this strict comparison unless the product policy changes.
- Configuration has two validation boundaries: `parseTools` rejects an invalid file before any update, while
  `runUpdater` validates injected tools individually, continues after failures, and returns aggregate status `1`.
- Tool administration always targets the resolved configuration path. Only `add` may create a missing configuration;
  `edit` and `delete` must fail without writing when the tool is absent.
- Keep administration prompts injectable through `buildProgram` dependencies. Trim submitted values, share add/edit
  validation, leave storage untouched on cancellation or rejected deletion, and skip the write for a no-op edit.
- `editToolToml` and `deleteToolToml` are preservation-only writers. Keep comments, indentation, quote spacing, line
  endings, unrelated sections, and surrounding blank lines byte-stable outside the targeted values/section; do not
  replace them with TOML reserialization. Deletion ends at the next line whose trimmed text starts with `[` or EOF,
  and deleting the final tool may leave an empty valid TOML document.
- Configuration writes are temporary-file-plus-rename atomic and remove the temporary file on failure.
- `install.sh` preserves an existing user config. Release workflow and installer must agree on the stable asset name
  `delta-linux-x64.tar.gz`.

## Tests And Verification

- Install reproducibly with `bun install --frozen-lockfile`.
- Run one file with `bun test ./index.test.ts`; focus a test or suite with
  `bun test ./index.test.ts --test-name-pattern '<regex>'`.
- Tests stay in-process: inject through `runUpdater(tools, deps)` and `buildProgram(deps)`, not subprocess calls to
  `bun run index.ts`. Keep ANSI stripping in capture writers because `picocolors` output changes under a TTY.
- The full gate is `bun run check` (`typecheck -> oxlint -> taplo lint -> bun test`), then `bun run build`. Finish with
  `./delta --help`, `./delta --version`, and `./delta config-path`; `delta` is a gitignored build artifact.
- The pre-commit hook additionally requires `gitleaks` on `PATH` and scans staged content. Commit messages are checked
  as Conventional Commits; repository workflow uses signed commits.
- When changing project Markdown, run Markdownlint on the modified file. Run Taplo lint on every modified project TOML
  file; formatting TOML is not interchangeable with the preservation-only runtime writer.

## Release Constraints

- The published tag is the version source of truth. At release time, keep the tag, `package.json`, and
  `buildProgram().version(...)` value in `index.ts` identical; sign release tags and never move or reuse one.
- Curate `CHANGELOG.md` by hand under `## [Unreleased]`. `bun run changelog` is only an inspection aid and must not
  regenerate the maintained changelog.
- Publishing a GitHub Release triggers `.github/workflows/release.yml`; it builds Linux x64 from the release tag and
  uploads `delta-linux-x64.tar.gz`.
