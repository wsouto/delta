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

Before marking a feature complete:

- Run the full test suite;
- Run lint checks;
- Run formatting checks;
- Run type checking, if configured;
- Run all build validation, if configured;
- Run commit hooks;
- Run the same checks performed by CI.

All checks must pass without disabling or weakening existing validation.

### Delivery Process

Apply to every feature after its implementation step is complete.

1. **Prepare Feature Branch and Issue**

   - Open a GitHub issue describing the user outcome, motivation, and observable acceptance criteria.
   - Start a feature branch from the latest `origin/main` using the issue number in its name.
   - Keep the working tree isolated from `main`.

   Acceptance criteria:

   - The issue exists and is linked to the feature.
   - The branch is based on current `origin/main`.
   - No unrelated changes are included.

2. **Verify, Version, and Commit**

   Determine the appropriate semantic version bump for the feature.

   Run repository checks required by `AGENTS.md`, `CONTRIBUTING.md`, and CI.
   Update the version source of truth and synchronized CLI metadata, and update release notes.
   Review the complete diff, then create atomic Conventional Commit(s).

   Versioning:

   - `package.json` is the version source of truth.
   - Keep `index.ts` CLI version synchronized with `package.json`.
   - Record the user-visible release change in `CHANGELOG.md`.

   Acceptance criteria:

   - The version bump matches the user-visible scope.
   - `package.json` and `index.ts` report the same version.
   - `CHANGELOG.md` contains the corresponding release note.
   - Tests, lint, formatting, type checking, build, hooks, and CI-equivalent checks pass.
   - The commit contains only the feature's changes.
   - Commit message follows Conventional Commits.

3. **Push and Open Draft Pull Request**

   Push the feature branch and open a draft pull request targeting `main`.
   Include:

   - Summary;
   - acceptance criteria and implementation status;
   - verification commands and results;
   - `Closes #<issue-number>`.

   Acceptance criteria:

   - The remote branch is available.
   - Draft pull request targets `main`.
   - Pull request describes all the feature's changes and validation evidence.
   - Issue and pull request are linked.

4. **Handoff for Review and Merge**

   Stop implementation work after the draft pull request is ready.
   The maintainer reviews, accepts, marks the pull request ready, and merges it.

   Acceptance criteria:

   - Review handoff is explicit.
   - No merge, approval, or release tag is performed by the implementation agent.
   - Post-merge cleanup is performed only after maintainer merge.

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
