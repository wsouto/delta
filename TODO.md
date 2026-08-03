# Project Roadmap

## Tool Administration — Shared Requirements

The following requirements apply to every Tool Administration feature (Add, Edit, Delete).

### Dependency

Install the prompts library:

```bash
bun add @clack/prompts
```

Use the package manager and dependency conventions already established by the repository.

### CLI Conventions

- Wire each administration flag into the existing commander program using the project’s current argument-parsing conventions.
- Each flag takes the tool’s unique name or identifier as its `<tool>` argument.
- Document all administration options in `--help`.
- A missing `<tool>` argument produces a clear usage or validation error.
- Reject conflicting administration operations in the same invocation unless the existing CLI
  architecture explicitly supports it.
- Preserve all existing CLI commands and behavior.
- Use consistent messages and exit behavior across add, edit, and delete operations.

### Storage & Persistence

- Add, edit, and delete operations persist through the project’s existing storage mechanism.
- The file written is the resolved configuration path, honoring `--config <path>` when provided.
- The XDG fallback resolution is used when `--config` is not provided.
- `--print-config-path` reports the file that administration operations would modify.
- Do not create the configuration file implicitly unless required by the operation.
- Reuse existing data-access and persistence utilities.
- Keep prompt logic separate from storage logic when practical.

### Tool Lookup

- Look up the tool identified by `<tool>`.
- If it does not exist:

  - Show a clear error message;
  - Exit without modifying stored data.

### Prompts & Cancellation

- Use `@clack/prompts` for each input and confirmation.
- The user must be able to cancel the operation at any prompt. Cancellation must:

  - exit cleanly;
  - show a cancellation message;
  - leave stored data unchanged.

### Validation

- Trim surrounding whitespace from entered values.
- Reject empty values.
- Follow any stricter validation already established by the project.
- Avoid duplicating validation between add and edit.

### TDD and Tests

Follow the configured TDD skill.

For each behavior:

1. Add or update a test that fails for the expected reason.
2. Implement the smallest change needed to make it pass.
3. Refactor while keeping the tests green.

Mock or abstract interactive prompts where necessary so tests remain deterministic and non-interactive.

The per-feature test coverage is listed in each feature's acceptance criteria.

### Final Validation

Before marking a feature complete, run the local verification documented in
`CONTRIBUTING.md` (`bun run check`, `bun run build`, and the non-mutating
compiled smoke tests), plus any additional formatting, Markdown, or TOML checks
configured by the repository. All checks must pass without disabling or
weakening existing validation.

### Delivery Process

Apply to every feature after its implementation step is complete.

Follow the workflow in `CONTRIBUTING.md`: open an issue describing the user
outcome, motivation, and acceptance criteria; create a feature branch from the
latest `origin/main` in an isolated worktree; commit each verified slice with a
Conventional Commit message; and open a draft pull request. Versioning and
release notes follow `CONTRIBUTING.md` (Releasing).

---

## [ ] Feature 1: Add a Tool

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

### Acceptance Criteria

- A valid tool can be added.
- The saved data contains the tool name, repository URL, version command, and update command.
- Adding a duplicate tool does not overwrite existing data.
- Invalid or empty values are rejected.
- Cancelling does not create partial data.
- Success and error states are clearly communicated.
- Relevant automated tests pass.
- Preservation of existing CLI behavior.

When complete, apply the Delivery Process.

---

## [ ] Feature 2: Edit a Tool

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

### Acceptance Criteria

- An existing tool can be edited.
- Each prompt displays the current value as its initial value.
- Submitted changes are persisted.
- Unchanged values remain unchanged.
- Editing a missing tool produces an error without creating it.
- Invalid or empty values are rejected.
- Cancelling preserves the original data.
- Relevant automated tests pass.
- Preservation of existing CLI behavior.

When complete, apply the Delivery Process.

---

## [ ] Feature 3: Delete a Tool

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
- Preservation of existing CLI behavior.

When complete, apply the Delivery Process.

---

## Definition of Done

A Tool Administration feature is complete only when:

- All acceptance criteria are satisfied;
- Tool data is persisted correctly;
- Cancellation never causes partial changes;
- Existing CLI behavior remains functional;
- All tests and repository checks pass;
- The Delivery Process has been applied;
- This roadmap is updated to mark verified work as complete.
