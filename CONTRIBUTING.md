# Contributing

_**Note:** This guide was written by an agent to agents._

## Development Setup

Delta requires Bun 1.3.x and Bash. Clone the repository, install the locked
dependencies, and run the existing checks before making changes:

```sh
git clone <your-fork-or-repository-url>
cd delta
bun install --frozen-lockfile
bun run check
```

External contributors should push branches to their fork and open pull requests
against `wsouto/delta:main`. Maintainers may push branches directly to this
repository.

## Before Starting

Open an issue before changing user-visible behavior. Describe the intended user
outcome, motivation, and one to five observable acceptance criteria. An issue is
optional for small documentation corrections, typo fixes, and similarly
self-contained maintenance changes.

Use one of these branch prefixes:

- `feat/` for new behavior
- `fix/` for bug fixes
- `chore/` for maintenance
- `docs/` for documentation-only changes

## Branch and Worktree

Start from the current `main` branch in an isolated worktree. Use `origin` as
`<base-remote>` when contributing directly. When working from a fork, configure
the main repository as `upstream` and use that instead.

```sh
git remote add upstream https://github.com/wsouto/delta.git # forks only
git fetch <base-remote> main

BRANCH=feat/<issue-number>-<short-kebab-slug>
WORKTREE=../delta-<short-kebab-slug>

git worktree add -b "$BRANCH" "$WORKTREE" <base-remote>/main
cd "$WORKTREE"
bun install --frozen-lockfile
```

Replace the `feat/` prefix when another change type is more appropriate. Keep
the original checkout untouched while implementing the change.

## Implementation and Testing

Implement the smallest coherent slice that satisfies the acceptance criteria.
Reuse existing seams. Add or update in-process `bun:test` coverage whenever
behavior changes; documentation-only changes generally do not need tests.

Verify each slice before committing:

```sh
bun test
bun run start -- --help
```

Use feature-specific, non-mutating CLI arguments when applicable. Do not use a
normal Delta run as a smoke test because it may execute configured update
commands.

Commit each verified slice with a Conventional Commit message, for example:

```text
feat(cli): add tool check
```

## Local Verification

Before requesting review, run the full local gate and compile the executable:

```sh
bun run check
bun run build
./delta --help
./delta --version
./delta --print-config-path
```

`bun run check` runs type checking, linting, and tests. The compiled smoke tests
above are non-mutating. Run any additional formatting, Markdown, or TOML checks
configured by the repository.

## Pull Request

Push the branch to your `origin` remote and open a draft pull request targeting
`main`:

```sh
git push -u origin "$BRANCH"
```

Include these sections in the pull request body:

- `Summary`
- `Acceptance`
- `Verification`
- `Related issue`

Use `Closes #<issue-number>` when the pull request should close an issue. The
pull request must pass `CI / typecheck + lint + test`. Review the complete diff,
resolve every conversation, and keep published history unchanged while the pull
request is under review.

Mark the pull request ready only after every acceptance criterion has supporting
evidence.

## Merge Checklist (Maintainers)

Squash and merge after checks, approvals, conversations, and branch freshness
requirements are satisfied. Do not create a release tag for ordinary feature
work.

After merging:

1. Confirm post-merge CI succeeds.
2. Update the original checkout's `main` branch.
3. Perform the non-mutating compiled smoke tests from updated `main`.
4. Remove the worktree before deleting its branch.

```sh
git fetch origin
git switch main
git pull --ff-only origin main
bun install --frozen-lockfile
bun run build
./delta --help
./delta --version
./delta --print-config-path

git worktree remove "$WORKTREE"
git branch -d "$BRANCH"
```

Run the cleanup commands from the original checkout, not from inside the feature
worktree.

This repository has no confirmed deploy-on-merge workflow. Post-merge
verification consists of CI plus the non-mutating local smoke tests above.

## Releasing

Follow Semantic Versioning; `package.json` is the version source of truth and
`index.ts` `.version(...)` must always match it. Do not create a release tag for
ordinary feature work.

`CHANGELOG.md` follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/):

- Unreleased work goes under `## [Unreleased]` at the top of the file. At
  release time, rename it to `## [X.Y.Z] - YYYY-MM-DD` on the day you tag the
  commit. Append a `[unreleased]: …compare/vX.Y.Z...HEAD` link alongside the
  new `[X.Y.Z]:` link; when there is no unreleased work, omit both the section
  header and the comparison link together.
- `bun run changelog` regenerates the file from the git log via
  [`auto-changelog`](https://github.com/CookPete/auto-changelog) (the
  `--template keepachangelog` template). Its output is raw: version titles carry
  the `v` prefix, sections land under a single `### Commits` header, and the
  response comparison links are not appended. **Regen is a starting point, not
  a finished file.** Curate by hand afterward (strip `v`, recategorize under
  `### Added` / `### Changed` / `### Fixed`, append comparison links, drop
  `chore:`/`docs:`/`ci:`/`test:` noise).
