#!/usr/bin/env node

/**
 * WorkAdventure Office Bot WebSocket Server
 *
 * Features:
 * - JWT authentication for OpenClaw
 * - WebSocket for real-time bot control
 * - HTTP API for commands
 * - Dynamic bot creation and persistence
 */

import { WebSocketServer } from 'ws';
import http from 'http';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==================== Configuration ====================

const PORT = process.env.PORT || 3001;
const WS_PORT = process.env.WS_PORT || 3002;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const API_KEY = process.env.API_KEY || 'openclaw-default-key';
const BOTS_FILE = path.join(__dirname, 'bots.json');
const SPAWN_POSITION = { x: 13, y: 19 };

console.log('🔐 JWT Secret:', JWT_SECRET.substring(0, 10) + '...');
console.log('🔑 API Key:', API_KEY);

// ==================== Bot State ====================

const CHARACTERS = {
  pm: { name: '老刘 (PM)', src: 'characters/PM_OldLiu.png' },
  xm: { name: '小美 (Design)', src: 'characters/Designer_XiaoMei.png' },
  coder: { name: '老叶 (Dev)', src: 'characters/Coder_OldYe.png' },
  alvin: { name: 'Alvin (Boss)', src: 'characters/Alvin.png' }
};

const AVAILABLE_CHARACTERS = ['pm', 'xm', 'coder', 'alvin'];

// ==================== Map Data ====================

const MAP_INFO = {
  width: 31,
  height: 21,
  tileSize: 32,
  layers: ['start', 'collisions', 'floor']
};

const LOCATIONS = {
  desk_pm: { x: 10, y: 4, name: 'PM工位' },
  desk_xm: { x: 10, y: 6, name: 'Design工位' },
  desk_coder: { x: 13, y: 4, name: 'Dev工位' },
  desk_alvin: { x: 6, y: 8, name: 'Boss工位' },
  pantry: { x: 25, y: 5, name: '茶水间' },
  spawn: { x: 13, y: 19, name: '出生点' }
};

// ==================== Map Loading & Pathfinding ====================

let mapCollisions = null;

// Load map data from office.tmj
function loadMapData() {
  try {
    const mapPath = path.join(__dirname, '..', 'office.tmj');
    const mapData = JSON.parse(fs.readFileSync(mapPath, 'utf8'));

    // Find collisions layer
    const collisionLayer = mapData.layers.find(l => l.name === 'collisions');
    if (collisionLayer && collisionLayer.data) {
      mapCollisions = {
        width: mapData.width,
        height: mapData.height,
        data: collisionLayer.data
      };
      console.log(`📍 Loaded collision map: ${mapCollisions.width}x${mapCollisions.height}`);
    } else {
      console.warn('⚠️  No collision layer found in map');
    }
  } catch (err) {
    console.error('❌ Failed to load map data:', err.message);
  }
}

// Check if a tile is walkable
function isWalkable(x, y) {
  if (!mapCollisions) return true;
  if (x < 0 || x >= mapCollisions.width || y < 0 || y >= mapCollisions.height) {
    return false;
  }
  const idx = y * mapCollisions.width + x;
  return mapCollisions.data[idx] === 0;
}

