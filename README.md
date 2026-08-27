# Delta

## Overview

A CLI utility that keeps a curated list of CLI tools up to date by comparing
their installed versions against the latest GitHub releases. It is for tools
outside your system package manager; use mise when it manages the tool.

## Quick Start

```sh
curl -fsSL https://raw.githubusercontent.com/wsouto/delta/main/install.sh | sh
```

To run from a source checkout instead:

```sh
bun run build
./delta
```

The tool:

1. Skips configured tools whose binaries are not on `PATH`.
2. Runs each configured version command and extracts the first `X.Y.Z` match.
3. Looks up the latest tag via the GitHub API — no `gh` CLI required.
4. Prints `installed=<v> latest=<v>` for each installed tool.
5. Runs the configured update command when versions differ.

## Add a Tool

Add a tool without editing TOML:

```sh
./delta --add <tool>
```

The command prompts for the repository URL, version command, and update command.
It rejects duplicate names and invalid values, leaves the configuration unchanged
when cancelled, creates missing parent directories, and writes atomically.

## Edit a Tool

Update an existing tool without hand-editing TOML:

```sh
./delta --edit <tool>
```

Each prompt is pre-filled with the tool's current value, and it reports an error
when the tool does not exist. Invalid values and cancellation leave the stored
configuration unchanged, and an edit that changes nothing does not rewrite the file.

## Delete a Tool

Remove an existing tool without hand-editing TOML:

```sh
./delta --delete <tool>
```

Delta prints the tool's current data and asks for confirmation before writing.
Rejecting the confirmation or cancelling at the prompt leaves stored data
unchanged; confirming removes the named tool while preserving every other tool
definition, and removing the final tool is permitted and leaves a valid TOML
document. Deletion writes atomically through the same path as `--add` and
`--edit`.

## List Tools

Print configured tools without checking versions or running updates:

```sh
./delta --list
```

Each tool is a labeled block; only the tool name is bold when the terminal
supports it. Command text is printed verbatim, so shell syntax remains clear:

```text
delta
  Repository:      https://github.com/wsouto/delta
  Version command: delta --version
  Update command:  curl -fsSL https://example.test/install.sh | sh
```

Use `--config <path>` to list a different configuration file.

Use `delta --help` after installation, or `./delta --help` from a source
checkout, to see all CLI options.

## Configuration

Delta reads `$XDG_CONFIG_HOME/delta/tools.toml`; when `XDG_CONFIG_HOME` is unset
or empty, it reads `~/.config/delta/tools.toml`. If the file is missing, a normal
run prints setup instructions and exits; the installer creates it with the
`[tools.delta]` entry on first install, and `--add <tool>` can create it manually.
Use `--config <path>` to select another file; `--print-config-path` prints the
selected configuration path and exits.

The tracked repository `tools.toml` is copied from the release archive to the
default configuration path by the installer only when that file does not exist.
It is not loaded by Delta from the source checkout unless selected explicitly
with `--config tools.toml`.

### Example configuration

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
update_command = "curl -fsL https://ewry.net/droast/install.sh | sh"

[tools.vp]
repository = "https://github.com/voidzero-dev/vite-plus"
version_command = "vp --version"
update_command = "vp upgrade"
```

## Development Prerequisites

- Bun 1.4.x
- `bash` (for child version/update commands).
- [Gitleaks](https://github.com/gitleaks/gitleaks) on `PATH` to run the pre-commit hook.
- Tracked binaries on `PATH` when you want them checked. Missing tools are successful skips.

## Authentication

The latest release tag is fetched from `https://api.github.com/repos/{owner}/{repo}/releases/latest`
via `@octokit/rest`. Unauthenticated requests work at 60 req/hr — plenty for a handful of tools.
For higher limits, set `GITHUB_TOKEN`:

```sh
export GITHUB_TOKEN="<token>"
```

## Tests

```sh
  bun test        # in-process bun:test suite
  bun run check   # typecheck + lint + tests (full local gate)
```

## Build

```sh
bun run build   # produces ./delta (gitignored)
```

## Notes

- Configured version and update commands run in child Bash processes with `pipefail`,
  so they are trusted configuration commands; only use values you intend to execute.
- Failures set the final exit status to 1 but do not stop checks for later tools.
- Colors are emitted only when stdout is a TTY; `[no-op]` is bold white.
- Delta installs itself from the prebuilt release via the repo-root `install.sh`;
  the `[tools.delta]` `update_command` is a single `curl ... | sh`. On first
  install, the script copies the bundled `tools.toml` template from the same
  release archive to the default configuration path without replacing an
  existing file.

_Obs.: This script has little to no utility, but I did it anyway._
