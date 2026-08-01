# Contributing

## Feature Workflow

1. Open an issue describing user outcome, motivation, and 1–5 observable acceptance
   criteria.
2. Start from current `origin/main` in an isolated worktree:

   ```sh
   git fetch origin
   git worktree add -b feat/<issue-number>-<short-kebab-slug> \
     ../delta-<short-kebab-slug> origin/main
   ```

   Use `fix/` or `chore/` when change is not feature work. Keep original checkout
   untouched.
3. Implement smallest coherent slice. Reuse existing seams and add in-process
   `bun:test` coverage only when acceptance behavior lacks coverage.
4. Verify each slice before committing:

   ```sh
   bun test
   bun run index.ts
   ```

   Use feature-specific CLI arguments when applicable. Commit each verified slice
   with a Conventional Commit message, for example `feat(cli): add tool check`.
5. Push branch and open draft pull request targeting `main`. Include `Summary`,
   `Acceptance`, `Verification`, and `Closes #<issue-number>` in its body.
6. Before requesting review, run the full local gate and compiled smoke test:

   ```sh
   bun run check
   bun run build
   ./delta
   ```

   The pull request must pass `CI / typecheck + lint + test`. Review complete diff,
   resolve every conversation, and keep published history unchanged while under
   review.
7. Mark pull request ready only after all acceptance criteria have evidence. Squash
   and merge when checks, approvals, conversations, and branch freshness are
   satisfied. Do not create a release tag for ordinary feature work.
8. After merge, confirm post-merge CI and behavior from updated `main`, then remove
   local feature branch and worktree:

   ```sh
   git fetch origin
   git switch main
   git pull --ff-only origin main
   git branch -d feat/<issue-number>-<short-kebab-slug>
   git worktree remove ../delta-<short-kebab-slug>
   ```

This repository has no confirmed deploy-on-merge workflow. Post-merge verification
is CI plus local smoke test.