// A* pathfinding algorithm
function findPath(startX, startY, endX, endY) {
  startX = Math.floor(startX);
  startY = Math.floor(startY);
  endX = Math.floor(endX);
  endY = Math.floor(endY);

  // Check if start/end are valid
  if (!isWalkable(startX, startY) || !isWalkable(endX, endY)) {
    return null;
  }

  // Manhattan distance heuristic
  const heuristic = (x, y) => Math.abs(x - endX) + Math.abs(y - endY);

  const openSet = new Map();
  const closedSet = new Set();
  const cameFrom = new Map();
  const gScore = new Map();
  const fScore = new Map();

  const startKey = `${startX},${startY}`;
  const endKey = `${endX},${endY}`;

  openSet.set(startKey, { x: startX, y: startY });
  gScore.set(startKey, 0);
  fScore.set(startKey, heuristic(startX, startY));

  while (openSet.size > 0) {
    // Find node with lowest fScore
    let current = null;
    let currentKey = null;
    let lowestF = Infinity;

    for (const [key, node] of openSet) {
      const f = fScore.get(key) || Infinity;
      if (f < lowestF) {
        lowestF = f;
        current = node;
        currentKey = key;
      }
    }

    if (!current) break;

    // Reached goal
    if (currentKey === endKey) {
      const path = [];
      let key = currentKey;
      while (key) {
        const node = cameFrom.get(key) || current;
        path.unshift({ x: node.x, y: node.y });
        key = cameFrom.get(key) ? `${node.x},${node.y}` : null;
        if (key === startKey) {
          path.unshift({ x: startX, y: startY });
          break;
        }
      }
      return path;
    }

    openSet.delete(currentKey);
    closedSet.add(currentKey);

    // Check neighbors (4-directional)
    const neighbors = [
      { x: current.x, y: current.y - 1 }, // up
      { x: current.x, y: current.y + 1 }, // down
      { x: current.x - 1, y: current.y }, // left
      { x: current.x + 1, y: current.y }  // right
    ];

    for (const neighbor of neighbors) {
      if (!isWalkable(neighbor.x, neighbor.y)) continue;

      const neighborKey = `${neighbor.x},${neighbor.y}`;
      if (closedSet.has(neighborKey)) continue;

      const tentativeG = (gScore.get(currentKey) || 0) + 1;

      if (!openSet.has(neighborKey)) {
        openSet.set(neighborKey, neighbor);
      } else if (tentativeG >= (gScore.get(neighborKey) || Infinity)) {
        continue;
      }

      cameFrom.set(neighborKey, current);
      gScore.set(neighborKey, tentativeG);
      fScore.set(neighborKey, tentativeG + heuristic(neighbor.x, neighbor.y));
    }
  }

  return null; // No path found
}

// Local bot (always present, keyboard-controllable)
const localBots = [
  {
    id: 'alvin-local',
    type: 'local',
    character: 'alvin',
    name: 'Alvin (You)',
    x: 15,
    y: 20,
    target: 'desk_alvin',
    state: 'working',
    boundBy: null,
    speech: null,
    manual: false,
    _moveDir: null,
    _autoMove: false
  }
];

// Remote bots (OpenClaw-controlled, dynamic)
const remoteBots = new Map();

// ==================== Persistence ====================

function loadBotsFromFile() {
  try {
    if (fs.existsSync(BOTS_FILE)) {
      const data = fs.readFileSync(BOTS_FILE, 'utf8');
      const saved = JSON.parse(data);
      console.log(`📂 Loaded ${Object.keys(saved).length} bots from file`);
      return saved;
    }
  } catch (err) {
    console.error('❌ Failed to load bots:', err.message);
  }
  return {};
}

function saveBotToFile(botId, botData) {
  try {
    const allBots = loadBotsFromFile();
    allBots[botId] = {
      id: botData.id,
      character: botData.character,
      name: botData.name || botData.id,
      createdAt: botData.createdAt,
      lastPosition: { x: botData.x, y: botData.y },
      lastSeen: Date.now(),
      taskStatus: botData.taskStatus || { status: 'idle', lastUpdate: Date.now() }
    };
    fs.writeFileSync(BOTS_FILE, JSON.stringify(allBots, null, 2));
    console.log(`💾 Saved bot ${botId} to file`);
  } catch (err) {
    console.error('❌ Failed to save bot:', err.message);
  }
}

function assignRandomCharacter() {
  return AVAILABLE_CHARACTERS[Math.floor(Math.random() * AVAILABLE_CHARACTERS.length)];
}

