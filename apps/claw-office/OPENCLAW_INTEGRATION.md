# OpenClaw Bot Control Integration

This WorkAdventure map has been integrated with OpenClaw to enable AI-controlled bots that can be controlled via Telegram or other messaging platforms.

## Architecture

```
[Telegram/WhatsApp] → [OpenClaw Gateway] → [WebSocket Server] ↔ [Browser Client]
                              ↓                    ↓
                         JWT Token          Bot State Management
```

The system consists of three components:

1. **WebSocket Server** (`server/ws-server.js`): Node.js server that manages bot state and provides HTTP/WebSocket APIs
2. **Browser Client** (`public/ws-client.js`): WebSocket client that runs in the browser and syncs with the server
3. **OpenClaw Skill** (`~/.openclaw/skills/office-bot/`): CLI skill that bridges Telegram commands to the WebSocket server

## Available Bots

- **pm** (老刘) - Product Manager
- **xm** (小美) - Designer
- **coder** (老叶) - Developer
- **alvin** (Alvin) - Boss

## Setup

### 1. Install Dependencies

```bash
cd /Users/alvin/workspace/wa-office
npm install ws jsonwebtoken express cors dotenv
```

### 2. Configure Environment

Create a `.env` file in the project root:

```bash
# WebSocket Server Configuration
PORT=3001
WS_PORT=3002
JWT_SECRET=your-random-secret-here
API_KEY=openclaw-default-key
```

Generate a secure JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Configure OpenClaw Skill

The OpenClaw skill needs environment variables. Add to your shell profile (`~/.zshrc` or `~/.bashrc`):

```bash
export OFFICE_API_BASE=http://localhost:3001
export OFFICE_API_KEY=openclaw-default-key
```

Or create a `.env` file in `~/.openclaw/skills/office-bot/`:

```bash
OFFICE_API_BASE=http://localhost:3001
OFFICE_API_KEY=openclaw-default-key
```

### 4. Start the WebSocket Server

```bash
node server/ws-server.js
```

You should see:

```
🚀 HTTP API Server running on http://localhost:3001
📡 WebSocket Server running on ws://localhost:3002
```

### 5. Start the Map Viewer

In a new terminal:

```bash
npm run dev
```

Open http://localhost:5173 in your browser.

### 6. Verify Connection

Open browser console and check for:

```
🤖 Office Bot WebSocket Client loading...
📡 Connecting to WebSocket server...
✅ WebSocket connected
✅ Authenticated
```

## Usage

### Control Bots via OpenClaw

From Telegram or your OpenClaw chat interface:

#### List all bots
```
/office-bot list
```

#### Bind to a bot
```
/office-bot bind pm
```

This takes control of the bot (老刘).

#### Move the bot
```
/office-bot move up
/office-bot move down
/office-bot move left
/office-bot move right
/office-bot move stop
```

#### Make bot say something
```
/office-bot say Hello everyone!
/office-bot say 需求文档还在改...
```

Speech bubbles appear for 5 seconds (default).

#### Change bot state
```
/office-bot state working
/office-bot state coffee
/office-bot state offline
```

States affect bot icon color in the map:
- working: Green [W]
- coffee: Orange [C]
- offline: Gray [Z]

#### Get bot status
```
/office-bot status
```

Shows current state, position, and binding info.

#### Unbind from bot
```
/office-bot unbind
```

Releases control; bot returns to AI autonomous behavior.

## Multi-Device Setup

If OpenClaw Gateway and the map viewer are on different devices:

1. **On the server device** (running WebSocket server):
   - Update `.env` to bind to `0.0.0.0`:
     ```bash
     PORT=3001
     WS_PORT=3002
     ```
   - Update `server/ws-server.js` if needed to listen on all interfaces
   - Ensure firewall allows ports 3001 and 3002

2. **On the OpenClaw device**:
   - Update skill environment:
     ```bash
     export OFFICE_API_BASE=http://<server-ip>:3001
     ```

3. **On the browser device**:
   - Update `public/ws-client.js` configuration OR pass via URL parameters:
     ```javascript
     const WS_URL = 'ws://<server-ip>:3002';
     const API_URL = 'http://<server-ip>:3001';
     ```

## Security

The system implements two-layer authentication:

### Layer 1: API Key (HTTP endpoints)
- All HTTP API requests require `x-api-key` header
- Default: `openclaw-default-key` (change in production!)
- Used for: Getting JWT tokens, bot commands

### Layer 2: JWT (WebSocket connection)
- Browser clients authenticate via JWT
- Tokens expire after 24 hours
- Token flow:
  1. Browser fetches token from `/api/auth/token` with API key
  2. Browser sends token via WebSocket `auth` message
  3. Server verifies JWT signature
  4. Authenticated clients can receive real-time updates

**Production recommendations:**
- Use strong random API key
- Use HTTPS/WSS in production
- Consider IP whitelisting
- Rotate JWT secret periodically

## API Reference

### HTTP Endpoints

All endpoints require `x-api-key` header.

