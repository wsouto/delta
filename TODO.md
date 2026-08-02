# Project Roadmap

## [x] Feature 1: External Tool Configuration

Move tool definitions from hardcoded script data into an external TOML configuration file.

The configuration file must be stored at:

```text
$XDG_CONFIG_HOME/delta/delta.toml
```

When `XDG_CONFIG_HOME` is unset or empty, use:

```text
~/.config/delta/delta.toml
```

This feature must be completed before implementing Tool Administration.

## Goal

Replace the script’s hardcoded tool definitions with tool data loaded from the TOML configuration file.

This feature covers:

- configuration-path resolution;
- TOML schema definition;
- configuration loading and parsing;
- configuration validation;
- integration with the existing script;
- first-run guidance when no configuration exists.

This feature does not include interactive creation, editing, or deletion of tools.

---

## [x] Step 1: Define the Configuration Format

Define the TOML structure used to represent tools.

Each tool must contain:

- tool name or unique identifier;
- repository URL;
- version command;
- update command.

Use a structure that supports multiple uniquely named tools.

Example:

```toml
[tools.example]
repository = "https://example.com/owner/repository"
version_command = "example --version"
update_command = "example update"
```

The final field names and structure should follow the repository’s existing naming conventions where applicable.

### Acceptance Criteria

- The configuration format can represent multiple tools.
- Each tool has a unique name or identifier.
- All fields required by the current script are represented.
- The format is documented clearly enough to be edited manually.
- The example configuration is valid and can be parsed by the application.
- Relevant automated tests pass.

---

## [x] Step 2: Resolve the Configuration Path

Implement configuration-path resolution using the XDG Base Directory convention.

When `XDG_CONFIG_HOME` is set and non-empty, use:

```text
$XDG_CONFIG_HOME/delta/delta.toml
```

When `XDG_CONFIG_HOME` is unset or empty, use:

```text
~/.config/delta/delta.toml
```

Resolve the user’s home directory using the runtime or platform facilities already used by the project.

Do not hardcode a specific user’s home directory.

### Acceptance Criteria

- A configured `XDG_CONFIG_HOME` is respected.
- The application-specific `delta` directory is included.
- An unset `XDG_CONFIG_HOME` uses the correct fallback.
- An empty `XDG_CONFIG_HOME` uses the correct fallback.
- The resolved path ends with `delta/delta.toml`.
- Path resolution is isolated and independently testable.
- Tests do not depend on the developer’s actual environment.
- Relevant automated tests pass.

---

## [x] Step 3: Load and Parse the Configuration

Load tool definitions from the resolved TOML file.

### Behavior

1. Resolve the configuration path.
2. Read the TOML file.
3. Parse its contents.
4. Validate the top-level structure.
5. Validate every tool definition.
6. Return the tools using the internal representation expected by the application.

Use the project’s existing runtime capabilities for TOML parsing when available.

Introduce a new dependency only when necessary.

### Validation

Each tool must contain:

- repository URL;
- version command;
- update command.

Reject malformed or incomplete tool definitions.

Follow any stricter validation already established by the project.

### Error Handling

Produce clear and actionable errors for:

- unreadable configuration files;
- invalid TOML syntax;
- invalid top-level structure;
- missing required tool fields;
- invalid tool definitions;
- conflicting tool identifiers, if permitted by the selected TOML representation.

Errors should include the resolved configuration path when relevant.

A missing configuration file must be handled by the first-run experience defined in Step 5
rather than presented as a generic file-system or parser error.

### Acceptance Criteria

- A valid configuration containing one tool is loaded successfully.
- A valid configuration containing multiple tools is loaded successfully.
- Invalid TOML produces a clear and actionable error.
- Missing required fields produce a clear and actionable error.
- Invalid structures are rejected.
- Parsing and validation are testable without reading the user’s actual configuration.
- Relevant automated tests pass.

---

## [x] Step 4: Replace Hardcoded Tool Definitions

Remove hardcoded tool definitions from the application’s runtime path.

Update all existing operations that consume tool data so they use the configuration loader.

### Behavior

- Existing tool-related behavior must work with tools loaded from `delta.toml`.
- Tool lookup and iteration must use the loaded configuration.
- The configuration file must become the authoritative runtime source of tool definitions.
- Do not retain a silent fallback to the old hardcoded tool list.
- Preserve existing CLI behavior except where configuration loading necessarily changes first-run behavior.

### Migration Example

Provide a valid configuration example containing the tools that were previously hardcoded.

Depending on existing project conventions, place this in one or more of:

- project documentation;
- an example configuration file;
- setup instructions;
- test fixtures.