function createBot(clawId, customName) {
  const savedBots = loadBotsFromFile();

  // Check if bot already exists
  if (savedBots[clawId]) {
    const saved = savedBots[clawId];
    return {
      id: clawId,
      type: 'remote',
      character: saved.character,
      name: saved.name || customName || clawId,
      x: saved.lastPosition.x,
      y: saved.lastPosition.y,
      target: 'spawn',
      state: 'working',
      boundBy: clawId,
      speech: null,
      manual: true,
      _moveDir: null,
      _autoMove: false,
      createdAt: saved.createdAt,
      taskStatus: saved.taskStatus || { status: 'idle', lastUpdate: Date.now() },
      isNew: false
    };
  }

  // Create new bot
  const character = assignRandomCharacter();
  const bot = {
    id: clawId,
    type: 'remote',
    character,
    name: customName || clawId,
    x: SPAWN_POSITION.x,
    y: SPAWN_POSITION.y,
    target: 'spawn',
    state: 'working',
    boundBy: clawId,
    speech: null,
    manual: true,
    _moveDir: null,
    _autoMove: false,
    createdAt: Date.now(),
    taskStatus: { status: 'idle', lastUpdate: Date.now() },
    isNew: true
  };

  saveBotToFile(clawId, bot);
  return bot;
}

function getAllBots() {
  const allBots = [...localBots];

  // Add all active remote bots
  remoteBots.forEach(bot => {
    allBots.push(bot);
  });

  return allBots;
}

function getBotById(botId) {
  // Check local bots
  const local = localBots.find(b => b.id === botId);
  if (local) return local;

  // Check remote bots
  return remoteBots.get(botId);
}

// ==================== HTTP Server + API ====================

const app = express();
app.use(cors());
app.use(express.json());

// Middleware: Verify API Key
function verifyApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized: Invalid API key' });
  }
  next();
}

