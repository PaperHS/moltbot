#!/usr/bin/env bash

# Office Bot Environment Configuration
#
# Add these lines to your ~/.profile or ~/.bashrc

cat << 'EOF'

# ========================================
# Office Bot Auto-Navigation Configuration
# ========================================

# Required: Your bot ID (pm, xm, coder, or alvin)
export OFFICE_BOT_ID="pm"

# Required: Office API endpoint
export OFFICE_API_BASE="http://localhost:3001"

# Required: Office API key (must match ws-server OFFICE_API_KEY)
export OFFICE_API_KEY="openclaw-default-key"

# Optional: Override office-bot skill path (default: office-bot in PATH)
# export OFFICE_BOT_SKILL="/path/to/office-bot"

# ========================================

EOF

echo ""
echo "✨ Copy the above lines to your ~/.profile or ~/.bashrc"
echo ""
echo "Then reload your shell:"
echo "  source ~/.profile"
echo ""
echo "Or add them now:"
echo "  cat scripts/office-env.sh >> ~/.profile && source ~/.profile"