Do not automatically create or overwrite a user configuration file as part of this step.

### Acceptance Criteria

- The script no longer relies on hardcoded tool definitions.
- Every existing tool operation consumes the loaded configuration.
- Existing behavior works with an equivalent TOML configuration.
- No obsolete hardcoded tool data remains in the runtime implementation.
- Users can reproduce the former hardcoded setup in `delta.toml`.
- The migration example matches the implemented schema.
- Existing tests are updated without weakening their assertions.
- Relevant automated tests pass.

---

## [x] Step 5: Implement the First-Run Experience

Handle the absence of the configuration file as a normal first-run condition.

A missing configuration file is not a malformed configuration and should not be presented as an unexpected application error.

### Behavior

When the resolved configuration file does not exist:

1. Detect that no configuration has been created yet.
2. Explain that no tools are currently configured.
3. Display the fully resolved configuration path.
4. Explain that the user must create the configuration file and add at least one tool.
5. Display a minimal valid TOML example.
6. Explain how to run the command again after creating the file.
7. Exit gracefully without displaying:

   - a stacktrace;
   - a raw file-system error;
   - a TOML parsing error;
   - misleading failure language.

Example message:

```text
No tools have been configured yet.

Create the configuration file at:

  /home/user/.config/delta/delta.toml

Then add at least one tool:

  [tools.example]
  repository = "https://example.com/owner/repository"
  version_command = "example --version"
  update_command = "example update"

After saving the file, run Delta again.
```

The actual path displayed must be the path resolved for the current environment.

The example must match the final TOML schema implemented in Step 1.

### Exit Behavior

Use the project’s existing CLI exit conventions.

The command may return a non-zero status when it cannot continue without configured tools, but
the user-facing message must describe a required setup step rather than an unexpected internal
error.

### Acceptance Criteria

- A missing configuration file triggers the first-run message.
- The message explains that no tools are configured.
- The message displays the fully resolved configuration path.
- The path respects `XDG_CONFIG_HOME` when configured.
- The fallback path is displayed correctly when `XDG_CONFIG_HOME` is unavailable.
- The message includes a minimal valid TOML example.
- The example matches the implemented schema.
- The message explains what the user should do next.
- No stack trace or raw file-system error is displayed.
- The application does not create or overwrite a configuration file automatically.
- Existing configuration errors remain distinguishable from the first-run condition.
- Relevant automated tests pass.

---

## [x] Step 6: Add Configuration CLI Options

Expose configuration access through CLI help:

```text
-c, --config <path>
--print-config-path
```

### Behavior

- `--config <path>` overrides the XDG-resolved configuration file.
- `--print-config-path` prints the resolved configuration path and exits before reading it.

### Acceptance Criteria

- `delta --help` documents both options.
- Both options have automated coverage.
- The compiled CLI prints the XDG-resolved path.

---

## [x] Step 7: Prepare Feature Branch and Issue

Before publishing Feature 1:

- Open a GitHub issue describing the user outcome, motivation, and observable acceptance criteria.
- Start a feature branch from the latest `origin/main` using the issue number in its name.
- Keep the working tree isolated from `main`.

### Acceptance Criteria

- The issue exists and is linked to Feature 1.
- The branch is based on current `origin/main`.
- No unrelated changes are included.

## [x] Step 8: Verify, Version, and Commit Feature 1

Run repository checks required by `AGENTS.md`, `CONTRIBUTING.md`, and CI.
Determine the appropriate semantic version bump for Feature 1, update the
version source of truth and synchronized CLI metadata, and update release notes.
Review the complete diff, then create atomic Conventional Commit(s).

### Versioning

- `package.json` is the version source of truth.
- Keep `index.ts` CLI version synchronized with `package.json`.
- Record the user-visible release change in `CHANGELOG.md`.

### Acceptance Criteria

- The version bump matches the user-visible scope.
- `package.json` and `index.ts` report the same version.
- `CHANGELOG.md` contains the corresponding release note.
- Tests, lint, formatting, type checking, build, hooks, and CI-equivalent checks pass.
- The commit contains only Feature 1 changes.
- Commit message follows Conventional Commits.

---

## [x] Step 9: Push and Open Draft Pull Request

Push the feature branch and open a draft pull request targeting `main`.
Include:

- Summary;
- acceptance criteria and implementation status;
- verification commands and results;
- `Closes #<issue-number>`.

### Acceptance Criteria

- The remote branch is available.
- Draft pull request targets `main`.
- Pull request describes all Feature 1 changes and validation evidence.
- Issue and pull request are linked.

---

## [ ] Step 10: Handoff for Review and Merge

