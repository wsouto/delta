## Purpose

Lets Delta update its own config entry by downloading the prebuilt release binary
instead of rebuilding itself from source, installable on any machine with a shell.

## ADDED Requirements

### Requirement: Self entry installs from the release artifact
The `[tools.delta]` entry in the user's `delta.toml` SHALL fetch and install the
prebuilt binary from the GitHub release artifact, not build it from a source tree.

#### Scenario: Update downloads the release binary
- **WHEN** the installed Delta version differs from the latest release tag and the updater runs the `update_command` for the `delta` tool
- **THEN** the command downloads the release artifact and replaces the installed binary with the extracted one

#### Scenario: Update does not require a source checkout
- **WHEN** the `delta` tool's `update_command` is invoked
- **THEN** it completes without requiring a local copy of the repository or a source build step

### Requirement: Release artifact has a version-stable URL
The release artifact SHALL be downloadable from a stable `releases/latest/download`
URL that resolves to the newest release without embedding the version in the name.

#### Scenario: Latest release resolves without config edit
- **WHEN** a new release is published
- **THEN** the existing `update_command` still resolves the newest artifact and no edit to `delta.toml` is required

### Requirement: Installed binary is replaced atomically
The update SHALL stage the downloaded binary in a temporary location and only then
move it into place, so a failed or interrupted download never leaves a truncated
binary on PATH.

#### Scenario: Interrupted download preserves the previous binary
- **WHEN** the download of a new release artifact fails mid-transfer
- **THEN** the previously installed binary remains intact and executable

#### Scenario: Successful download replaces the binary only after staging
- **WHEN** the download and extraction complete successfully
- **THEN** the staged binary is moved into the install location and becomes the one resolved on PATH

### Requirement: Installed binary lands on PATH
The update SHALL install the binary to a location where Delta's PATH lookup
(`Bun.which`) resolves it, so subsequent runs detect the new version.

#### Scenario: Path lookup finds the updated binary
- **WHEN** the update completes
- **THEN** running `delta --version` reports the newly installed version matching the release tag

#### Scenario: Already up to date is a no-op
- **WHEN** the installed version equals the latest release tag
- **THEN** the updater reports `no-op` and leaves the binary untouched
