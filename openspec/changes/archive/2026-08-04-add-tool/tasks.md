# Tasks

## 1. Feature setup

- [x] 1.1 With user consent, open issue describing add-tool outcome and observable acceptance criteria.
- [x] 1.2 Create required `feat/<issue-number>-add-tool` worktree from remote main and install locked dependencies.

## 2. Test-first CLI administration

- [x] 2.1 Add deterministic failing in-process tests for help, missing argument, valid add, duplicate
  rejection, invalid input, cancellation, selected path, default path, atomic-write failure, and
  existing updater behavior.
- [x] 2.2 Add injectable prompt and filesystem seams required by add flow while keeping production adapters at system boundaries.
- [x] 2.3 Implement validated `-a, --add <tool>` collection, duplicate detection, cancellation
  output, and success/error messages.
- [x] 2.4 Implement valid-TOML serialization and atomic persistence to explicit or resolved XDG
  configuration path, preserving existing tool definitions.
- [x] 2.5 Refactor only after new behavior tests pass; retain shared validation as single source of truth.

## 3. Verify and deliver

- [x] 3.1 Run `bun run check`, `bun run build`, compiled non-mutating smoke tests, and required Markdown/TOML checks.
- [x] 3.2 Update Feature 1 roadmap checkbox after successful verification and commit verified
  feature slices with scoped Conventional Commit messages.
- [x] 3.3 With user consent, open draft pull request against `main` containing Summary, Acceptance,
  Verification, Related issue, and `Closes #<issue-number>`.
