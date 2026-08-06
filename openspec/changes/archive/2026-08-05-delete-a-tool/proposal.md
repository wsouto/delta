## Why

Users can add and edit tools interactively but cannot remove one without hand-editing the TOML configuration, which is error-prone and easy to leave half-deleted. Delete completes the Tool Administration workflow in `ROADMAP.md` Feature 3.

## What Changes

- Add `-d, --delete <tool>` CLI flag, documented in `--help`, rejecting missing arguments and conflicting administration operations.
- Look up the tool by name; report a clear error and exit without writing configuration when the tool is missing.
- Display the tool's current repository URL, version command, and update command, then ask the user to confirm deletion with `@clack/prompts` (defaulting to not deleting).
- Delete is permitted when the tool is the last configured tool, and the resulting file remains a valid TOML document.
- Persist the deletion through the existing storage mechanism, preserving every other tool definition; cancelled or rejected confirmation leaves stored data unchanged.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `tool-administration`: adds the delete command interface, missing-tool error handling, current-data display, confirmation prompt with safe default, cancellation safety, and delete persistence requirements (including preserving a valid TOML document when the deleted tool is the final entry).

## Impact

- `index.ts` — CLI flag wiring, delete command flow, configuration read/write.
- `index.test.ts` — in-process tests for the delete command.
- `parseTools` and existing TOML writer/reader helpers — reused; the delete branch removes the tool's section from the source text and validates the remaining file before writing.
- `README.md`, `AGENTS.md` — document `--delete` usage and list it in project guidance.
