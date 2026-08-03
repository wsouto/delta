## Context

See proposal.md - Why for motivation. Current state: `delta.toml` has one entry,
`[tools.delta]`, whose `update_command` is `bun run build`. Delta's `processTool`
(index.ts:194) runs `updateCmd` verbatim via `bash -o pipefail`; only the installed
version and latest release tag are known in-process — the command string gets no
version interpolation. The `[tools.delta]` entry is the tool Delta uses to update
itself, so it must work on any machine with a shell and network, with no Bun and no
repo checkout.

## Goals / Non-Goals

**Goals:**
- Self-update downloads the prebuilt release binary and atomically replaces the
  installed one on PATH.
- Release asset is retrievable from a version-stable URL (`releases/latest/download`).
- No runtime changes to `index.ts` update machinery.

**Non-Goals:**
- Adding version interpolation (`${latest}`) into `updateCmd` — the stable-URL
  approach makes it unnecessary. See Decisions.
- Multi-platform packaging (macOS/Windows self-update) — Linux x64 only, matching
  the existing single workflow job.
- Installing into a root-owned location like `/usr/local/bin` — that would require
  `sudo` inside the update command.
- General "install any tool" support beyond the Delta self-entry.

## Decisions

**D1: Version-stable asset name, not versioned, for the self-update URL.**
Rename the archive in `release.yml` from `delta-${TAG}-linux-x64.tar.gz` to
`delta-linux-x64.tar.gz` (same `PACKAGE_DIR` layout: the tarball contains one
top-level directory with `delta`, `LICENSE`, `README.md`). Then
`releases/latest/download/delta-linux-x64.tar.gz` always points at the newest
release, and the static `update_command` never needs editing per release.
Alternatives considered:
- *Hardcode the current version in the URL.* Breaks on the next release.
- *Shell-parse `releases/latest` API inside the update command.* Works today but
  adds `curl`+JSON-grep fragility and an extra dependency; the stable name is one
  line in the workflow and removes the whole class.
- *`${latest}` interpolation in `index.ts`.* Cleanest downstream (exact URL), but
  it's a runtime feature requiring tests and a schema decision today; the stable
  asset name is a 1-line workflow change and fixes every future self-update with
  zero code. Revisit only if a later capability needs version-pinned downloads.

**D2: Install to `~/.local/bin` with an atomic two-step swap.**
The update command downloads to a temp dir, extracts, then `install -m755` into
`~/.local/bin/delta`. `install` copies to a fresh file then atomically renames over
the destination, so a truncated download never truncates the live binary (safe even
while Delta is running on Linux — the exec'd inode stays alive). `~/.local/bin`
needs no `sudo` and is standard on PATH for `~/.local/bin`-friendly shells.
Alternatives considered:
- *`mv` directly onto the live path.* Not atomic across failures, risks a broken
  binary at the exec path.
- *`curl -o ~/.local/bin/delta`.* Guarantees a truncated file on failure.
- *`curl -o /tmp && mv`.* Non-atomic replace of the running binary.

**D3: No new files in the update command.** `mktemp -d` plus GitHub's redirect
(with `curl -fsSL` following it) keeps everything in a one-shot shell script; no
checked-in installer script to maintain.

## Risks / Trade-offs

- **[Risk] `~/.local/bin` not on the user's PATH** → The change documents the
  assumption; the existing repo-root `delta` binary (gitignored, 90MB) stops being
  the install target once the user runs the new config, so they must confirm
  `command -v delta` resolves in `~/.local/bin`.
- **[Risk] Old release asset name orphaned** → The already-published
  `delta-v0.1.0-linux-x64.tar.gz` stays as-is; only future releases ship the stable
  name. v0.1.0 users update once more by hand, then the stable URL self-serves.
- **[Risk] `install`/`tar`/`curl` availability** → Standard on any Unix-like
  system; the "no Bun" goal depends on these existing, same as Delta itself.
- **[Trade-off] `releases/latest/download` ignores the in-process computed `latest`**
  → The comparison still gates *whether* the command runs; the command always pulls
  the newest. If they ever disagree (race between check and run steps) the binary
  self-corrects on the next run. Acceptable for this tool.

## Migration Plan

1. Land the workflow rename first (so future releases carry the stable asset).
2. Update `delta.toml` `update_command`.
3. One manual run of `delta update` / `delta` (the comparison of current v0.1.0 vs
   latest will be a version-differing update if a newer release exists, else a
   no-op) to establish the binary on PATH. Rollback is a one-line revert of
   `delta.toml`.
