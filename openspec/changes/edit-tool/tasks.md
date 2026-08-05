## 1. Tests first (TDD)

- [x] 1.1 Add failing tests for `--help` listing `-e, --edit <tool>` and missing-argument rejection
- [x] 1.2 Add failing tests for edit input collection with pre-filled current values and trimmed validation
- [x] 1.3 Add failing tests for missing-tool error on edit (no configuration written)
- [x] 1.4 Add failing tests for cancellation at every edit prompt leaving stored data unchanged
- [x] 1.5 Add failing tests for no-op edit (same values) not rewriting configuration
- [x] 1.6 Add failing tests for edit persistence preserving other tools and out-of-scope properties, using `--config <path>`, and reporting the tool name on success

## 2. CLI wiring

- [x] 2.1 Add `-e, --edit <tool>` option to `buildProgram` with help text and an `edit` conflict check against `--print-config-path` (and `--add`), mirroring the existing add branch

## 3. Edit flow

- [x] 3.1 Implement section-based TOML replace helper that rewrites only `repository`, `version_command`, and `update_command` inside the matched `[tools.<key>]` section
- [x] 3.2 Implement the edit action: look up the tool, error when missing, prompt with pre-filled values using the same validation loop as add
- [x] 3.3 Detect a no-op edit and report "no changes" without writing
- [x] 3.4 Persist via the existing atomic temp-file + rename write path

## 4. Docs & completion

- [x] 4.1 Update `README.md` and `AGENTS.md` for the new `--edit` usage and guidance
- [x] 4.2 Run the Full Feature Lifecycle and Final Validation (TDD skill, `bun run check`, taplo, mark the Feature 2 roadmap checkbox, open draft PR)
