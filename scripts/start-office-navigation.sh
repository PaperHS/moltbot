#!/usr/bin/env bash

# Office Bot Auto-Navigation Startup Script
#
# This script:
# 1. Binds to the office bot specified by OFFICE_BOT_ID
# 2. Sets initial task status to idle
# 3. Starts auto-navigate in the background
#
# Usage:
#   export OFFICE_BOT_ID="pm"
#   ./start-office-navigation.sh

set -euo pipefail

# 1. Environment Validation
if [ -z "${OFFICE_BOT_ID:-}" ]; then
  echo "❌ Error: OFFICE_BOT_ID environment variable not set"
  echo "   Please set it to your bot ID (pm, xm, coder, alvin)"
  exit 1
fi

# 2. Skill Resolver
# Try to find the best way to call the office-bot skill
if [ -n "${OFFICE_BOT_SKILL:-}" ]; then
  # Use provided override
  SKILL_CMD="$OFFICE_BOT_SKILL"
elif command -v office-bot &> /dev/null; then
  # Use global command
  SKILL_CMD="office-bot"
elif [ -f "./skills/office-bot/index.js" ]; then
  # Use local development path
  SKILL_CMD="node ./skills/office-bot/index.js"
else
  echo "❌ Error: Could not find office-bot skill"
  echo "   Tried: \$OFFICE_BOT_SKILL, 'office-bot' in PATH, and ./skills/office-bot/index.js"
  echo "   Please set OFFICE_BOT_SKILL to the correct command/path"
  exit 1
fi

# 3. Execution Helper
run_skill() {
  # We use eval here to support multi-word commands in SKILL_CMD (e.g., "node index.js")
  eval "$SKILL_CMD $1"
}

echo "🤖 Starting office navigation for bot: $OFFICE_BOT_ID"
echo "🛠️  Using skill command: $SKILL_CMD"

# 4. Initialization
echo "🔗 Binding to bot..."
run_skill "bind $OFFICE_BOT_ID"

echo "☕ Setting initial status to idle..."
run_skill "task-status idle 'Initialized via script'"

# 5. Background Navigation Loop
# Ensure logs directory exists
mkdir -p ~/.openclaw/logs

echo "🗺️  Starting auto-navigate (30 second interval)..."
# We need to run the background process using the same skill command
nohup bash -c "$SKILL_CMD auto-navigate 30" > ~/.openclaw/logs/auto-navigate-${OFFICE_BOT_ID}.log 2>&1 &
AUTO_NAV_PID=$!

echo "✅ Office navigation started!"
echo "   Bot ID: $OFFICE_BOT_ID"
echo "   Auto-navigate PID: $AUTO_NAV_PID"
echo "   Log file: ~/.openclaw/logs/auto-navigate-${OFFICE_BOT_ID}.log"
echo ""
echo "💡 Tip: The bot will now automatically:"
echo "   - Move to desk when receiving messages (working)"
echo "   - Return to pantry when idle (after sending replies)"
echo ""
echo "To stop auto-navigate:"
echo "   kill $AUTO_NAV_PID"
echo ""
echo "To view logs:"
echo "   tail -f ~/.openclaw/logs/auto-navigate-${OFFICE_BOT_ID}.log"
