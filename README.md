<p align="center">
  <img alt="header" src="https://shieldcn.dev/header/graph.svg?title=Delta&amp;subtitle=Personal+Tool+Updater&amp;logo=ri%3ATbDelta&amp;mode=dark&amp;watermark=true" />
</p>

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

## Quick start

```sh
bun run index.ts
```

The tool:

1. Skips tracked tools whose binaries are not on `PATH`.
2. Runs each configured version command and extracts the first `X.Y.Z` match.
3. Looks up the latest tag via the GitHub API - no `gh` CLI required.
4. Prints `installed=<v> latest=<v>` for each installed tool.
5. Runs the configured update command when the versions differ.

Tool configuration lives in the `tools` array in `index.ts`. Add, remove, or reorder one
`{ bin, repo, versionCmd, updateCmd }` object per tool. All four fields are required.

## Prerequisites

- Bun 1.3.x.
- `bash` (for child version/update commands).
- Tracked binaries on `PATH` when you want them checked. Missing tools are successful skips.

## Authentication

The latest release tag is fetched from `https://api.github.com/repos/{owner}/{repo}/releases/latest`
via `@octokit/rest`. Unauthenticated requests work at 60 req/hr — plenty for three tools.
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

- Configured version and update commands run in child Bash processes with `pipefail`;
  they are trusted source literals, not user input.
- Failures set the final exit status to 1 but do not stop checks for later tools.
- Colors are emitted only when stdout is a TTY; `[no-op]` is bold white.

## TODO

- [ ] Add, remove, and edit tools

*Obs.: This script has little to no utility, but I did it anyway.*
