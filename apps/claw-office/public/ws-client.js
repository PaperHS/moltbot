/**
 * WorkAdventure Office Bot - WebSocket Client
 *
 * This script runs in the browser and connects to the WebSocket server
 * to receive real-time bot control commands from OpenClaw.
 */

(function() {
  'use strict';

  const WS_URL = window.OFFICE_WS_URL || 'ws://localhost:3002';
  const JWT_TOKEN = window.OFFICE_JWT_TOKEN; // Injected by server, no API key needed

  let ws = null;
  let reconnectTimer = null;
  let isAuthenticated = false;

  console.log('🤖 Office Bot WebSocket Client loading...');

  // Connect to WebSocket server
  async function connect() {
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
      return;
    }

    console.log('📡 Connecting to WebSocket server...');

    try {
      ws = new WebSocket(WS_URL);

      ws.onopen = async () => {
        console.log('✅ WebSocket connected');

        // Authenticate with server-provided token
        if (JWT_TOKEN) {
          ws.send(JSON.stringify({ type: 'auth', token: JWT_TOKEN }));
        } else {
          console.error('❌ No JWT token provided by server');
          ws.close();
        }
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleMessage(message);
        } catch (err) {
          console.error('❌ Failed to parse message:', err);
        }
      };

      ws.onerror = (err) => {
        console.error('❌ WebSocket error:', err);
      };

      ws.onclose = () => {
        console.log('📡 WebSocket disconnected');
        isAuthenticated = false;

        // Reconnect after 5 seconds
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connect, 5000);
      };

    } catch (err) {
      console.error('❌ Failed to create WebSocket:', err);

      // Retry after 5 seconds
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, 5000);
    }
  }

  // Handle incoming messages
  function handleMessage(message) {
    console.log('📨 Received:', message.type);

    switch (message.type) {
      case 'auth_success':
        isAuthenticated = true;
        console.log('✅ Authenticated');
        // Initialize bots from server state
        if (message.bots && window.clawControl) {
          message.bots.forEach(serverBot => {
            if (serverBot.type === 'remote') {
              // Remote bots: add dynamically
              window.clawControl._addBot?.(serverBot);
            } else {
              // Local bots: update state
              const localBot = window.clawControl._getBotById?.(serverBot.id);
              if (localBot) {
                localBot.x = serverBot.x;
                localBot.y = serverBot.y;
                localBot.state = serverBot.state;
                localBot.boundBy = serverBot.boundBy;
                localBot.speech = serverBot.speech;
              }
            }
          });
        }
        break;

      case 'auth_failed':
        console.error('❌ Authentication failed:', message.error);
        ws.close();
        break;

      case 'bot_created':
      case 'bot_bound':
        if (window.clawControl) {
          window.clawControl._addBot?.(message.bot);
        }
        break;

      case 'bot_removed':
        if (window.clawControl) {
          window.clawControl._removeBot?.(message.bot.id);
        }
        break;

      case 'system_announcement':
        if (window.WA) {
            // Display as a bubble or notification via WorkAdventure API
            window.WA.ui.displayBubble(); // This is just a guess, we need proper API call
            // Since this runs in the map script context ideally, but here we are in a script loaded by index.html?
            // Actually this file is loaded by the map script OR index.html.
            // Let's assume we can use WA.chat.sendChatMessage if available, or console.
            console.log(`📢 SYSTEM: ${message.message}`);

            // If we are in the iframe, we might have access to WA
            if (window.WA && window.WA.chat) {
                window.WA.chat.sendChatMessage(`📢 ${message.message}`, 'System');
            }

            // Also show a popup if available
            if (window.WA && window.WA.ui && window.WA.ui.displayBubble) {
               // window.WA.ui.displayBubble();
            }

            // Fallback: visual indication on all bots?
            // Or just alert if dev mode
            // alert(`📢 ${message.message}`);

            // Better: use the existing 'speech' mechanism on a "System" bot if it existed,
            // or just broadcast to all local bots to say it? No that's weird.

            // Let's inject a toast into the DOM since this is a custom frontend
            const toast = document.createElement('div');
            toast.style.position = 'fixed';
            toast.style.top = '20px';
            toast.style.left = '50%';
            toast.style.transform = 'translateX(-50%)';
            toast.style.background = 'rgba(0, 0, 0, 0.8)';
            toast.style.color = 'white';
            toast.style.padding = '10px 20px';
            toast.style.borderRadius = '20px';
            toast.style.zIndex = '9999';
            toast.style.fontSize = '16px';
            toast.style.fontWeight = 'bold';
            toast.innerText = `📢 ${message.message}`;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), message.duration || 5000);
        }
        break;

      case 'bot_move':
        if (window.clawControl) {
          const bot = window.clawControl._getBotById?.(message.bot.id);
          if (bot) {
            bot._moveDir = message.bot.direction;
          }
        }
        break;

      case 'bot_state':
        if (window.clawControl) {
          const bot = window.clawControl._getBotById?.(message.bot.id);
          if (bot) {
            bot.state = message.bot.state;
          }
        }
        break;

      case 'bot_say':
        if (window.clawControl) {
          const bot = window.clawControl._getBotById?.(message.bot.id);
          if (bot) {
            bot.speech = {
              text: message.bot.message,
              until: Date.now() + (message.bot.duration || 5000)
            };
          }
        }
        break;

      case 'bot_goto':
        if (window.clawControl) {
          const bot = window.clawControl._getBotById?.(message.bot.id);
          if (bot) {
            bot._autoMove = true;
            bot._path = message.bot.path;
            bot._pathIndex = 0;
            bot.target = message.bot.target;
            console.log(`🎯 Bot ${bot.id} navigating to ${bot.target}, path length: ${message.bot.path.length}`);
          }
        }
        break;

      case 'bot_position':
        // Update bot position from other clients
        if (window.clawControl) {
          const bot = window.clawControl._getBotById?.(message.bot.id);
          if (bot && !bot.manual) {
            bot.x = message.bot.x;
            bot.y = message.bot.y;
          }
        }
        break;

      default:
        console.log('Unknown message type:', message.type);
    }
  }

  // Send bot position updates to server
  function syncBotPositions() {
    if (!isAuthenticated || !ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }

    if (window.clawControl && window.clawControl._getAllBots) {
      const bots = window.clawControl._getAllBots();
      bots.forEach(bot => {
        ws.send(JSON.stringify({
          type: 'bot_update',
          bot: { id: bot.id, x: bot.x, y: bot.y }
        }));
      });
    }
  }

  // Initialize
  connect();

  // Sync positions every 2 seconds
  setInterval(syncBotPositions, 2000);

  console.log('✅ Office Bot WebSocket Client loaded');

  // Expose for debugging
  window.officeBotWS = {
    connect,
    disconnect: () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    },
    status: () => ({
      connected: ws?.readyState === WebSocket.OPEN,
      authenticated: isAuthenticated
    })
  };

})();
