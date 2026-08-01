# Project Roadmap

## [ ] Feature: Tool Administration

Add interactive commands for creating, editing, and deleting tool definitions.

Use `@clack/prompts` for all interactive prompts and confirmations.
Follow the project’s existing architecture and command conventions.
Preserve the current persistence mechanism, validation rules, and configured TDD workflow.

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

## [ ] Step 1: Add a tool

Implement:

```text
-a, --add <tool>
```

### Add behavior

1. Parse the tool name from the `<tool>` argument.
2. Check whether a tool with the same name already exists.
3. If it exists:

   * Show a clear error message;
   * Do not overwrite it;
   * Exit without modifying stored data.
4. Prompt the user for:

   * repository URL;
   * version command;
   * Update command.
5. Validate all required values before saving.
6. Persist the new tool using the project’s existing storage mechanism.
7. Show a success message containing the tool name.

### Add prompt requirements

Use `@clack/prompts` for each input.

The user must be able to cancel the operation at any prompt. Cancellation must:

* exit cleanly;
* Show a cancellation message;
* Leave stored data unchanged.

### Validation

* Tool name must not be empty.
* Repository URL must not be empty.
* The version command must not be empty.
* The update command must not be empty.
* Trim surrounding whitespace from entered values.
* Follow any stricter validation already established by the project.

### Add acceptance criteria

* A valid tool can be added.
* The saved data contains the tool name, repository URL, version command, and update command.
* Adding a duplicate tool does not overwrite existing data.
* Invalid or empty values are rejected.
* Cancelling does not create partial data.
* Success and error states are clearly communicated.
* Relevant automated tests pass.

---

## [ ] Step 2: Edit a tool

Implement:

```text
-e, --edit <tool>
```

### Edit behavior

1. Look up the tool identified by `<tool>`.
2. If it does not exist:

   * Show a clear error message;
   * Exit without modifying stored data.
3. Prompt the user for:

   * repository URL;
   * version command;
   * Update command.
4. Pre-fill every prompt with the tool’s current value.
5. Validate the submitted values using the same rules as the add operation.
6. Persist the updated tool using the project’s existing storage mechanism.
7. Preserve any tool properties that are outside the scope of this feature.
8. Show a success message containing the tool name.

### Edit prompt requirements

Use `@clack/prompts`.

The user must be able to cancel the operation at any prompt. Cancellation must:

* exit cleanly;
* Show a cancellation message;
* Preserve the original tool data without partial updates.

### Edit acceptance criteria

* An existing tool can be edited.
* Each prompt displays the current value as its initial value.
* Submitted changes are persisted.
* Unchanged values remain unchanged.
* Editing a missing tool produces an error without creating it.
* Invalid or empty values are rejected.
* Cancelling preserves the original data.
* Relevant automated tests pass.

---

## [ ] Step 3: Delete a tool

Implement:

```text
-d, --delete <tool>
```

### Delete behavior

1. Look up the tool identified by `<tool>`.
2. If it does not exist:

   * Show a clear error message;
   * Exit without modifying stored data.
3. Display the tool’s current data:

   * tool name;
   * repository URL;
   * version command;
   * Update command.
4. Ask the user to confirm deletion using `@clack/prompts`.
5. Delete the tool only after explicit confirmation.
6. Persist the deletion using the project’s existing storage mechanism.
7. Show a success message containing the deleted tool name.

### Confirmation behavior

* Default to not deleting the tool.
* A rejected or cancelled confirmation must leave stored data unchanged.
* Show a clear message when deletion is cancelled.

### Delete acceptance criteria

* Existing tool data is displayed before confirmation.
* Confirming deletes the correct tool.
* Rejecting or cancelling preserves the tool.
* Deleting a missing tool produces a clear error.
* No other tool data is modified.
* Relevant automated tests pass.

---

## [ ] Shared Requirements

### Dependency

Install the prompts library:

```bash
bun add @clack/prompts
```

Use the package manager and dependency conventions already established by the repository.

### CLI behavior

* Preserve all existing CLI commands and behavior.
* Follow the project’s current argument-parsing conventions.
* Handle missing `<tool>` arguments with a clear usage or validation error.
* Do not allow conflicting administration operations in the same invocation.
* Only allow them when the existing CLI architecture explicitly supports it.
* Use consistent messages and exit behavior across add, edit, and delete operations.

### Architecture

* Reuse existing data-access and persistence utilities.
* Keep prompt logic separate from storage logic when practical.
* Avoid duplicating validation between add and edit.
* Avoid unrelated refactoring.
* Do not introduce dependencies other than `@clack/prompts` unless required by the existing architecture.

### TDD and tests

Follow the configured TDD skill.

For each behavior:

1. Add or update a test that fails for the expected reason.
2. Implement the smallest change needed to make it pass.
3. Refactor while keeping the tests green.

Tests should cover at least:

* successful add;
* duplicate add;
* cancelled add;
* Invalid add input;
* successful edit;
* Edit of a missing tool;
* cancelled edit;
* successful delete;
* rejected deletion;
* cancelled deletion;
* Deletion of a missing tool;
* persistence failures, if the project already models them;
* Preservation of existing CLI behavior.

Mock or abstract interactive prompts where necessary so tests remain deterministic and non-interactive.

### Final validation

Before marking this feature complete:

* Run the full test suite;
* run lint checks;
* Run formatting checks;
* Run type checking, if configured;
* Run all build validation, if configured;
* run commit hooks;
* Run the same checks performed by CI.

All checks must pass without disabling or weakening existing validation.

---

## Definition of Done

The feature is complete only when:

* all three administration operations are implemented;
* All acceptance criteria are satisfied;
* Tool data is persisted correctly;
* Cancellation never causes partial changes;
* Existing CLI behavior remains functional;
* all tests and repository checks pass;
* This roadmap is updated to mark verified work as complete.
