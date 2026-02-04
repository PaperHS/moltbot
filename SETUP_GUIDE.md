# Office Navigation Setup Guide

Complete setup guide for autonomous office bot navigation in WorkAdventure.

## Prerequisites

1. ✅ **Completed Phases 1-4**:
   - Map data API working
   - A* pathfinding functional
   - Task status management operational
   - Auto-navigate decision engine running

2. **Services Running**:
   - WebSocket server (wa-office/server/ws-server.js) on port 3001/3002
   - Viewer (wa-office/viewer.html) accessible in browser
   - OpenClaw gateway running

## Step 1: Configure Environment Variables

Choose one of the methods below:

### Method A: Add to ~/.profile (Recommended)

```bash
# Show the configuration template
./scripts/office-env.sh

# Add to your profile
cat scripts/office-env.sh >> ~/.profile

# Reload
source ~/.profile
```

### Method B: Manual Configuration

Edit `~/.profile` and add:

```bash
# Office Bot Configuration
export OFFICE_BOT_ID="pm"  # Change to your bot ID
export OFFICE_API_BASE="http://localhost:3001"
export OFFICE_API_KEY="openclaw-default-key"
```

Then reload:

```bash
source ~/.profile
```

## Step 2: Verify Plugin Installation

The plugin is already created at:

```
.openclaw/plugins/office-navigation/
├── package.json
├── index.js
└── README.md
```

Check if OpenClaw detects it:

```bash
# List all plugins
openclaw plugins list

# Should show: office-navigation
```

If not detected, restart the gateway:

```bash
openclaw gateway restart
```

## Step 3: Start Office Navigation

Run the startup script:

```bash
./scripts/start-office-navigation.sh
```

This script will:
1. Bind to the bot specified by `$OFFICE_BOT_ID`
2. Set initial task status to "idle"
3. Start auto-navigate in the background (30s interval)
4. Output the PID and log file location

Example output:

```
🤖 Starting office navigation for bot: pm
🔗 Binding to bot...
✅ Bound to **PM**
☕ Setting initial status to idle...
☕ **Task status updated: idle**
🗺️  Starting auto-navigate (30 second interval)...
✅ Office navigation started!
   Bot ID: pm
   Auto-navigate PID: 12345
   Log file: ~/.openclaw/logs/auto-navigate-pm.log
```

## Step 4: Verify Setup

### Check Bot Binding

```bash
office-bot status
```

Expected output:

```
📊 Status of **PM**:

State: coffee
Position: (25, 5)  # Should be at pantry (idle state)
Bound by: openclaw
```

### Check Auto-Navigate Logs

```bash
tail -f ~/.openclaw/logs/auto-navigate-pm.log
```

Expected output:

```
🤖 **Auto-navigate started for pm**

Check interval: 30 seconds
Logic: idle → pantry, working → desk_pm

Press Ctrl+C to stop

[14:30:15] Status: idle → Navigating to pantry
  ✅ Path found (18 tiles)
```

### Test Manual Task Status Change

```bash
# Simulate receiving a task
office-bot task-status working "Test task"

# Watch the bot move to desk in the viewer
# Wait ~5 seconds

# Check position
office-bot status
# Should show Position: (10, 4) - at desk

# Simulate task completion
office-bot task-status idle

# Watch the bot return to pantry
# Wait ~5 seconds

# Check position again
office-bot status
# Should show Position: (25, 5) - at pantry
```

## Step 5: Test Complete Workflow

### Scenario: Receive a Message

1. **Send a message to the bot via Telegram/Feishu**:
   ```
   "Hello, can you help me with something?"
   ```

2. **Expected behavior**:
   - `message_received` hook fires
   - Plugin calls: `office-bot task-status working "Hello, can you..."`
   - Auto-navigate detects status change
   - Bot moves to desk (10, 4)

3. **Verify in viewer**:
   - Bot should walk from pantry to desk
   - Speech bubble may show "working"

### Scenario: Agent Completes Task

1. **Agent processes the request and sends a response**

2. **Expected behavior**:
   - `message_sent` hook fires
   - Plugin calls: `office-bot task-status idle`
   - Auto-navigate detects status change
   - Bot moves to pantry (25, 5)

3. **Verify in viewer**:
   - Bot should walk from desk back to pantry
   - Speech bubble may show "coffee"

## Troubleshooting

### Plugin Not Loading

