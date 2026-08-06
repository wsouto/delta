## ADDED Requirements

### Requirement: Delete command interface

The CLI SHALL provide `-d, --delete <tool>` and document it in `--help`. The command SHALL reject a
missing tool argument and conflicting administration operations without changing configuration.
Existing non-administration CLI behavior SHALL remain available.

#### Scenario: Help lists delete option

- **WHEN** user runs Delta with `--help`
- **THEN** output lists `-d, --delete <tool>` and its purpose

#### Scenario: Missing delete argument

- **WHEN** user runs Delta with `--delete` and no tool argument
- **THEN** command reports a clear usage or validation error and writes no configuration

### Requirement: Missing tool error on delete

Delta SHALL report a clear error and SHALL NOT modify configuration when the tool named by the
delete argument does not exist in the selected configuration.

#### Scenario: Deleting a missing tool

- **WHEN** user runs `--delete <tool>` for a name not present in selected configuration
- **THEN** Delta reports a missing-tool error and leaves stored data unchanged

### Requirement: Delete confirmation

Before removing a tool, Delta SHALL display the tool's current data: name, repository URL, version
command, and update command. Delta SHALL then ask the user to confirm deletion using
`@clack/prompts`. The default selection SHALL NOT delete the tool. Delta SHALL only remove the
tool after the user explicitly confirms.

#### Scenario: Tool data shown before confirmation

- **WHEN** user requests deletion of an existing tool
- **THEN** Delta displays the tool's name, repository URL, version command, and update command before asking for confirmation

#### Scenario: Rejected confirmation preserves the tool

- **WHEN** user rejects the deletion confirmation
- **THEN** the tool remains in selected configuration and no other tool data is modified

#### Scenario: Confirmed deletion removes only the named tool

- **WHEN** user confirms the deletion
- **THEN** Delta removes only the named tool and preserves every other tool definition in the file

### Requirement: Delete cancellation safety

Delta SHALL allow cancellation of the delete confirmation. On cancellation, it SHALL show a
cancellation message, exit cleanly, and leave stored configuration unchanged.

#### Scenario: User cancels delete confirmation

- **WHEN** user cancels the delete confirmation
- **THEN** Delta reports cancellation and leaves stored data unchanged

### Requirement: Safe delete persistence

Delta SHALL remove the requested tool's text section from selected configuration, target
`--config <path>` when provided or otherwise the resolved XDG configuration path, leave every
other tool definition unchanged, and keep the resulting file a valid TOML document. Deleting the
final configured tool SHALL be permitted and SHALL leave a valid TOML document. Failed writes
SHALL not leave partial configuration, and a successful delete SHALL report the tool name.

#### Scenario: Delete via explicit configuration path

- **WHEN** user deletes a valid tool using `--config <path>`
- **THEN** only that path contains a valid TOML document without the named tool and with every other tool definition unchanged

#### Scenario: Delete via default configuration path

- **WHEN** user deletes a valid tool without `--config`
- **THEN** Delta persists the deletion to the resolved XDG configuration path

#### Scenario: Deleting the final tool keeps a valid TOML document

- **WHEN** user deletes the last configured tool
- **THEN** the file remains a valid TOML document without that tool's table

#### Scenario: Successful delete feedback

- **WHEN** Delta persists a deletion successfully
- **THEN** output confirms the deletion and includes the tool name
