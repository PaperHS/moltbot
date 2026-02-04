# Office Navigation Plugin

Automatically manages WorkAdventure office bot navigation based on OpenClaw agent task status.

## What It Does

This plugin integrates OpenClaw agent lifecycle with office bot movements:

1. **When a message is received** (`message_received` hook):
   - Sets bot task-status to "working"
   - Triggers auto-navigation to move bot to its desk

2. **When a message is sent** (`message_sent` hook):
   - Sets bot task-status to "idle"
   - Triggers auto-navigation to move bot to pantry (break room)

## Requirements

- Environment variable: `OFFICE_BOT_ID` (the bot ID to control, e.g., "pm", "xm", "coder")
- office-bot skill must be installed and functional
- WebSocket server running (wa-office/server/ws-server.js)
- Auto-navigate should be running in background

## Installation

This plugin is installed locally in the OpenClaw workspace:

```bash
# Already created at:
# .openclaw/plugins/office-navigation/
```

## Configuration

Set the bot ID in your environment:

```bash
# In ~/.profile or agent startup script
export OFFICE_BOT_ID="pm"  # or "xm", "coder", etc.
```

Optional: Override the skill command path:

```bash
export OFFICE_BOT_SKILL="/path/to/office-bot"  # default: "office-bot"
```

## Usage

The plugin runs automatically once OpenClaw gateway starts. You can verify it's loaded:

```bash
openclaw plugins list
```

## How It Works

```
User sends message (Telegram/Feishu)
  ↓
message_received hook fires
  ↓
Plugin calls: office-bot task-status working
  ↓
Auto-navigate detects status change
  ↓
Bot moves to desk
  ↓
Agent processes task
  ↓
Agent sends response to channel
  ↓
message_sent hook fires
  ↓
Plugin calls: office-bot task-status idle
  ↓
Auto-navigate detects status change
  ↓
Bot returns to pantry
```

## Troubleshooting

**Hook not firing:**
- Check plugin is enabled: `openclaw plugins list`
- Check logs: `openclaw gateway logs` or check console output
- Verify OFFICE_BOT_ID is set: `echo $OFFICE_BOT_ID`

**Task status not updating:**
- Ensure office-bot skill is in PATH
- Test manually: `office-bot task-status working`
- Check ws-server is running: `curl http://localhost:3001/api/bots`

**Bot not moving:**
- Verify auto-navigate is running
- Check bot is bound: `office-bot status`
- Test manual navigation: `office-bot goto desk_pm`

## Development

Edit the plugin:

```bash
vim .openclaw/plugins/office-navigation/index.js
```

After changes, restart the gateway:

```bash
openclaw gateway restart
```

## Phase 5 Integration

This plugin completes Phase 5 of the autonomous office navigation project:

- ✅ Message receive hook
- ✅ Message send hook
- ⏳ Environment configuration (OFFICE_BOT_ID)
- ⏳ Auto-bind and auto-navigate startup script
- ⏳ Full workflow testing
