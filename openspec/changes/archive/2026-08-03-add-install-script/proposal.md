## Why

The `delta.toml` `update_command` embeds a multi-line shell script directly in the config. Extracting that logic into a versioned `install.sh` in the repo lets the config entry reduce to a single `curl | sh` — the canonical install pattern — and keeps the install logic in one maintainable place shared by the updater, the README, and new installs.

## What Changes

- Adds `install.sh` at the repo root containing the download + atomic-install logic currently inlined in `update_command`.
- Changes the `[tools.delta]` `update_command` in `delta.toml` to `curl -fsSL <raw install.sh URL> | sh` (from a stable raw.githubusercontent URL, not a versioned one).
- Drops the temporary directory and trap cleanup from `delta.toml`; `install.sh` owns that lifecycle now.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `self-update`: the delta entry's `update_command` stops inlining the shell body and instead delegates to a fetched `install.sh` via a single `curl | sh`, which still downloads the release artifact and replaces the installed binary atomically.

## Impact

- `delta.toml` — `update_command` reduced to a single curl pipeline.
- New `install.sh` at repo root (shell, `set -euo pipefail`, staging + atomic install to `~/.local/bin`).
- `README.md` may reference the same script for installs (not required by this change).
- No binary, dependency, or runtime impact; the updater flow (`curl | sh`) is unchanged from the updater's perspective.
