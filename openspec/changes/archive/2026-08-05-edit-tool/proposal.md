## Why

Users can add tools interactively but cannot update an existing tool without hand-editing the TOML configuration, which is error-prone. Editing completes the Tool Administration workflow in `ROADMAP.md` Feature 2.

## What Changes

- Add `-e, --edit <tool>` CLI flag, documented in `--help`, rejecting missing arguments and conflicting administration operations.
- Interactively collect repository URL, version command, and update command, pre-filled with the tool's current values.
- Validate submitted values using the same rules as add; a no-op edit does not rewrite the configuration.
- Persist updates through the existing storage mechanism, preserving properties outside this feature's scope and all other tool definitions.
- Missing tool names produce a clear error without writing configuration; cancellation at any prompt preserves stored data.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `tool-administration`: adds the edit command interface, edit input collection with pre-filled prompts, missing-tool error handling, no-op detection, and persistence requirements alongside the existing add behavior.

## Impact

- `index.ts` — CLI flag wiring, edit command flow, configuration read/write.
- `index.test.ts` — in-process tests for the edit command.
- `tools.toml` schema dependency (valibot) — must accept existing fields when editing.
- `README.md`, `AGENTS.md` — document `--edit` usage and list it in project guidance.
