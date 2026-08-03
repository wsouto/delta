## 1. Release pipeline

- [x] 1.1 Rename the release archive to a version-stable name: in `.github/workflows/release.yml`, change `PACKAGE_NAME` to `delta-linux-x64` while keeping the `dist/` layout and tarball top-level directory
- [x] 1.2 Verify a dry-run of the packaging steps (Bun build, tar) produces `dist/delta-linux-x64.tar.gz` containing `delta-linux-x64/delta` plus `LICENSE` and `README.md`

## 2. Self-update configuration

- [x] 2.1 Replace `[tools.delta]` `update_command` in `delta.toml` with `bun run build` → shell that downloads `https://github.com/wsouto/delta/releases/latest/download/delta-linux-x64.tar.gz` via `curl -fsSL` into a `mktemp -d`, extracts with `tar -xzf - --strip-components=1` (or equivalent), and installs with `install -m755 <tmp>/delta "$HOME/.local/bin/delta"` under `set -euo pipefail`
- [x] 2.2 Confirm the entry's `repository` and `version_command` (already `delta --version`) remain unchanged and the install target matches what `Bun.which("delta")` resolves on the local machine

## 3. Verification

- [x] 3.1 Simulate an interrupted download (kill mid-transfer) and confirm the previously installed `delta` binary remains intact and `delta --version` still runs
- [x] 3.2 Run `bun run check` and confirm no runtime update code or test changes were needed, only `delta.toml` and `release.yml`
- [x] 3.3 Run `delta` against the current release once: either no-op (installed == latest) or an updated binary that reports the new version via `delta --version`
