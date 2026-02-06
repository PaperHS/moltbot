# Office Bot Extension

This extension integrates OpenClaw with the WorkAdventure Office map.

## Setup

1. Start the office server:
   ```bash
   pnpm office:server
   ```
   (Optional) Start the visualizer:
   ```bash
   pnpm office:web
   ```

2. The extension is auto-loaded by OpenClaw if it's in the workspace.

## Commands

- `/office-bot bind <character_id>` - Bind your OpenClaw user to a map character (pm, xm, coder, alvin)
- `/office-bot unbind` - Release control
- `/office-bot status` - Check your character status
- `/office-bot list` - List all available characters
- `/office-bot move <direction>` - Move (up, down, left, right)
- `/office-bot goto <location>` - Auto-walk to a location (pantry, desk_pm, etc.)
- `/office-bot say <message>` - Show a speech bubble
- `/office-bot state <working|coffee|offline>` - Set your visual state
- `/office-bot auto-navigate start` - Enable automatic idle/working movement

## Configuration

Environment variables (optional):
- `OFFICE_API_BASE` (default: http://localhost:3001)
- `OFFICE_API_KEY` (default: openclaw-default-key)
