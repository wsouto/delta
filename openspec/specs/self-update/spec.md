# self-update Specification

## Purpose

Lets Delta update its own config entry by downloading the prebuilt release binary
instead of rebuilding itself from source, installable on any machine with a shell.

## Requirements

### Requirement: Self entry installs from the release artifact
The `[tools.delta]` entry in the user's `tools.toml` SHALL install the prebuilt
binary from the GitHub release artifact by performing a single `curl | sh`, where
the fetched script (`install.sh`) performs the release download and install. The
`update_command` SHALL NOT embed the download or install shell logic inline in the
config.

#### Scenario: Update downloads the release binary via install.sh
- **WHEN** the installed Delta version differs from the latest release tag and the updater runs the `update_command` for the `delta` tool
- **THEN** the command fetches `install.sh` from a stable repo URL and pipes it to `sh`, which downloads the release artifact and replaces the installed binary

#### Scenario: Config holds only the curl pipeline
- **WHEN** a user inspects the `[tools.delta]` entry in `tools.toml`
- **THEN** the `update_command` is a single `curl ... | sh` and contains no inline download, extraction, or install steps

#### Scenario: Update does not require a source checkout
- **WHEN** the `delta` tool's `update_command` is invoked
- **THEN** it completes without requiring a local copy of the repository or a source build step

### Requirement: Install script has a version-stable URL
The `install.sh` script SHALL be fetchable from a stable, version-independent URL
so the configured `update_command` keeps working across releases without an edit
to `delta.toml`. The script SHALL itself resolve the `releases/latest/download`
artifact URL so a new release is picked up automatically.

#### Scenario: Latest release resolves without config edit
- **WHEN** a new release is published
- **THEN** the existing `update_command` still fetches the same `install.sh` URL and the script resolves the newest artifact, so no edit to `delta.toml` is required

#### Scenario: Script URL is stable across releases
- **WHEN** the installed Delta version differs from the latest release tag
- **THEN** the `curl` pipeline targets the same stable script URL regardless of which release is current

### Requirement: Installed binary is replaced atomically
The fetched `install.sh` SHALL stage the downloaded binary in a temporary location
and only then move it into place, so a failed or interrupted download never leaves
a truncated binary on PATH.

#### Scenario: Interrupted download preserves the previous binary
- **WHEN** the download of a new release artifact fails mid-transfer
- **THEN** the previously installed binary remains intact and executable

#### Scenario: Successful download replaces the binary only after staging
- **WHEN** the download and extraction complete successfully
- **THEN** the staged binary is moved into the install location and becomes the one resolved on PATH

### Requirement: Installed binary lands on PATH
The fetch-and-install flow SHALL install the binary to a location where Delta's
PATH lookup (`Bun.which`) resolves it, so subsequent runs detect the new version.

#### Scenario: Path lookup finds the updated binary
- **WHEN** the update completes
- **THEN** running `delta --version` reports the newly installed version matching the release tag

### Requirement: Initial configuration comes from the release artifact
The release archive SHALL include `tools.toml`. On first installation, the
install script SHALL copy that bundled template to the resolved default
configuration path without downloading configuration from the repository branch.

#### Scenario: Fresh install creates the default configuration
- **WHEN** `tools.toml` does not exist at the resolved default configuration path
- **THEN** the install script copies the template from the downloaded release archive

#### Scenario: Existing configuration is preserved
- **WHEN** `tools.toml` already exists at the resolved default configuration path
- **THEN** the install script leaves it unchanged

#### Scenario: Already up to date is a no-op
- **WHEN** the installed version equals the latest release tag
- **THEN** the updater reports `no-op` and leaves the binary untouched