Stop implementation work after the draft pull request is ready.
The maintainer reviews, accepts, marks the pull request ready, and merges it.

### Acceptance Criteria

- Review handoff is explicit.
- No merge, approval, or release tag is performed by the implementation agent.
- Post-merge cleanup is performed only after maintainer merge.

## Shared Requirements

### Architecture

- Keep path resolution, file access, parsing, validation, presentation, and application integration separated where practical.
- Reuse existing types and utilities before creating new abstractions.
- Preserve existing naming, error-handling, and module conventions.
- Make configuration loading independently testable.
- Represent the missing-file condition distinctly from malformed or unreadable configuration errors.
- Keep first-run message generation testable without depending on terminal output.
- Avoid unrelated refactoring.
- Do not implement interactive Tool Administration as part of this feature.

### TDD and Tests

Follow the configured TDD skill.

Tests should cover at least:

- custom `XDG_CONFIG_HOME`;
- fallback configuration path;
- empty `XDG_CONFIG_HOME`;
- valid configuration with one tool;
- valid configuration with multiple tools;
- malformed TOML;
- invalid top-level structure;
- missing required tool fields;
- unreadable configuration files, when practical to model;
- first-run behavior for a missing configuration file;
- resolved path shown in the first-run message;
- valid TOML example shown in the first-run message;
- absence of raw file-system errors during first-run handling;
- integration with existing tool operations;
- removal of runtime dependence on hardcoded tool definitions;
- preservation of existing application behavior.

Use temporary directories, fixtures, dependency injection, environment isolation,
or equivalent techniques so tests do not read or modify the developer’s actual configuration.

### Configuration Validation

Validation occurs in two stages.

1. TOML validation
   - Performed by the TOML parser.
   - Ensures the file is valid TOML.

2. Schema validation
   - Performed by Delta.
   - Ensures the parsed TOML matches Delta's configuration schema.

### Final Validation

Before marking this feature complete:

- Run the full test suite;
- Run lint checks;
- Run formatting checks;
- Run type checking, if configured;
- Run all build validation, if configured;
- Run commit hooks;
- Run the same checks performed by CI.

All checks must pass without disabling or weakening existing validation.

---

## Definition of Done

This feature is complete only when:

- The TOML format is defined and documented;
- The XDG configuration path is resolved correctly;
- The configuration is stored under the application-specific `delta` directory;
- Valid configuration files load successfully;
- Invalid configurations produce actionable errors;
- A missing configuration produces a clear first-run message;
- The first-run message displays the resolved path and a valid example;
- The script uses configuration data instead of hardcoded tools;
- An example equivalent to the previous hardcoded data is available;
- Existing behavior remains functional;
- No Tool Administration behavior has been implemented;
- All tests and repository checks pass;
- This roadmap is updated to mark verified work as complete.

---

## [ ] Feature 2: Tool Administration

Add interactive commands for creating, editing, and deleting tool definitions stored in:

```text
$XDG_CONFIG_HOME/delta/delta.toml
```

or, when `XDG_CONFIG_HOME` is unset:

```text
~/.config/delta/delta.toml
```

This feature must be implemented as a separate goal after External Tool Configuration is complete.

The Tool Administration specification follows below.

## [ ] Feature 2: Tool Administration

Add interactive commands for creating, editing, and deleting tool definitions.

Use `@clack/prompts` for all interactive prompts and confirmations. Follow the project’s
existing architecture, command conventions, persistence mechanism, validation rules, and
configured TDD workflow.

## Scope

Implement these CLI operations:

```text
-a, --add <tool>
-e, --edit <tool>
-d, --delete <tool>
```

The `<tool>` argument is the tool’s unique name or identifier.

Work through the implementation steps in the order listed below.

---

## [ ] Step 1: Add a Tool

Implement:

```text
-a, --add <tool>
```

### Behavior

1. Parse the tool name from the `<tool>` argument.
2. Check whether a tool with the same name already exists.
3. If it exists:

   - Show a clear error message;
   - Do not overwrite it;
   - Exit without modifying stored data.

4. Prompt the user for:

   - repository URL;
   - version command;
   - update command.

5. Validate all required values before saving.
6. Persist the new tool using the project’s existing storage mechanism.
7. Show a success message containing the tool name.

### Prompt Requirements

Use `@clack/prompts` for each input.

The user must be able to cancel the operation at any prompt. Cancellation must:

- exit cleanly;
- Show a cancellation message;
- Leave stored data unchanged.

### Validation

- Tool name must not be empty.
- Repository URL must not be empty.
- The version command must not be empty.
- The update command must not be empty.
- Trim surrounding whitespace from entered values.
- Follow any stricter validation already established by the project.