// Generate JWT token for WebSocket connection
app.post('/api/auth/token', verifyApiKey, (req, res) => {
  const token = jwt.sign(
    {
      client: 'openclaw',
      iat: Date.now()
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({ token, wsUrl: `ws://localhost:${WS_PORT}` });
});

// List all bots
app.get('/api/bots', verifyApiKey, (req, res) => {
  const allBots = getAllBots();
  res.json({
    bots: allBots.map(b => ({
      id: b.id,
      type: b.type,
      name: b.name || CHARACTERS[b.character]?.name || b.id,
      character: b.character,
      state: b.state,
      boundBy: b.boundBy,
      position: { x: Math.round(b.x), y: Math.round(b.y) }
    }))
  });
});

// Bind to a bot (creates if doesn't exist)
app.post('/api/bots/:id/bind', verifyApiKey, (req, res) => {
  const clawId = req.params.id;
  const customName = req.body.name;

  // Cannot bind to local bot
  if (localBots.find(b => b.id === clawId)) {
    return res.status(403).json({ error: 'Cannot bind to local bot' });
  }

  // Create or load bot
  const bot = createBot(clawId, customName);
  remoteBots.set(clawId, bot);

  console.log(`🎮 Bot ${bot.isNew ? 'created' : 'loaded'}: ${clawId} (${bot.character})`);

  // Broadcast to clients
  broadcastToClients({
    type: bot.isNew ? 'bot_created' : 'bot_bound',
    bot: {
      id: bot.id,
      type: bot.type,
      character: bot.character,
      name: bot.name,
      x: bot.x,
      y: bot.y,
      target: bot.target,
      state: bot.state,
      boundBy: bot.boundBy
    }
  });

  res.json({
    ok: true,
    created: bot.isNew,
    bot: {
      id: bot.id,
      name: bot.name,
      character: bot.character,
      position: { x: bot.x, y: bot.y }
    }
  });
});

// Unbind from a bot
app.post('/api/bots/:id/unbind', verifyApiKey, (req, res) => {
  const botId = req.params.id;
  const bot = getBotById(botId);

  if (!bot) {
    return res.status(404).json({ error: 'Bot not found' });
  }

  // Cannot unbind local bot
  if (bot.type === 'local') {
    return res.status(403).json({ error: 'Cannot unbind local bot' });
  }

  // Save position before removing
  saveBotToFile(botId, bot);

  // Remove from active bots
  remoteBots.delete(botId);

  broadcastToClients({ type: 'bot_removed', bot: { id: bot.id } });

  res.json({ ok: true });
});

// Move bot
app.post('/api/bots/:id/move', verifyApiKey, (req, res) => {
  const bot = getBotById(req.params.id);
  if (!bot) {
    return res.status(404).json({ error: 'Bot not found' });
  }

  if (!bot.boundBy) {
    return res.status(403).json({ error: 'Bot not bound' });
  }

  const direction = req.body.direction;
  if (!['up', 'down', 'left', 'right', 'stop'].includes(direction)) {
    return res.status(400).json({ error: 'Invalid direction' });
  }

  bot._moveDir = direction;

  broadcastToClients({
    type: 'bot_move',
    bot: { id: bot.id, direction }
  });

  res.json({ ok: true, direction });
});

// Goto location (A* pathfinding)
app.post('/api/bots/:id/goto', verifyApiKey, (req, res) => {
  const bot = getBotById(req.params.id);
  if (!bot) {
    return res.status(404).json({ error: 'Bot not found' });
  }

  if (!bot.boundBy) {
    return res.status(403).json({ error: 'Bot not bound' });
  }

  const { location, x, y } = req.body;
  let targetX, targetY;

  // Support both location name and direct coordinates
  if (location) {
    const loc = LOCATIONS[location];
    if (!loc) {
      return res.status(400).json({
        error: 'Invalid location',
        available: Object.keys(LOCATIONS)
      });
    }
    targetX = loc.x;
    targetY = loc.y;
  } else if (x !== undefined && y !== undefined) {
    targetX = x;
    targetY = y;
  } else {
    return res.status(400).json({
      error: 'Must provide either location or (x, y) coordinates'
    });
  }

  // Calculate path
  const path = findPath(bot.x, bot.y, targetX, targetY);

  if (!path) {
    return res.status(400).json({
      error: 'No path found',
      from: { x: Math.floor(bot.x), y: Math.floor(bot.y) },
      to: { x: targetX, y: targetY }
    });
  }

  // Set bot to auto-move mode with path
  bot._autoMove = true;
  bot._path = path;
  bot._pathIndex = 0;
  bot.target = location || 'custom';

  console.log(`🗺️  Pathfinding: ${bot.id} -> ${location || `(${targetX},${targetY})`}, path length: ${path.length}`);

  // Broadcast path to clients
  broadcastToClients({
    type: 'bot_goto',
    bot: {
      id: bot.id,
      path,
      target: location || 'custom'
    }
  });

  res.json({
    ok: true,
    path,
    pathLength: path.length,
    target: { x: targetX, y: targetY }
  });
});

// Set bot state
app.post('/api/bots/:id/state', verifyApiKey, (req, res) => {
  const bot = getBotById(req.params.id);
  if (!bot) {
    return res.status(404).json({ error: 'Bot not found' });
  }

  const state = req.body.state;
  if (!['working', 'coffee', 'offline'].includes(state)) {
    return res.status(400).json({ error: 'Invalid state' });
  }

  bot.state = state;

  broadcastToClients({
    type: 'bot_state',
    bot: { id: bot.id, state }
  });

  res.json({ ok: true, state });
});

// Make bot say something
app.post('/api/bots/:id/say', verifyApiKey, (req, res) => {
  const bot = getBotById(req.params.id);
  if (!bot) {
    return res.status(404).json({ error: 'Bot not found' });
  }

  const message = req.body.message;
  const duration = req.body.duration || 5000;

  if (!message) {
    return res.status(400).json({ error: 'Message required' });
  }

  bot.speech = { text: message, until: Date.now() + duration };

  broadcastToClients({
    type: 'bot_say',
    bot: { id: bot.id, message, duration }
  });

  res.json({ ok: true, message });
});

// Get bot status
app.get('/api/bots/:id', verifyApiKey, (req, res) => {
  const bot = getBotById(req.params.id);
  if (!bot) {
    return res.status(404).json({ error: 'Bot not found' });
  }

  res.json({
    id: bot.id,
    type: bot.type,
    name: bot.name || CHARACTERS[bot.character]?.name,
    character: bot.character,
    state: bot.state,
    boundBy: bot.boundBy,
    position: { x: Math.round(bot.x), y: Math.round(bot.y) },
    speech: bot.speech
  });
});

// ==================== Map API ====================

// Get map information
app.get('/api/map/info', verifyApiKey, (req, res) => {
  res.json(MAP_INFO);
});

// Get all locations
app.get('/api/map/locations', verifyApiKey, (req, res) => {
  res.json({ locations: LOCATIONS });
});

// Get a random walkable point
app.get('/api/map/random-point', verifyApiKey, (req, res) => {
  if (!mapCollisions) {
    return res.status(503).json({ error: 'Map data not loaded' });
  }

  // Try 100 times to find a walkable spot
  for (let i = 0; i < 100; i++) {
    const x = Math.floor(Math.random() * mapCollisions.width);
    const y = Math.floor(Math.random() * mapCollisions.height);

    if (isWalkable(x, y)) {
      return res.json({ x, y });
    }
  }

  res.status(500).json({ error: 'Failed to find random point' });
});

// ==================== Task Status API ====================

// Set bot task status
app.post('/api/bots/:id/task-status', verifyApiKey, (req, res) => {
  const bot = getBotById(req.params.id);
  if (!bot) {
    return res.status(404).json({ error: 'Bot not found' });
  }

  const { status, description } = req.body;

  if (!['idle', 'working'].includes(status)) {
    return res.status(400).json({
      error: 'Invalid status',
      allowed: ['idle', 'working']
    });
  }

  bot.taskStatus = {
    status,
    description: description || '',
    lastUpdate: Date.now()
  };

  // Save to file
  saveBotToFile(bot.id, bot);

  console.log(`📋 Task status updated: ${bot.id} -> ${status}${description ? ` (${description})` : ''}`);

  // Broadcast to clients
  broadcastToClients({
    type: 'bot_task_status',
    bot: {
      id: bot.id,
      taskStatus: bot.taskStatus
    }
  });

  res.json({
    ok: true,
    taskStatus: bot.taskStatus
  });
});

// Get bot task status
app.get('/api/bots/:id/task-status', verifyApiKey, (req, res) => {
  const bot = getBotById(req.params.id);
  if (!bot) {
    return res.status(404).json({ error: 'Bot not found' });
  }

  res.json({
    taskStatus: bot.taskStatus || { status: 'idle', lastUpdate: Date.now() }
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    clients: wsClients.size,
    timestamp: Date.now()
  });
});

// Serve index.html with embedded token (no API key needed)
app.get('/', (req, res) => {
  const viewerToken = jwt.sign(
    { client: 'viewer', iat: Date.now() },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <title>Office Viewer (Realtime)</title>
    <style>
        body { margin: 0; background: #202020; overflow: hidden; display: flex; align-items: center; justify-content: center; height: 100vh; }
        canvas { image-rendering: pixelated; box-shadow: 0 0 20px black; }
        #loading { color: white; font-family: sans-serif; position: absolute; top: 20px; left: 20px; }
    </style>
</head>
<body>
    <div id="loading">Loading Map...</div>
    <canvas id="mapCanvas"></canvas>
    <script>
      // Inject config securely from server
      window.OFFICE_WS_URL = 'ws://localhost:${WS_PORT}';
      window.OFFICE_JWT_TOKEN = '${viewerToken}';
    </script>
    <script src="/viewer.js"></script>
    <script src="/ws-client.js"></script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// Serve static files AFTER dynamic routes (viewer.js, ws-client.js, etc.)
app.use(express.static('public'));
app.use(express.static('.'));

const httpServer = http.createServer(app);

// ==================== WebSocket Server ====================

const wss = new WebSocketServer({ port: WS_PORT, host: '0.0.0.0' });
const wsClients = new Set();

// Verify JWT token
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

// Broadcast to all connected clients
function broadcastToClients(message) {
  const payload = JSON.stringify(message);
  wsClients.forEach(client => {
    if (client.readyState === 1) { // OPEN
      client.send(payload);
    }
  });
}

wss.on('connection', (ws, req) => {
  console.log('📡 New WebSocket connection');

  let authenticated = false;

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());

      // Handle authentication
      if (message.type === 'auth') {
        const decoded = verifyToken(message.token);
        if (decoded) {
          authenticated = true;
          wsClients.add(ws);
          const allBots = getAllBots();
          ws.send(JSON.stringify({
            type: 'auth_success',
            bots: allBots.map(b => ({
              id: b.id,
              type: b.type,
              character: b.character,
              name: b.name || CHARACTERS[b.character]?.name,
              x: b.x,
              y: b.y,
              target: b.target,
              state: b.state,
              boundBy: b.boundBy,
              speech: b.speech
            }))
          }));
          console.log('✅ Client authenticated');
        } else {
          ws.send(JSON.stringify({ type: 'auth_failed', error: 'Invalid token' }));
          ws.close();
        }
        return;
      }

      // Require authentication for other messages
      if (!authenticated) {
        ws.send(JSON.stringify({ type: 'error', error: 'Not authenticated' }));
        return;
      }

      // Handle bot updates from viewer (position sync)
      if (message.type === 'bot_update') {
        const bot = getBotById(message.bot.id);
        if (bot) {
          bot.x = message.bot.x;
          bot.y = message.bot.y;
          // Broadcast to other clients
          broadcastToClients({ type: 'bot_position', bot: { id: bot.id, x: bot.x, y: bot.y } });
        }
      }

    } catch (err) {
      console.error('❌ WebSocket message error:', err);
    }
  });

  ws.on('close', () => {
    wsClients.delete(ws);
    console.log('📡 Client disconnected. Active clients:', wsClients.size);
  });

  ws.on('error', (err) => {
    console.error('❌ WebSocket error:', err);
  });
});

// ==================== Start Servers ====================

// Load map data on startup
loadMapData();

httpServer.listen(PORT, '0.0.0.0', () => {
  const networkInterfaces = os.networkInterfaces();
  let localIP = 'localhost';

  // Find local network IP
  for (const name of Object.keys(networkInterfaces)) {
    for (const net of networkInterfaces[name]) {
      // Skip internal and non-IPv4 addresses
      if (net.family === 'IPv4' && !net.internal) {
        localIP = net.address;
        break;
      }
    }
  }

  console.log(`🚀 HTTP API Server running on:`);
  console.log(`   - Local:   http://localhost:${PORT}`);
  console.log(`   - Network: http://${localIP}:${PORT}`);
  console.log(`📡 WebSocket Server running on:`);
  console.log(`   - Local:   ws://localhost:${WS_PORT}`);
  console.log(`   - Network: ws://${localIP}:${WS_PORT}`);
  console.log(`\n📋 Quick Start:\n`);
  console.log(`1. Get JWT token:`);
  console.log(`   curl -X POST http://${localIP}:${PORT}/api/auth/token -H "x-api-key: ${API_KEY}"\n`);
  console.log(`2. List bots:`);
  console.log(`   curl http://${localIP}:${PORT}/api/bots -H "x-api-key: ${API_KEY}"\n`);
  console.log(`3. OpenClaw 配置 (在 OpenClaw 所在机器上设置):`);
  console.log(`   export OFFICE_API_BASE=http://${localIP}:${PORT}`);
  console.log(`   export OFFICE_API_KEY=${API_KEY}\n`);
  console.log(`4. 浏览器访问: http://${localIP}:${PORT}\n`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  wss.close(() => {
    httpServer.close(() => {
      console.log('✅ Servers closed');
      process.exit(0);
    });
  });
});
