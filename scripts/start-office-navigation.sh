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

# Check required environment variable
if [ -z "${OFFICE_BOT_ID:-}" ]; then
  echo "❌ Error: OFFICE_BOT_ID environment variable not set"
  echo "   Please set it to your bot ID (pm, xm, coder, alvin)"
  echo "   Example: export OFFICE_BOT_ID=pm"
  exit 1
fi

# Check if office-bot skill is available
if ! command -v office-bot &> /dev/null; then
  echo "❌ Error: office-bot command not found"
  echo "   Make sure the office-bot skill is in your PATH"
  exit 1
fi

echo "🤖 Starting office navigation for bot: $OFFICE_BOT_ID"

# Bind to the bot
echo "🔗 Binding to bot..."
office-bot bind "$OFFICE_BOT_ID"

# Set initial status to idle
echo "☕ Setting initial status to idle..."
office-bot task-status idle "Initialized"

# Start auto-navigate in background
echo "🗺️  Starting auto-navigate (30 second interval)..."
nohup office-bot auto-navigate 30 > ~/.openclaw/logs/auto-navigate-${OFFICE_BOT_ID}.log 2>&1 &
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
