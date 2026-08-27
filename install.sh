#!/usr/bin/env bash
set -euo pipefail

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
url=https://github.com/wsouto/delta/releases/latest/download/delta-linux-x64.tar.gz
printf 'Downloading Delta...\n'
curl -fsSL "$url" | tar -xzf - -C "$tmp" --strip-components=1
mkdir -p "$HOME/.local/bin"
printf 'Installing delta to %s...\n' "$HOME/.local/bin/delta"
install -m755 "$tmp/delta" "$HOME/.local/bin/delta"

config_dir="${XDG_CONFIG_HOME:-$HOME/.config}/delta"
config_file="$config_dir/tools.toml"
if [[ ! -e "$config_file" ]]; then
  printf 'Creating default configuration at %s...\n' "$config_file"
  mkdir -p "$config_dir"
  install -m644 "$tmp/tools.toml" "$config_file"
else
  printf 'Keeping existing configuration at %s.\n' "$config_file"
fi
printf 'Delta installed successfully. Run `delta` to get started.\n'