#### POST /api/auth/token
Get JWT token for WebSocket connection.

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "wsUrl": "ws://localhost:3002"
}
```

#### GET /api/bots
List all bots.

**Response:**
```json
{
  "bots": [
    {
      "id": "pm",
      "name": "老刘 (PM)",
      "state": "working",
      "boundBy": null,
      "position": { "x": 15, "y": 19 }
    }
  ]
}
```

#### POST /api/bots/:id/bind
Bind to a bot.

**Request:**
```json
{ "clawId": "openclaw" }
```

**Response:**
```json
{
  "ok": true,
  "bot": { "id": "pm", "name": "老刘 (PM)" }
}
```

#### POST /api/bots/:id/unbind
Unbind from a bot.

**Response:**
```json
{ "ok": true }
```

#### POST /api/bots/:id/move
Move bot in a direction.

**Request:**
```json
{ "direction": "up" }
```

Valid directions: `up`, `down`, `left`, `right`, `stop`

**Response:**
```json
{ "ok": true, "direction": "up" }
```

#### POST /api/bots/:id/state
Set bot state.

**Request:**
```json
{ "state": "coffee" }
```

Valid states: `working`, `coffee`, `offline`

**Response:**
```json
{ "ok": true, "state": "coffee" }
```

#### POST /api/bots/:id/say
Make bot say something.

**Request:**
```json
{
  "message": "Hello!",
  "duration": 5000
}
```

**Response:**
```json
{ "ok": true, "message": "Hello!" }
```

#### GET /api/bots/:id
Get bot status.

**Response:**
```json
{
  "id": "pm",
  "name": "老刘 (PM)",
  "state": "working",
  "boundBy": "openclaw",
  "position": { "x": 15, "y": 19 },
  "speech": null
}
```

### WebSocket Messages

#### Client → Server

**Authentication:**
```json
{
  "type": "auth",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Position update (sync from browser to server):**
```json
{
  "type": "bot_update",
  "bot": { "id": "pm", "x": 15.5, "y": 19.2 }
}
```

#### Server → Client

**Authentication success:**
```json
{
  "type": "auth_success",
  "bots": [
    { "id": "pm", "x": 15, "y": 19, "state": "working", "boundBy": null }
  ]
}
```

**Bot bound:**
```json
{
  "type": "bot_bound",
  "bot": { "id": "pm", "boundBy": "openclaw" }
}
```

**Bot unbound:**
```json
{
  "type": "bot_unbound",
  "bot": { "id": "pm" }
}
```

**Bot move command:**
```json
{
  "type": "bot_move",
  "bot": { "id": "pm", "direction": "up" }
}
```

**Bot state change:**
```json
{
  "type": "bot_state",
  "bot": { "id": "pm", "state": "coffee" }
}
```

**Bot speech:**
```json
{
  "type": "bot_say",
  "bot": { "id": "pm", "message": "Hello!", "duration": 5000 }
}
```

**Bot position update (from other clients):**
```json
{
  "type": "bot_position",
  "bot": { "id": "pm", "x": 15.5, "y": 19.2 }
}
```

## Troubleshooting

### Browser can't connect to WebSocket

1. Check server is running: `curl http://localhost:3001/health`
2. Check browser console for errors
3. Verify `public/ws-client.js` has correct URL
4. Check firewall/CORS settings

### OpenClaw skill not working

1. Verify environment variables: `echo $OFFICE_API_BASE`
2. Test API directly:
   ```bash
   curl http://localhost:3001/api/bots -H "x-api-key: openclaw-default-key"
   ```
3. Check OpenClaw can access the API (network/firewall)
4. Verify skill is enabled: `openclaw skills list`

### Bots not responding to commands

1. Check browser console - WebSocket should be authenticated
2. Verify bot is bound: `/office-bot status`
3. Check server logs for errors
4. Try unbinding and rebinding: `/office-bot unbind` then `/office-bot bind pm`

### Position sync issues

1. Position sync happens every 2 seconds from browser to server
2. Multiple clients should see the same positions (with 2s lag max)
3. Check network latency if positions seem delayed

## Development

### Adding New Commands

1. Add HTTP endpoint in `server/ws-server.js`
2. Add handler in `~/.openclaw/skills/office-bot/index.js`
3. Add WebSocket message type in `public/ws-client.js`
4. Update documentation

### Debugging

**Browser debug interface:**
```javascript
// Check connection status
window.officeBotWS.status()

// Manually reconnect
window.officeBotWS.connect()

// Disconnect
window.officeBotWS.disconnect()

// Access bot data
window.clawControl._getAllBots()
window.clawControl._getBotById('pm')
```

**Server debug:**
- Server logs all WebSocket connections and API requests
- Check `console.log` output for authentication, binding, and command events

## Production Deployment

### Recommended Setup

1. **Use Process Manager:**
   ```bash
   npm install -g pm2
   pm2 start server/ws-server.js --name office-bot-server
   pm2 save
   pm2 startup
   ```

2. **Use HTTPS/WSS:**
   - Deploy behind nginx/caddy with TLS
   - Update WebSocket URL to `wss://`
   - Update API URL to `https://`

3. **Environment:**
   - Use strong random secrets
   - Never commit `.env` to git (already in `.gitignore`)
   - Use different API keys per environment

4. **Monitoring:**
   - Monitor WebSocket connections: server logs client count
   - Health endpoint: `GET /health`
   - Consider adding metrics/alerting

## License

See [LICENSE.code](./LICENSE.code) for code license.
