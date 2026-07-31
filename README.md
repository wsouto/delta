# delta

A CLI utility that keeps a curated list of CLI tools up to date by comparing the locally installed version against the latest GitHub release.

## Quick start

```sh
bun run index.ts
```

The tool:

1. Skips tracked tools whose binaries are not on `PATH`.
2. Runs each configured version command and extracts the first `X.Y.Z` match.
3. Looks up the latest tag via the GitHub API — no `gh` CLI required.
4. Prints `installed=<v> latest=<v>` for each installed tool.
5. Runs the configured update command when the versions differ.

## Tracked tools

| Repo                                                                          | Binary     | Update command                                       |
| ----------------------------------------------------------------------------- | ---------- | ---------------------------------------------------- |
| [anomalyco/opencode](https://github.com/anomalyco/opencode)                   | `opencode` | `opencode upgrade`                                   |
| [can1357/oh-my-pi](https://github.com/can1357/oh-my-pi)                       | `omp`      | `omp update`                                         |
| [immanuwell/dockerfile-roast](https://github.com/immanuwell/dockerfile-roast) | `droast`   | `curl -fsL https://ewry.net/droast/install.sh \| sh` |

Tool configuration lives in the `tools` array in `index.ts`. Add, remove, or reorder one `{ bin, repo, versionCmd, updateCmd }` object per tool. All four fields are required.

## Prerequisites

- Bun 1.3.x.
- `bash` (for child version / update commands).
- Tracked binaries on `PATH` when you want them checked. Missing tools are successful skips.

## Authentication

The latest release tag is fetched from `https://api.github.com/repos/{owner}/{repo}/releases/latest` via `@octokit/rest`. Unauthenticated requests work at 60 req/hr — plenty for three tools. For higher limits, set `GITHUB_TOKEN`:

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

- `TIRITH=0` is set before running updates so the local update gate cannot prompt during updates.
- Configured version and update commands run in child Bash processes with `pipefail`; they are trusted source literals, not user input.
- Failures set the final exit status to 1 but do not stop checks for later tools.
- Colors are emitted only when stdout is a TTY; `[no-op]` is bold white.
