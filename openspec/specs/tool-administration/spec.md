# tool-administration Specification

## Purpose

Lets users add managed CLI tools interactively without hand-editing Delta's TOML configuration files.

## Requirements

### Requirement: Add command interface

The CLI SHALL provide `-a, --add <tool>` and document it in `--help`. The command SHALL reject a
missing tool argument and conflicting administration operations without changing configuration.
Existing non-administration CLI behavior SHALL remain available.

#### Scenario: Help lists add option

- **WHEN** user runs Delta with `--help`
- **THEN** output lists `-a, --add <tool>` and its purpose

#### Scenario: Missing add argument

- **WHEN** user runs Delta with `--add` and no tool argument
- **THEN** command reports a clear usage or validation error and writes no configuration

### Requirement: New tool input collection

For an add operation, Delta SHALL prompt for repository URL, version command, and update command.
It SHALL trim surrounding whitespace and reject empty values and repository URLs that do not meet
existing configuration validation.

#### Scenario: Valid prompted values

- **WHEN** user supplies a tool name and valid values for all required prompts
- **THEN** Delta accepts collected values for persistence

#### Scenario: Invalid prompted value

- **WHEN** user submits an empty or invalid required value
- **THEN** Delta reports validation failure and does not write configuration

### Requirement: Duplicate tool protection

Delta SHALL reject an add operation when configuration already contains the requested tool name.
It SHALL report a clear error and SHALL preserve existing configuration unchanged.

#### Scenario: Duplicate tool name

- **WHEN** user adds a name that already exists in selected configuration
- **THEN** Delta reports duplicate tool error without replacing stored tool data

### Requirement: Cancellation safety

Delta SHALL allow cancellation at every add prompt. On cancellation, it SHALL show a cancellation
message, exit cleanly, and leave stored configuration unchanged.

#### Scenario: User cancels input

- **WHEN** user cancels any add prompt
- **THEN** Delta reports cancellation and creates no partial tool data

### Requirement: Safe configuration persistence

After valid input, Delta SHALL write the new tool's repository URL, version command, and update
command to selected configuration while preserving all existing definitions and valid TOML. It SHALL
target `--config <path>` when provided, otherwise resolved XDG configuration path;
`--print-config-path` SHALL report that same path. Failed writes SHALL not leave partial
configuration, and successful add SHALL report tool name.

#### Scenario: Add to explicit configuration path

- **WHEN** user adds valid tool using `--config <path>`
- **THEN** only that path contains a valid TOML definition with supplied tool fields and prior tool definitions unchanged

#### Scenario: Add using default path

- **WHEN** user adds valid tool without `--config`
- **THEN** Delta persists to resolved XDG configuration path

#### Scenario: Successful add feedback

- **WHEN** Delta persists a new tool successfully
- **THEN** output confirms addition and includes tool name

### Requirement: Edit command interface

The CLI SHALL provide `-e, --edit <tool>` and document it in `--help`. The command SHALL reject a
missing tool argument and conflicting administration operations without changing configuration.
Existing non-administration CLI behavior SHALL remain available.

#### Scenario: Help lists edit option

- **WHEN** user runs Delta with `--help`
- **THEN** output lists `-e, --edit <tool>` and its purpose

#### Scenario: Missing edit argument

- **WHEN** user runs Delta with `--edit` and no tool argument
- **THEN** command reports a clear usage or validation error and writes no configuration

### Requirement: Edit input collection

For an edit operation, Delta SHALL prompt for repository URL, version command, and update command,
pre-filling each prompt with the tool's current value. It SHALL trim surrounding whitespace and
reject empty values and repository URLs that do not meet existing configuration validation.

#### Scenario: Prompts pre-filled with current values

- **WHEN** user edits an existing tool
- **THEN** each prompt displays the tool's current value as its initial value

#### Scenario: Invalid edited value

- **WHEN** user submits an empty or invalid required value while editing
- **THEN** Delta reports validation failure and does not write configuration

### Requirement: Missing tool error on edit

Delta SHALL report a clear error and SHALL NOT create or modify configuration when the tool named
by the edit argument does not exist in the selected configuration.

#### Scenario: Editing a missing tool

- **WHEN** user runs `--edit <tool>` for a name not present in selected configuration
- **THEN** Delta reports a missing-tool error and leaves stored data unchanged

### Requirement: Edit cancellation safety

Delta SHALL allow cancellation at every edit prompt. On cancellation, it SHALL show a cancellation
message, exit cleanly, and leave stored configuration unchanged.

#### Scenario: User cancels edit input

- **WHEN** user cancels any edit prompt
- **THEN** Delta reports cancellation and writes no tool data

### Requirement: No-op edit detection

Delta SHALL detect when every submitted edit value equals the tool's current value, SHALL NOT
rewrite the configuration in that case, and SHALL report that no changes were made.

#### Scenario: Unchanged values

- **WHEN** user submits edit values identical to the tool's current values
- **THEN** Delta reports no changes were made and does not rewrite configuration

### Requirement: Safe edit persistence

After valid input, Delta SHALL write the edited tool's repository URL, version command, and update
command to selected configuration while preserving all existing definitions, valid TOML, and any
tool properties outside this feature's scope. It SHALL target `--config <path>` when provided,
otherwise resolved XDG configuration path; `--print-config-path` SHALL report that same path.
Failed writes SHALL not leave partial configuration, and a successful edit SHALL report the tool
name.

#### Scenario: Edit to explicit configuration path

- **WHEN** user edits a valid tool using `--config <path>`
- **THEN** only that path contains a valid TOML definition with the edited tool fields, the tool's
  out-of-scope properties unchanged, and prior tool definitions unchanged

#### Scenario: Successful edit feedback

- **WHEN** Delta persists an edited tool successfully
- **THEN** output confirms the edit and includes the tool name
