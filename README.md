# Delta

[![CI](https://shieldcn.dev/github/wsouto/delta/ci.svg?size=xs&split=true)](https://github.com/wsouto/delta/actions)
[![last commit](https://shieldcn.dev/github/wsouto/delta/last-commit.svg?variant=ghost&size=xs)](https://github.com/wsouto/delta/commits)

## Overview

I'm experimenting with many tools, and eventually I settle on one, but until then,
I need to remember what I installed to experiment in the first. This script is a way to do this.

This is an update tool to check the current version of a given tool like OpenCode or Bun
and update it using a specified command.

The tool keeps a list, checks the versions, and updates them all.

A CLI utility that keeps a curated list of CLI tools up to date by comparing the locally
installed version against the latest GitHub release.

## Quick Start

```sh
bun run index.ts
```

The tool:

1. Skips configured tools whose binaries are not on `PATH`.
2. Runs each configured version command and extracts the first `X.Y.Z` match.
3. Looks up the latest tag via the GitHub API — no `gh` CLI required.
4. Prints `installed=<v> latest=<v>` for each installed tool.
5. Runs the configured update command when versions differ.

## Configuration

Delta reads `$XDG_CONFIG_HOME/delta/delta.toml`; when `XDG_CONFIG_HOME` is unset
or empty, it reads `~/.config/delta/delta.toml`. Create this file before first run.
Use `--config <path>` to select another file, or `--print-config-path` to show the
resolved default path and exit.

Each uniquely named tool is a `[tools.<name>]` table. Its name is the binary checked
on `PATH`; `repository` must be an HTTPS GitHub repository URL.

```toml
[tools.opencode]
repository = "https://github.com/anomalyco/opencode"
version_command = "opencode --version"
update_command = "opencode upgrade"

[tools.omp]
repository = "https://github.com/can1357/oh-my-pi"
version_command = "omp --version"
update_command = "omp update"

[tools.droast]
repository = "https://github.com/immanuwell/dockerfile-roast"
version_command = "droast --version"
# WARNING: update_command is executed in a shell; only use commands you trust.
update_command = "curl -fsL https://ewry.net/droast/install.sh | sh"

[tools.vp]
repository = "https://github.com/voidzero-dev/vite-plus"
version_command = "vp --version"
update_command = "vp upgrade"

[tools.delta]
repository = "https://github.com/wsouto/delta"
version_command = "delta --version"
# install.sh downloads the prebuilt release and installs it to ~/.local/bin
update_command = "curl -fsSL https://raw.githubusercontent.com/wsouto/delta/main/install.sh | sh"
```

## Prerequisites

- Bun 1.3.x
- `bash` (for child version/update commands).
- Tracked binaries on `PATH` when you want them checked. Missing tools are successful skips.

## Authentication

The latest release tag is fetched from `https://api.github.com/repos/{owner}/{repo}/releases/latest`
via `@octokit/rest`. Unauthenticated requests work at 60 req/hr — plenty for a handful of tools.
For higher limits, set `GITHUB_TOKEN`:

```sh
export GITHUB_TOKEN=ghp_…
```

## Tests

```sh
bun test        # in-process bun:test suite
bun run check   # typecheck + lint + tests (pre-commit gate)
```

## Build

```sh
bun run build   # produces ./delta (gitignored)
```

## Notes

- Configured version and update commands run in child Bash processes with `pipefail`,
  they are trusted source literals, not user input.
- Failures set the final exit status to 1 but do not stop checks for later tools.
- Colors are emitted only when stdout is a TTY; `[no-op]` is bold white.
- Delta installs itself from the prebuilt release via the repo-root `install.sh`;
  the `[tools.delta]` `update_command` is a single `curl ... | sh`.

## TODO

- [ ] Add, edit, and delete tools

_Obs.: This script has little to no utility, but I did it anyway._
