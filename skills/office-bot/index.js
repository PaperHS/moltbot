#!/usr/bin/env node

/**
 * Office Bot Control Skill - HTTP API Version
 *
 * Connects to WebSocket server to control WorkAdventure bots
 */

const http = require('http');

// Configuration
const API_BASE = process.env.OFFICE_API_BASE || 'http://localhost:3001';
const API_KEY = process.env.OFFICE_API_KEY || 'openclaw-default-key';

// State
let currentBotId = null;

// HTTP Request Helper
function apiRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const options = {
      method,
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(json.error || `HTTP ${res.statusCode}`));
          } else {
            resolve(json);
          }
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

// Command Handlers

async function handleList() {
  try {
    const result = await apiRequest('GET', '/api/bots');

    let output = "📋 **Available Bots**\n\n";
    result.bots.forEach(bot => {
      const status = bot.boundBy ? `🔒 Bound by ${bot.boundBy}` : '🔓 Available';
      output += `**${bot.id}** (${bot.name})\n`;
      output += `  State: ${bot.state}\n`;
      output += `  Position: (${bot.position.x}, ${bot.position.y})\n`;
      output += `  Status: ${status}\n\n`;
    });

    return output;
  } catch (err) {
    return `❌ Error: ${err.message}`;
  }
}

async function handleBind(botId) {
  if (!botId) {
    return "❌ Usage: /office-bot bind <bot-id>\n\nAvailable: pm, xm, coder, alvin";
  }

  try {
    const result = await apiRequest('POST', `/api/bots/${botId}/bind`, { clawId: 'openclaw' });
    currentBotId = botId;
    return `✅ Bound to **${result.bot.name}**`;
  } catch (err) {
    return `❌ ${err.message}`;
  }
}

async function handleUnbind() {
  if (!currentBotId) {
    return "❌ Not bound to any bot";
  }

  try {
    await apiRequest('POST', `/api/bots/${currentBotId}/unbind`);
    const botId = currentBotId;
    currentBotId = null;
    return `👋 Unbound from ${botId}`;
  } catch (err) {
    return `❌ ${err.message}`;
  }
}

async function handleMove(direction) {
  if (!currentBotId) {
    return "❌ Not bound to any bot. Use: /office-bot bind <bot-id>";
  }

  const validDirections = ['up', 'down', 'left', 'right', 'stop'];
  if (!validDirections.includes(direction)) {
    return `❌ Invalid direction. Use: ${validDirections.join(', ')}`;
  }

  try {
    await apiRequest('POST', `/api/bots/${currentBotId}/move`, { direction });
    const arrows = { up: '⬆️', down: '⬇️', left: '⬅️', right: '➡️', stop: '⏸️' };
    return `${arrows[direction]} Moving ${direction}`;
  } catch (err) {
    return `❌ ${err.message}`;
  }
}

async function handleSay(message) {
  if (!currentBotId) {
    return "❌ Not bound to any bot. Use: /office-bot bind <bot-id>";
  }

  if (!message) {
    return "❌ Usage: /office-bot say <message>";
  }

  try {
    await apiRequest('POST', `/api/bots/${currentBotId}/say`, { message });
    return `💬 **${currentBotId}**: ${message}`;
  } catch (err) {
    return `❌ ${err.message}`;
  }
}

async function handleState(state) {
  if (!currentBotId) {
    return "❌ Not bound to any bot. Use: /office-bot bind <bot-id>";
  }

  const validStates = ['working', 'coffee', 'offline'];
  if (!validStates.includes(state)) {
    return `❌ Invalid state. Use: ${validStates.join(', ')}`;
  }

  try {
    await apiRequest('POST', `/api/bots/${currentBotId}/state`, { state });
    const icons = { working: '💼', coffee: '☕', offline: '🌙' };
    return `${icons[state]} **${currentBotId}** is now ${state}`;
  } catch (err) {
    return `❌ ${err.message}`;
  }
}

async function handleStatus() {
  if (!currentBotId) {
    return "❌ Not bound to any bot";
  }

  try {
    const bot = await apiRequest('GET', `/api/bots/${currentBotId}`);
    return `📊 Status of **${bot.name}**:\n\n` +
           `State: ${bot.state}\n` +
           `Position: (${bot.position.x}, ${bot.position.y})\n` +
           `Bound by: ${bot.boundBy || 'None'}`;
  } catch (err) {
    return `❌ ${err.message}`;
  }
}

// Main
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log("❌ Usage: /office-bot <command> [args]\n\nCommands: list, bind, unbind, move, say, state, status");
    process.exit(1);
  }

  let response;

  try {
    switch (command) {
      case 'list':
        response = await handleList();
        break;
      case 'bind':
        response = await handleBind(args[1]);
        break;
      case 'unbind':
        response = await handleUnbind();
        break;
      case 'move':
        response = await handleMove(args[1]);
        break;
      case 'say':
        response = await handleSay(args.slice(1).join(' '));
        break;
      case 'state':
        response = await handleState(args[1]);
        break;
      case 'status':
        response = await handleStatus();
        break;
      default:
        response = `❌ Unknown command: ${command}\n\nAvailable: list, bind, unbind, move, say, state, status`;
    }

    console.log(response);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
}

main();
