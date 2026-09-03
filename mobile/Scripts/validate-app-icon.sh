#!/bin/bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
icon="$script_dir/../Resources/Assets.xcassets/AppIcon.appiconset/AppIcon.png"

if [[ ! -f "$icon" ]]; then
  echo "error: missing App Store icon at $icon" >&2
  exit 1
fi

width="$(sips -g pixelWidth "$icon" | awk '/pixelWidth/ { print $2 }')"
height="$(sips -g pixelHeight "$icon" | awk '/pixelHeight/ { print $2 }')"
alpha="$(sips -g hasAlpha "$icon" | awk '/hasAlpha/ { print $2 }')"

if [[ "$width" != "1024" || "$height" != "1024" ]]; then
  echo "error: App Store icon must be 1024x1024; found ${width}x${height}" >&2
  exit 1
fi

if [[ "$alpha" != "no" ]]; then
  echo "error: App Store icon must not contain an alpha channel" >&2
  exit 1
fi

echo "App Store icon is 1024x1024 RGB with no alpha channel."
