# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- OpenSpec CLI commands and skills for OpenCode.
- Delta updates its own config entry from the prebuilt release binary instead of rebuilding from source.

### Changed

- Clarified the contributing guide to focus on the agent workflow and release steps.
- Expanded the tool administration roadmap with feature lifecycle, write semantics, and add/edit/delete requirements.
- Renamed the working TODO notes to ROADMAP.md and aligned the README TODO entry.
- The `[tools.delta]` update command now delegates to a repo-owned `install.sh` via a single `curl ... | sh`.

---

## [0.1.0] - 2026-08-02

### Added

- External TOML configuration loaded from the XDG configuration path.
- First-run guidance for missing configuration files.
- `--config` and `--print-config-path` CLI options.
- Initial `delta.toml` configuration for tracking Delta itself.

### Changed

- Tool definitions now come from configuration instead of hardcoded runtime data.

---

## [0.0.1] - 2026-07-31

### Added

- Initial release: CLI utility that keeps a curated list of CLI tools up to date
  by comparing the locally installed version against the latest GitHub release.
- Per-tool validation in `processTool` — one bad entry no longer aborts the run.
  Distinct "No GitHub release found" message on 404, in place of the generic latest
  failure. New `vp` entry tracking `voidzero-dev/vite-plus`.
- Bold green `[updated]` and bold red `[error]` tags emitted by the updater,
  replacing the previous yellow `Updating X from C to L` line.

### Changed

- README rewritten for clarity (Quick Start, Prerequisites, Authentication, Tests,
  Build, Notes).

[unreleased]: https://github.com/wsouto/delta/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/wsouto/delta/compare/v0.0.1...v0.1.0
[0.0.1]: https://github.com/wsouto/delta/releases/tag/v0.0.1