**Symptom**: `openclaw plugins list` doesn't show office-navigation

**Solutions**:
1. Check plugin directory exists:
   ```bash
   ls -la .openclaw/plugins/office-navigation/
   ```

2. Check package.json has correct structure:
   ```bash
   cat .openclaw/plugins/office-navigation/package.json
   ```

3. Restart gateway:
   ```bash
   openclaw gateway restart
   ```

### Hooks Not Firing

**Symptom**: Task status doesn't change when messages are received/sent

**Debug steps**:

1. Check environment variable:
   ```bash
   echo $OFFICE_BOT_ID
   ```

2. Check plugin logs in gateway console output

3. Test manual hook trigger (if available):
   ```bash
   # This depends on OpenClaw's internal testing tools
   # For now, use message sending as a test
   ```

4. Verify message_received hook is registered:
   - Look for log: `[office-navigation] Registering hooks`
   - Look for log: `[office-navigation] Plugin registered successfully`

### Bot Not Moving

**Symptom**: Task status changes but bot doesn't navigate

**Debug steps**:

1. Check auto-navigate is running:
   ```bash
   ps aux | grep "office-bot auto-navigate"
   ```

2. Check auto-navigate logs:
   ```bash
   tail -f ~/.openclaw/logs/auto-navigate-pm.log
   ```

3. Test manual goto:
   ```bash
   office-bot goto desk_pm
   office-bot goto pantry
   ```

4. Check WebSocket connection:
   ```bash
   curl http://localhost:3001/api/bots
   ```

### Task Status Command Fails

**Symptom**: `office-bot task-status` returns error

**Solutions**:

1. Check environment variables:
   ```bash
   echo $OFFICE_API_BASE
   echo $OFFICE_API_KEY
   ```

2. Test API directly:
   ```bash
   curl -H "x-api-key: openclaw-default-key" \
        http://localhost:3001/api/bots/pm/task-status
   ```

3. Check ws-server is running:
   ```bash
   ps aux | grep ws-server
   ```

## Advanced Configuration

### Change Auto-Navigate Interval

Edit `scripts/start-office-navigation.sh` and change:

```bash
# From:
nohup office-bot auto-navigate 30 > ...

# To (e.g., 15 seconds):
nohup office-bot auto-navigate 15 > ...
```

### Multiple Bots

To run multiple bots simultaneously:

```bash
# Terminal 1
export OFFICE_BOT_ID=pm
./scripts/start-office-navigation.sh

# Terminal 2
export OFFICE_BOT_ID=xm
./scripts/start-office-navigation.sh

# Terminal 3
export OFFICE_BOT_ID=coder
./scripts/start-office-navigation.sh
```

Each bot will have its own auto-navigate process and log file.

### Custom Desk Locations

If your bot ID doesn't match the desk location pattern, edit the plugin:

```javascript
// .openclaw/plugins/office-navigation/index.js

// Find this line:
targetLocation = `desk_${currentBotId}`;

// Change to custom mapping:
const deskMap = {
  'pm': 'desk_pm',
  'xm': 'desk_xm',
  'coder': 'desk_coder',
  'alvin': 'desk_alvin',
  'custom-bot': 'desk_custom'  // Add your custom mapping
};
targetLocation = deskMap[currentBotId] || `desk_${currentBotId}`;
```

## Stopping Office Navigation

### Stop Auto-Navigate

```bash
# Find the PID
ps aux | grep "office-bot auto-navigate"

# Kill it
kill <PID>

# Or use the PID from startup output
kill 12345
```

### Unbind Bot

```bash
office-bot unbind
```

### Disable Plugin

```bash
# If plugin commands are available
openclaw plugins disable office-navigation

# Or remove from config
```

## Next Steps

Once everything is working:

- Proceed to Phase 6: Full end-to-end testing
- Monitor bot behavior over multiple message cycles
- Optimize auto-navigate interval based on usage patterns
- Add error handling and retry logic as needed

## Success Criteria

✅ All checks passed:

- [ ] Plugin loaded successfully
- [ ] Environment variables configured
- [ ] Bot bound and status shows correct position
- [ ] Auto-navigate running in background
- [ ] Manual status change → bot moves to desk
- [ ] Manual status idle → bot returns to pantry
- [ ] Message received → bot moves to desk (full integration test)
- [ ] Message sent → bot returns to pantry (full integration test)

When all boxes are checked, Phase 5 is complete! 🎉
