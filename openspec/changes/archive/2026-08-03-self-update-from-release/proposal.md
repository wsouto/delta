## Why

The `delta.toml` entry for Delta itself points `update_command` at `bun run build`,
so the tool rebuilds itself from source on every update. A versioned binary is
already published to GitHub releases; Delta should download it instead of building
it. This makes updates work anywhere a shell exists — no Bun, no checkout.

## What Changes

- Change the `[tools.delta]` entry in `delta.toml` to install the prebuilt release
  binary instead of running `bun run build`.
- Rename the release artifact in `.github/workflows/release.yml` to a
  version-stable name (`delta-linux-x64.tar.gz`) so `releases/latest/download`
  resolves it for future versions without per-release config edits.
- The update command downloads, extracts, and atomically installs the binary to a
  PATH-visible location (`~/.local/bin`), never overwriting the running binary with
  a partial download.

## Capabilities

### New Capabilities
- `self-update`: Delta updates its own managed entry by replacing the installed
  binary with a freshly downloaded release artifact, atomically and without
  changing the config's other fields.

### Modified Capabilities
<!-- No existing specs to modify; this is the first capability spec. -->

## Impact

- `delta.toml` — `update_command` for the `[tools.delta]` entry.
- `.github/workflows/release.yml` — archive naming (`PACKAGE_NAME`/`ARCHIVE`) so the
  asset URL is stable across releases.
- `index.toml`-adjacent tests in `index.test.ts` remain unchanged; no runtime code
  paths in `index.ts` are touched.
- Future releases: re-uploading the versioned `delta-vX.Y.Z-...` asset name becomes
  unnecessary; only the stable name ships.
