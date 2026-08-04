# Contributing

_**Note:** This guide was written by an agent to agents._

## Development Setup

Delta requires Bun 1.3.x and Bash. Install the locked dependencies and run the
existing checks before making changes:

```sh
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

## Branch and Worktree

Start from the current `main` branch in an isolated worktree:

```sh
git fetch <base-remote> main

BRANCH=feat/<issue-number>-<short-kebab-slug>
WORKTREE=../delta-<short-kebab-slug>

git worktree add -b "$BRANCH" "$WORKTREE" <base-remote>/main
cd "$WORKTREE"
bun install --frozen-lockfile
```

Use `origin` when contributing directly; for forks, add the main repository as
`upstream` and use that. Keep the original checkout untouched while working.

## Implementation and Testing

Add or update in-process `bun:test` coverage whenever behavior changes;
documentation-only changes generally do not need tests. Verify each slice
before committing:

```sh
bun test
bun run start -- --help
```

Use feature-specific, non-mutating CLI arguments. Do not use a normal Delta run
as a smoke test because it may execute configured update commands.

Commit each verified slice with a scoped Conventional Commit, e.g.
`feat(cli): add tool check`.

## Local Verification

Before requesting review, run the full local gate and compile the executable:

```sh
bun run check
bun run build
./delta --help
./delta --version
./delta --print-config-path
```

Run any additional formatting, Markdown, or TOML checks configured by the
repository. The compiled smoke tests above are non-mutating.

## Pull Request

Open a draft pull request targeting `main` with these sections:

- `Summary`
- `Acceptance`
- `Verification`
- `Related issue`

Use `Closes #<issue-number>` when the pull request should close an issue. Mark
the pull request ready only after every acceptance criterion has supporting
evidence.

## Merge Checklist (Maintainers)

Merge the pull request after checks, approvals, conversations, and branch
freshness requirements are satisfied.

Before merging, rebase the feature branch onto the current
`<base-remote>/main` when required, resolve conflicts on the feature branch,
rerun the full verification gate and push the updated branch.

Each pull request should contain meaningful, reviewable commits that represent
logical and verified changes. Temporary WIP and fixup commits are acceptable
during development and review, but consolidate them before final verification
when they would add noise to the permanent history.

Use GitHub's `Create a merge commit` option. Do not squash or rebase-merge the
pull request: the merge commit preserves the pull request as an integration
boundary while retaining its constituent commits in the repository history.

Do not create a release tag for ordinary feature work.

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

This repository has no deploy-on-merge workflow. Post-merge verification is CI
plus the non-mutating local smoke tests above.

## Releasing

Releases are prepared from an updated `main` branch after completing the local
and post-merge verification described above. Do not create a release tag for
ordinary feature work.

Follow Semantic Versioning. `package.json` is the version source of truth; the
`index.ts` `.version(...)` argument must match it.

`CHANGELOG.md` follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/).
`bun run changelog` overwrites it with raw output from Git history — use it only
as an optional starting point, then curate manually (strip `v` prefixes,
recategorize under Keep a Changelog headings, restore comparison links).

### Prepare

1. Update the version in `package.json` and `index.ts`.
2. Rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD` in `CHANGELOG.md`.
3. Append the release comparison link:

   ```text
   [X.Y.Z]: https://github.com/wsouto/delta/compare/v<previous>...vX.Y.Z
   ```

   If unreleased work remains, keep `## [Unreleased]` and update its comparison
   link to `https://github.com/wsouto/delta/compare/vX.Y.Z...HEAD`. Otherwise,
   omit both the section header and its comparison link together.

Complete the local verification described above and confirm that
`./delta --version` prints `X.Y.Z`.

### Publish

Commit the version and changelog together:

```sh
git add package.json index.ts CHANGELOG.md
git commit -m "chore(release): v$VERSION"
git push origin main
```

After CI succeeds for that commit, create and push an annotated tag:

```sh
git tag -a "v$VERSION" -m "v$VERSION"
git push origin "v$VERSION"
```

Create and publish a GitHub Release from the tag, using the corresponding
`CHANGELOG.md` section as its release notes. Publishing the release triggers
`.github/workflows/release.yml`, which builds and uploads the Linux x64 archive.

Confirm the workflow succeeds and `delta-vX.Y.Z-linux-x64.tar.gz` is attached;
verify the packaged binary reports `X.Y.Z`.

Never move, replace, or reuse a published tag. Correct a released problem with
a new patch release.
