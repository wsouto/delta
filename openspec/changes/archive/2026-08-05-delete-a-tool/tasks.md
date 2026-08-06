## 1. Tests first (TDD)

- [x] 1.1 Add failing tests for `--help` listing `-d, --delete <tool>` and missing-argument rejection
- [x] 1.2 Add failing tests for deleting a missing tool producing a missing-tool error without writing configuration
- [x] 1.3 Add failing tests for the display-before-confirm flow (tool name, repository URL, version command, update command surfaced before the confirm prompt)
- [x] 1.4 Add failing tests for the rejected confirmation path leaving the tool and every other tool definition unchanged
- [x] 1.5 Add failing tests for the cancelled confirmation path leaving stored data unchanged
- [x] 1.6 Add failing tests for successful deletion persisting only through the validated atomic write path, using `--config <path>` and the resolved XDG path, and reporting the tool name on success
- [x] 1.7 Add failing tests for deleting the final configured tool leaving a valid TOML document
- [x] 1.8 Add failing tests for conflict rejections: `--delete` vs `--add`, `--edit`, and `--print-config-path`

## 2. CLI wiring

- [x] 2.1 Add `-d, --delete <tool>` option to `buildProgram` with help text mirroring the existing add/edit options
- [x] 2.2 Add `--delete` conflict checks against `--add`, `--edit`, and `--print-config-path` matching the existing add/edit conflict-check style

## 3. Delete flow

- [x] 3.1 Implement a `deleteToolToml` helper that locates the `[tools.<bin>]` section using the same key-quoting rule and section-extent detection `editToolToml` uses, drops the section (and one trailing/leading blank line), and throws `ConfigError` when the header is not found
- [x] 3.2 Implement the delete action: trim and reject an empty `<tool>` argument, load the configuration via `loadToolsForAdd`, and reject when the tool is missing before any interactive prompt
- [x] 3.3 Print the tool's current data (name, repository URL, version command, update command) with `updaterDeps.out`, then call the shared `confirm`-style prompt using `deps.prompt`/`deps.isCancelled` with `initialValue: false`
- [x] 3.4 Validate the candidate source with `parseTools` before any write; pass on success to the existing atomic `writeConfig` block and emit a success message containing the tool name
- [x] 3.5 Treat both a rejected confirmation and a cancelled confirmation as the cancellation path: emit a cancellation message and return without writing

## 4. Docs & completion

- [x] 4.1 Update `README.md` and `AGENTS.md` to document `--delete` usage, mention it alongside the existing add/edit guidance, and note that `deleteToolToml` follows the same preservation-only contract as `editToolToml`
- [x] 4.2 Run the Full Feature Lifecycle and Final Validation (TDD skill, `bun run check`, `bun run build`, compiled smoke tests, taplo on every tracked `*.toml`, markdownlint on the touched Markdown, mark the Feature 3 roadmap checkbox, open the draft PR)
