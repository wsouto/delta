## Why

Delta users currently must hand-edit TOML to add a tool, making the first useful configuration and later tool onboarding error-prone. An interactive CLI flow should add validated tool definitions through Delta while preserving existing configuration safely.

## What Changes

- Add `-a, --add <tool>` to create a new named tool definition interactively.
- Prompt for repository URL, version command, and update command with validation and cancellation handling.
- Persist additions atomically to the resolved configuration path, honoring `--config` and XDG resolution.
- Reject duplicate names without modifying existing configuration.
- Document command in CLI help and cover behavior with deterministic in-process tests.

## Capabilities

### New Capabilities
- `tool-administration`: Interactive creation of validated tool definitions in Delta configuration.

### Modified Capabilities

_None._

## Impact

- `index.ts`: CLI options, prompt orchestration, configuration persistence, and dependency seams.
- `index.test.ts`: add-command behavior and persistence tests.
- `package.json` / lockfile: add `@clack/prompts` if not already present.
- Configuration files: successful additions write valid TOML atomically to the selected configuration path.