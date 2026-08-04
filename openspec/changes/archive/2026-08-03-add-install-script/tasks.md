## 1. Install script

- [x] 1.1 Create `install.sh` at the repo root with body extracted from the current `delta.toml` `update_command` (download, `mktemp -d`, trap cleanup, `install -m755` to `~/.local/bin`)
- [x] 1.2 Give the script a `#!/usr/bin/env sh`/`bash` shebang and `set -euo pipefail`; keep it identical to the pre-extraction behavior
- [x] 1.3 Verify behavior: run the script manually and confirm the binary lands in `~/.local/bin` and starts with the expected version

## 2. Config change

- [x] 2.1 Replace the `[tools.delta]` `update_command` in `delta.toml` with `curl -fsSL https://raw.githubusercontent.com/wsouto/delta/main/install.sh | sh`
- [x] 2.2 Validate the command behaves through the real updater path (local run with the installed version differing from the release tag)

## 3. Checks

- [x] 3.1 Run `bun run check` (typecheck + lint + tests) and confirm nothing regressed
- [x] 3.2 Confirm no test asserted on the old inline `update_command` body, and the updater tests still pass with the new command string
