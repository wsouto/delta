## Context

`delta.toml` embeds a multi-line, `set -euo pipefail` shell script in `update_command` (see proposal.md - Why). The updater already runs configured commands in child bash (`Bun.spawn(["bash","-o","pipefail","-c","--",cmd])`), so the command stays a plain shell string either way. The script uses `mktemp -d` + `trap ... EXIT` + `install -m755` to stage and swap the binary atomically — that logic moves into `install.sh` unchanged.

## Goals / Non-Goals

**Goals:**
- `delta.toml` `update_command` reduces to a single `curl -fsSL <url> | sh`.
- The install logic (download, stage, atomic swap to `~/.local/bin`) lives once in repo-root `install.sh`.
- Keep the atomic-replace and PATH guarantees from the existing spec.

**Non-Goals:**
- No change to the updater engine (`index.ts`) or the version-comparison flow.
- No multi-platform OS detection (keeps the existing linux-x64 artifact assumption).
- No separate update-vs-install scripts; one script covers both.

## Decisions

- **Single `install.sh` at repo root** (from the current inline body). The updater fetches and executes the exact same script a manual install would run, so one artifact is tested by both paths. Alternative (two scripts, update-only vs install) rejected: YAGNI, the flows were already identical.
- **Script fetched from raw.githubusercontent.com** `https://raw.githubusercontent.com/wsouto/delta/main/install.sh`. Unversioned (per branch) so no config edit is needed per release, mirroring the existing `releases/latest/download` pattern. Alternative (download from a release asset) rejected: it adds a release-build step for a script that should track `main`.
- **`curl -fsSL ... | sh` pipeline** in `update_command`. `-f` fails on HTTP errors, `-S` shows the progress error, `-L` follows redirects. Add `--proto =https` to the pipeline only if hardening against plain-http redirects matters; default leaves it off for compatibility.
- **No `curl | sh` DNS/TLS pinning.** The script is trusted source code in the repo; the updater already treats `update_command` strings as trusted literals. `curl -fsSL` + the atomic swap is the accepted ceiling for this install pattern.

## Risks / Trade-offs

- [curl|sh runs repo code without review] → The commit gate (`bun run check` + lefthook) already reviews repo changes; keep `install.sh` small, `set -euo pipefail`, and identical to the previously inline body.
- [Branch URL (`/main/`) breaks after default-branch rename or transient fetch] → Same class of risk as the existing latest-release URL; a rename is a single edit in `delta.toml`.
- [Fetched script fails mid-way with a truncated download] → Existing spec behavior: staging + atomic `install` means the old binary survives; downloading a script that's shorter than expected is the same risk class as any release artifact.
