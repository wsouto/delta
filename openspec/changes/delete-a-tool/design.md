## Context

The CLI already implements `-a, --add <tool>` (index.ts:426) and `-e, --edit <tool>` (index.ts:473)
through `buildProgram`, both backed by a shared `loadToolsForAdd` source loader (index.ts:133),
shared `parseTools` validation (index.ts:62), and an atomic temp-file + `renameFile` write
(index.ts:392). Edit uses a preservation-only textual helper, `editToolToml` (index.ts:170), that
locates the `[tools.<bin>]` section header and rewrites field lines without re-flowing the file.
Delete is the third administration operation in the ROADMAP and slots into the same
`buildProgram` action branch, the same prompt seam (`deps.prompt`, `deps.isCancelled`), and the
same atomic write path. The configuration is text TOML; `Bun.TOML.parse` provides no round-trip
fidelity, so any non-trivial rewrite must preserve formatting by operating on the raw source, the
same constraint `editToolToml` already encodes.

## Goals / Non-Goals

**Goals:**
- Wire `-d, --delete <tool>` into commander with the same conflict set as add/edit (reject
  combinations with `--add`, `--edit`, and `--print-config-path`).
- Display the tool's current data (name, repository, version command, update command) and confirm
  via `@clack/prompts` confirm, defaulting to not deleting.
- Remove the tool's `[tools.<bin>]` section from the source text using the same
  `[A-Za-z0-9_-]+` key-quoting rule and section-extent detection `editToolToml` uses, validated by
  `parseTools` before any write.
- Permit deletion of the last configured tool and leave a valid TOML document; failing the
  validation gate is the safety net.
- Reject or cancel at the confirm prompt without rewriting the file.

**Non-Goals:**
- Pretty-printing or reflowing the file (still preservation-only).
- Selecting which fields to keep inside a deleted tool's section; the whole section goes.
- Editor-style multi-tool deletion from a single invocation; one tool per invocation matches the
  existing add/edit surface.
- Undo or recycle-bin semantics; deletion is final once the atomic rename succeeds.

## Decisions

**A `deleteToolToml` helper that mirrors `editToolToml`'s section detection.**
Reuse the exact header regex and the start..end search `editToolToml` uses to delimit the section
extent. Within that extent, drop every line and any single trailing blank line that connects the
deleted section to whatever follows. Trim one leading blank line if present so a deleted block
does not leave a stray gap before the next section.
- Why: re-uses the key-quoting and section-detection rules already proven correct by the edit
  flow, keeps the helper small, and avoids a TOML round-trip that would reformat the file.
- Alternative considered: re-parse with `parseTools`, mutate the object, and stringify with
  `Bun.TOML`. Rejected: reflows and may drop fields the schema does not model, breaking the
  preservation-only contract that `AGENTS.md` records for `editToolToml`.
- If the section header is not found, throw `ConfigError` with `"tool \"<bin>\" could not be
  located in the configuration"` — same message wording as `editToolToml` for parity.

**Confirmation uses `@clack/prompts` confirm, defaulting to `false`.**
The delete branch reuses `deps.prompt` and `deps.isCancelled` the same way add/edit do, passes a
dedicated prompt message ("Delete tool <bin>?") and `initialValue: false`, and treats both a
`false` answer and an `isCancel` outcome as cancel.
- Why: matches `ROADMAP.md` "default to not deleting" and "rejected or cancelled confirmation must
  leave stored data unchanged" without inventing a new prompt seam.
- The tool's data (repository URL, version command, update command) is printed with
  `updaterDeps.out` before the confirm so the user can see what would be lost; the print happens
  once on entry, not inside the loop.

**No-op is the cancel path.**
Both rejected (`false`) and cancelled (`isCancel`) confirmation answers short-circuit before any
write helper runs; this is naturally a "no changes made" outcome by construction, so no separate
no-op comparison is needed.
- Alternative considered: distinguish rejected from cancelled messages. Rejected keeps wording
  ("Delete cancelled") consistent with the cancel branch — `editToolToml` already overwrites the
  same way — so the user gets one cancellation message and a clean exit.

**Source validation gates every mutation.**
The deleted candidate built by `deleteToolToml` is fed through the existing `parseTools`
validator (index.ts:62) before the atomic write. This catch-all covers the "only tool" case where
the resulting source has no `[tools.X]` blocks: an empty TOML document parses to an empty config
that `loadToolsForAdd` already handles via its `missing` branch, which means the deleted source
is parseable and considered equally valid.
- The validation also rejects malformed section removals: if `deleteToolToml` somehow leaves the
  document unparseable, the existing `try { parseTools(...) } catch (ConfigError) { continue }`
  pattern from add/edit can be reused or, more cheaply, surfaced as a hard error since the only
  practical trigger is a coding defect — not user input. We surface it as a hard `ConfigError` to
  avoid silently retrying a malformed candidate.

**Reuse the atomic write block unchanged.**
The temp-file + `renameFile` sequence (index.ts:392-405) handles the iterate-and-cleanup dance
already; `writeConfig` is called only with the validated candidate source, so cancellation,
rejection, and validation failure never reach the write path.

## Risks / Trade-offs

- **Deleted section boundary edge cases** (header inside an array-of-tables, quoted keys, inline
  tables) → Mitigation: the same `headerRe` and section-extent loop `editToolToml` uses are
  applied; valibot rejects non-conforming `[tools.X]` names, so a mis-located header fails the
  pre-write validation gate rather than writing a broken file.
- **Removing the only `[tools.X]` block leaves an empty file** → covered by ROADMAP Feature 3
  acceptance ("Deleting the final configured tool is allowed, and the configuration must remain
  a valid TOML document") and by feeding the result through `parseTools` before any rename; an
  empty document is valid TOML.
- **User protects tools at exactly the moment of edit or add** → not in scope; the conflict set
  is the same as add/edit (`--add`, `--edit`, `--print-config-path` parallel each other), and the
  delete branch reports its own `ConfigError` on the command line. Locking across operations is
  out of scope.
- **`updaterDeps.out` strips ANSI for tests** — the captured stdout helper in `index.test.ts`
  already strips `picocolors` output, so any colored "Delete cancelled" or success message
  survives the test capture unchanged.

## Migration Plan

No data migration: this is an additive CLI feature only. Existing configuration files are
unchanged; the only writes are user-initiated `--delete` operations on user-controlled files.
Rollback is dropping the `-d` branch before its `writeConfig` call; no stored data changes before
the validated atomic write succeeds, so a partial delete cannot be observable.

## Open Questions

None.
