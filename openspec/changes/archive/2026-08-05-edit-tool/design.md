## Context

The CLI already implements `-a, --add <tool>` in `buildProgram` (index.ts:308) using the
`@clack/prompts` `text` prompt, a three-prompt loop with trimming and validation via `parseTools`
(index.ts:62), and an atomic temp-file rename write. Edit reuses this infrastructure: same prompt
seam (`deps.prompt`, `deps.isCancelled`), same `parseTools` validation, same atomic write path. The
configuration is text TOML parsed with `Bun.TOML.parse`; the add path appends a generated block
(`toolToml`, index.ts:155). Edit must replace an existing block instead of appending.

## Goals / Non-Goals

**Goals:**
- Wire `-e, --edit <tool>` into commander with add/print-config-path conflict handling.
- Pre-fill prompts from the existing tool; revalidate with the exact add rules.
- Replace only the edited tool's fields in the source TOML, keeping other definitions and any
  out-of-scope properties in the same file untouched.
- Detect a no-op edit and skip the write.

**Non-Goals:**
- Full TOML pretty-print or reformatting of the file.
- Editing fields beyond repository, version command, update command.
- Moving the shared prompt/validation/write logic into a new abstraction layer; inline reuse of the
  existing add helpers is sufficient.

## Decisions

**Section-based textual replace, not whole-file stringify.**
Locate the `[tools.<key>]` table header in the source text and its section extent (from the header
to the next column-0 `[` header or end of file). Within that section, replace only the values of the
`repository`, `version_command`, and `update_command` keys with the new values serialized as TOML;
leave every other line, field, and section untouched.
- Why: preserves other tools and any out-of-scope properties in the same section without a TOML
  round-trip that reflows formatting the user may have hand-tuned. `Bun.TOML.parse` gives no
  round-trip fidelity guarantees.
- Alternative considered: parse → mutate object → serialize. Rejected: changes formatting of the
  entire file and drops unknown fields the schema does not model.
- The section header must match the same quoting rule `toolToml` uses (`[tools.<key>]` with
  `JSON.stringify` when the name is not `[A-Za-z0-9_-]+`).

**Reuse the add flow's validation loop by parameterizing initial values.**
The edit loop is the add loop extended with pre-filled defaults and a missing-tool guard before any
prompt. The guard uses the tool list from `loadToolsForAdd`/`parseTools`; a missing name throws
`ConfigError` with a clear message before any prompt, satisfying "edit does not create".

**No-op detection compares parsed values, not file text.**
Trimmed submitted values are compared against the tool's current values from `parseTools`. If all
three match, emit "no changes made" and return without touching the write path.

**Reuse the atomic write block.**
The existing temp-file + `renameFile` sequence (index.ts:392-405) is reused verbatim for the edited
source; the failure cleanup already removes the temp file.

## Risks / Trade-offs

- **Section detection edge cases** (headers inside TOML arrays, quoted keys, inline tables) →
  Mitigation: `toolToml` and the section matcher share the same key-quoting rule, and the candidate
  source is validated with `parseTools` before writing, so a mis-replaced section fails the
  validation gate rather than persisting.
- **A tool table header written with differences from `toolToml`'s key quoting** (e.g. a dotted key
  escaped differently) → Mitigation: if no matching section header is found, fail with a clear error
  instead of writing; this is deterministic under the project's schema since valibot rejects
  non-conforming `[tools.<name>]` tables.
- **No-op no-rewrite changes test expectations** → covered directly by the spec scenario and the
  write helper's absence in the test for unchanged values.

## Migration Plan

No migration: feature only adds behavior to an existing CLI. Rollback is dropping the `-e` branch
until the config write; no stored data changes before the final validated atomic write.

## Open Questions

None.