### Acceptance Criteria

- A valid tool can be added.
- The saved data contains the tool name, repository URL, version command, and update command.
- Adding a duplicate tool does not overwrite existing data.
- Invalid or empty values are rejected.
- Cancelling does not create partial data.
- Success and error states are clearly communicated.
- Relevant automated tests pass.

---

## [ ] Step 2: Edit a Tool

Implement:

```text
-e, --edit <tool>
```

### Behavior

1. Look up the tool identified by `<tool>`.
2. If it does not exist:

   - Show a clear error message;
   - Exit without modifying stored data.

3. Prompt the user for:

   - repository URL;
   - version command;
   - update command.

4. Pre-fill every prompt with the tool’s current value.
5. Validate the submitted values using the same rules as the add operation.
6. Persist the updated tool using the project’s existing storage mechanism.
7. Preserve any tool properties that are outside the scope of this feature.
8. Show a success message containing the tool name.

### Prompt Requirements

Use `@clack/prompts`.

The user must be able to cancel the operation at any prompt. Cancellation must:

- Exit cleanly;
- Show a cancellation message;
- Preserve the original tool data without partial updates.

### Acceptance Criteria

- An existing tool can be edited.
- Each prompt displays the current value as its initial value.
- Submitted changes are persisted.
- Unchanged values remain unchanged.
- Editing a missing tool produces an error without creating it.
- Invalid or empty values are rejected.
- Cancelling preserves the original data.
- Relevant automated tests pass.

---

## [ ] Step 3: Delete a Tool

Implement:

```text
-d, --delete <tool>
```

### Behavior

1. Look up the tool identified by `<tool>`.
2. If it does not exist:

   - Show a clear error message;
   - Exit without modifying stored data.

3. Display the tool’s current data:

   - tool name;
   - repository URL;
   - version command;
   - update command.

4. Ask the user to confirm deletion using `@clack/prompts`.
5. Delete the tool only after explicit confirmation.
6. Persist the deletion using the project’s existing storage mechanism.
7. Show a success message containing the deleted tool name.

### Confirmation Behavior

- Default to not deleting the tool.
- A rejected or cancelled confirmation must leave stored data unchanged.
- Show a clear message when deletion is cancelled.

### Acceptance Criteria

- Existing tool data is displayed before confirmation.
- Confirming deletes the correct tool.
- Rejecting or cancelling preserves the tool.
- Deleting a missing tool produces a clear error.
- No other tool data is modified.
- Relevant automated tests pass.

---

## [ ] Shared Requirements

### Dependency

Install the prompts library:

```bash
bun add @clack/prompts
```

Use the package manager and dependency conventions already established by the repository.

### CLI Behavior

- Preserve all existing CLI commands and behavior.
- Follow the project’s current argument-parsing conventions.
- Handle missing `<tool>` arguments with a clear usage or validation error.
- Do not allow conflicting administration operations in the same invocation unless the
  existing CLI architecture explicitly supports it.
- Use consistent messages and exit behavior across add, edit, and delete operations.

### Architecture

- Reuse existing data-access and persistence utilities.
- Keep prompt logic separate from storage logic when practical.
- Avoid duplicating validation between add and edit.
- Avoid unrelated refactoring.
- Do not introduce dependencies other than `@clack/prompts` unless required by the existing architecture.

### TDD and Tests

Follow the configured TDD skill.

For each behavior:

1. Add or update a test that fails for the expected reason.
2. Implement the smallest change needed to make it pass.
3. Refactor while keeping the tests green.

Tests should cover at least:

- successful add;
- duplicate add;
- cancelled add;
- invalid add input;
- successful edit;
- edit of a missing tool;
- cancelled edit;
- successful delete;
- rejected deletion;
- cancelled deletion;
- deletion of a missing tool;
- persistence failures, if the project already models them;
- Preservation of existing CLI behavior.

Mock or abstract interactive prompts where necessary so tests remain deterministic and non-interactive.

### Final Validation

Before marking this feature complete:

- Run the full test suite;
- Run lint checks;
- Run formatting checks;
- Run type checking, if configured;
- Run all build validation, if configured;
- Run commit hooks;
- Run the same checks performed by CI.

All checks must pass without disabling or weakening existing validation.

---

## Definition of Done

The feature is complete only when:

- All three administration operations are implemented;
- All acceptance criteria are satisfied;
- Tool data is persisted correctly;
- Cancellation never causes partial changes;
- Existing CLI behavior remains functional;
- All tests and repository checks pass;
- This roadmap is updated to mark verified work as complete.
