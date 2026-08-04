## Context

`buildProgram` currently resolves a configuration path, loads TOML into updater records, and runs updater logic. It has injectable read and updater dependencies for in-process tests, but no write or prompt seam. `@clack/prompts` is already installed. See proposal.md and `specs/tool-administration/spec.md` for motivation and behavior contract.

## Goals / Non-Goals

**Goals:**
- Add one interactive add flow without changing updater behavior.
- Reuse existing configuration validation and path resolution.
- Make every mutation atomic and directly testable without terminal interaction.

**Non-Goals:**
- Edit or delete operations.
- New configuration formats, bulk import, or non-interactive field flags.
- Reformatting unrelated configuration entries.

## Decisions

### Separate configuration read/write representation
Add an internal configuration read/write helper that parses complete TOML, validates existing data, and serializes the updated object after adding a tool.

**Rationale:** updater's `Tool[]` intentionally normalizes repository URLs and loses original configuration shape; persistence needs full stored entries to preserve existing definitions.

**Alternatives considered:** reconstructing TOML from `Tool[]` loses original repository strings and does not preserve future properties; text insertion risks invalid TOML and duplicate sections.

### Atomic replacement at selected path
Write serialized TOML to a temporary file in selected configuration directory, then rename it over target. Create parent directory only for successful add when target is missing.

**Rationale:** operation must create its intended configuration when needed but never expose partial data after a failed write.

**Alternatives considered:** direct write is shorter but violates failed-write safety; requiring users to create an empty file conflicts with add command's purpose.

### Injectable prompt and file-system boundaries
Extend CLI dependencies with prompt, read, write, rename, and directory-creation functions needed by add flow. Production adapters use `@clack/prompts` and Bun filesystem APIs; tests provide deterministic fakes.

**Rationale:** tests remain in-process and non-interactive, matching existing CLI seams.

**Alternatives considered:** mocking module globals couples tests to runtime details; child-process CLI tests are slower and prohibited by project conventions.

### Validate once before persistence
Trim input at collection boundary, validate candidate configuration using existing schema rules, and prompt again for recoverable invalid field input. Do duplicate detection before prompts when configuration exists.

**Rationale:** shared configuration validity remains source of truth while avoiding partial writes or duplicated validation rules.

**Alternatives considered:** independent per-prompt validators can drift from parser rules; persisting then validating risks corrupting configuration.

## Risks / Trade-offs

- [Bun TOML lacks a documented stable stringifier] → use minimal deterministic serializer for current tool schema; preserve all known tool entries and validate generated text before atomic replacement.
- [First add targets a missing configuration file] → create parent directory and initial valid `[tools.<name>]` document only after all prompts validate.
- [Prompt cancellation has library-specific sentinel] → isolate sentinel handling in prompt adapter and cover each cancellation path with fakes.
- [Future unknown tool properties] → retain parsed raw tool objects during add; avoid passing persistence through normalized updater records.

## Migration Plan

No migration. Existing configuration remains readable and unchanged unless user invokes `--add`. Roll back by removing add command code; no stored-schema change is required.