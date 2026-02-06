import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import axios from 'axios';
import type { OpenClawPluginApi, ReplyPayload } from 'openclaw/plugin-sdk';

// Configuration
const OFFICE_API_BASE = process.env.OFFICE_API_BASE || 'http://localhost:3001';
const OFFICE_API_KEY = process.env.OFFICE_API_KEY || 'openclaw-default-key';

// State Management
const STATE_DIR = path.join(os.homedir(), '.openclaw', 'extensions', 'office-bot');
const STATE_FILE = path.join(STATE_DIR, 'state.json');

interface BotState {
    currentBotId: string | null;
}

function loadState(): BotState {
    try {
        if (fs.existsSync(STATE_FILE)) {
            return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        }
    } catch (e) { }
    return { currentBotId: null };
}

function saveState(state: BotState) {
    try {
        if (!fs.existsSync(STATE_DIR)) {
            fs.mkdirSync(STATE_DIR, { recursive: true });
        }
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    } catch (e) {
        console.error('Failed to save state', e);
    }
}

// API Helper
async function apiRequest(method: string, endpoint: string, data?: any) {
    try {
        const url = `${OFFICE_API_BASE}${endpoint}`;
        const response = await axios({
            method,
            url,
            data,
            headers: {
                'x-api-key': OFFICE_API_KEY,
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    } catch (err: any) {
        if (err.response) {
            throw new Error(err.response.data?.error || `HTTP ${err.response.status}`);
        }
        throw new Error(err.message);
    }
}

// Global state for auto-navigation interval
let autoNavigateTimer: NodeJS.Timeout | null = null;
let simulationTimer: NodeJS.Timeout | null = null;

// Personas for office chatter
const PERSONAS: Record<string, string[]> = {
    'pm': [
        "Has anyone seen the updated roadmap?",
        "Let's sync up later.",
        "Is this blocking for the release?",
        "Just a quick heads up...",
        "I need a coffee refuel.",
        "Thinking about the user journey..."
    ],
    'xm': [
        "This color palette is a bit off.",
        "I need more whitespace here.",
        "Can we make it pop more?",
        "Just sketching some ideas.",
        "Checking out Dribbble for inspo.",
        "Does this align with our design system?"
    ],
    'coder': [
        "Compiling...",
        "Who broke the build?",
        "It works on my machine.",
        "Refactoring this legacy code.",
        "Git merge conflict again...",
        "Need to update my dependencies."
    ],
    'alvin': [
        "How's the project coming along?",
        "Great work everyone!",
        "Let's focus on the MVP.",
        "Do we have metrics on this?",
        "I'll be in a meeting.",
        "Remember to update the docs."
    ],
    'default': [
        "Working hard or hardly working?",
        "Nice weather in the metaverse.",
        "Where is the coffee machine?",
        "Just stretching my legs.",
        "Anyone up for a quick break?"
    ]
};

export default function register(api: OpenClawPluginApi) {
    let state = loadState();

    api.registerCommand({
        name: 'office-bot',
        description: 'Control WorkAdventure Office Bots',
        acceptsArgs: true,
        handler: async (ctx): Promise<ReplyPayload> => {
            const args = ctx.args ? ctx.args.split(' ') : [];
            const command = args[0];
            const subArgs = args.slice(1);

            if (!command) {
                return { text: "❌ Usage: /office-bot <command> [args]\nCommands: bind, unbind, status, list, move, goto, say, state, task-status, auto-navigate, simulate" };
            }

            // Helper to get current bot ID
            const requireBot = () => {
                if (!state.currentBotId) {
                    throw new Error("❌ Not bound to any bot. Use: /office-bot bind <bot-id>");
                }
                return state.currentBotId;
            };

            try {
                switch (command) {
                    case 'bind': {
                        const botId = subArgs[0];
                        if (!botId) return { text: "❌ Usage: /office-bot bind <bot-id>\nAvailable: pm, xm, coder, alvin" };

                        const res = await apiRequest('POST', `/api/bots/${botId}/bind`, { name: 'OpenClaw User' });
                        state.currentBotId = botId;
                        saveState(state);
                        return { text: `✅ Bound to **${res.bot.name}** (${res.bot.character})` };
                    }

                    case 'unbind': {
                        const botId = requireBot();
                        await apiRequest('POST', `/api/bots/${botId}/unbind`);
                        state.currentBotId = null;
                        saveState(state);
                        return { text: `👋 Unbound from ${botId}` };
                    }

                    case 'status': {
                        if (state.currentBotId) {
                            const bot = await apiRequest('GET', `/api/bots/${state.currentBotId}`);
                            return { text: `📊 Status of **${bot.name}**:\n` +
                                   `State: ${bot.state}\n` +
                                   `Position: (${bot.position.x}, ${bot.position.y})\n` +
                                   `Bound by: ${bot.boundBy || 'None'}` };
                        } else {
                            return { text: "⚪ Not bound to any bot." };
                        }
                    }

                    case 'list': {
                        const res = await apiRequest('GET', '/api/bots');
                        let output = "📋 **Available Bots**\n\n";
                        res.bots.forEach((bot: any) => {
                            const status = bot.boundBy ? `🔒 Bound by ${bot.boundBy}` : '🔓 Available';
                            output += `**${bot.id}** (${bot.name})\n`;
                            output += `  State: ${bot.state} | Pos: (${bot.position.x}, ${bot.position.y}) | ${status}\n`;
                        });
                        return { text: output };
                    }

                    case 'move': {
                        const botId = requireBot();
                        const direction = subArgs[0];
                        const validDirections = ['up', 'down', 'left', 'right', 'stop'];
                        if (!validDirections.includes(direction)) {
                            return { text: `❌ Invalid direction. Use: ${validDirections.join(', ')}` };
                        }

                        await apiRequest('POST', `/api/bots/${botId}/move`, { direction });
                        const arrows: Record<string, string> = { up: '⬆️', down: '⬇️', left: '⬅️', right: '➡️', stop: '⏸️' };
                        return { text: `${arrows[direction]} Moving ${direction}` };
                    }

                    case 'goto': {
                        const botId = requireBot();
                        const location = subArgs[0];
                        if (!location) return { text: "❌ Usage: /office-bot goto <location>" };

                        const res = await apiRequest('POST', `/api/bots/${botId}/goto`, { location });
                        return { text: `🎯 **Navigating to ${location}**\nPath length: ${res.pathLength} tiles` };
                    }

                    case 'say': {
                        const botId = requireBot();
                        const message = subArgs.join(' ');
                        if (!message) return { text: "❌ Usage: /office-bot say <message>" };

                        await apiRequest('POST', `/api/bots/${botId}/say`, { message });
                        return { text: `💬 **${botId}**: ${message}` };
                    }

                    case 'state': {
                        const botId = requireBot();
                        const newState = subArgs[0];
                        const validStates = ['working', 'coffee', 'offline'];
                        if (!validStates.includes(newState)) {
                            return { text: `❌ Invalid state. Use: ${validStates.join(', ')}` };
                        }

                        await apiRequest('POST', `/api/bots/${botId}/state`, { state: newState });
                        const icons: Record<string, string> = { working: '💼', coffee: '☕', offline: '🌙' };
                        return { text: `${icons[newState]} **${botId}** is now ${newState}` };
                    }

                    case 'task-status': {
                        const botId = requireBot();
                        const status = subArgs[0];
                        const description = subArgs.slice(1).join(' ');

                        if (!['idle', 'working'].includes(status)) {
                            return { text: "❌ Usage: /office-bot task-status <idle|working> [description]" };
                        }

                        await apiRequest('POST', `/api/bots/${botId}/task-status`, { status, description });
                        const icons: Record<string, string> = { idle: '☕', working: '💼' };
                        return { text: `${icons[status]} **Task status updated**` };
                    }

                    case 'auto-navigate': {
                        const botId = requireBot();
                        const action = subArgs[0]; // start or stop

                        if (action === 'stop') {
                            if (autoNavigateTimer) {
                                clearInterval(autoNavigateTimer);
                                autoNavigateTimer = null;
                                return { text: "🛑 Auto-navigate stopped" };
                            }
                            return { text: "⚠️ Auto-navigate is not running" };
                        }

                        const interval = parseInt(subArgs[1]) || 30;
                        if (interval < 5) return { text: "❌ Interval must be >= 5 seconds" };

                        if (autoNavigateTimer) clearInterval(autoNavigateTimer);
                        // Also stop simulation if running
                        if (simulationTimer) {
                            clearInterval(simulationTimer);
                            simulationTimer = null;
                        }

                        let lastStatus: string | null = null;
                        let lastLocation: string | null = null;

                        const checkAndNavigate = async () => {
                            try {
                                // Get task status
                                const statusRes = await apiRequest('GET', `/api/bots/${botId}/task-status`);
                                const currentStatus = statusRes.taskStatus.status;

                                let targetLocation: string | undefined;
                                if (currentStatus === 'idle') targetLocation = 'pantry';
                                else if (currentStatus === 'working') targetLocation = `desk_${botId}`;

                                if (targetLocation && (currentStatus !== lastStatus || targetLocation !== lastLocation)) {
                                    await apiRequest('POST', `/api/bots/${botId}/goto`, { location: targetLocation });
                                    lastStatus = currentStatus;
                                    lastLocation = targetLocation;
                                }
                            } catch (e) {
                                console.error("Auto-navigate error:", e);
                            }
                        };

                        await checkAndNavigate();
                        autoNavigateTimer = setInterval(checkAndNavigate, interval * 1000);

                        return { text: `🤖 **Auto-navigate started** (Interval: ${interval}s)\nLogic: idle → pantry, working → desk_${botId}` };
                    }

                    case 'simulate': {
                        const botId = requireBot();
                        const action = subArgs[0];

                        if (action === 'stop') {
                            if (simulationTimer) {
                                clearInterval(simulationTimer);
                                simulationTimer = null;
                                return { text: "🛑 Simulation stopped" };
                            }
                            return { text: "⚠️ Simulation is not running" };
                        }

                        // Stop simple auto-navigate if running
                        if (autoNavigateTimer) {
                            clearInterval(autoNavigateTimer);
                            autoNavigateTimer = null;
                        }

                        if (simulationTimer) clearInterval(simulationTimer);

                        console.log(`🧠 Starting Life Simulation for ${botId}...`);

                        // Simulation Loop (runs every 10s)
                        const runSimulation = async () => {
                            try {
                                // 1. Get current state and surroundings
                                const bot = await apiRequest('GET', `/api/bots/${botId}`);
                                const allBotsRes = await apiRequest('GET', '/api/bots');
                                const allBots = allBotsRes.bots;

                                // 2. Check Task Status - if working, strictly go to desk
                                const taskStatusRes = await apiRequest('GET', `/api/bots/${botId}/task-status`);
                                const isWorking = taskStatusRes.taskStatus.status === 'working';

                                if (isWorking) {
                                    // Logic: If working, stay at desk
                                    const targetDesk = `desk_${botId}`;
                                    // Only move if not already there (simple check, ideally check coords)
                                    // For now, we rely on the server to ignore redundant gotos or we just send it occasionally
                                    // Let's just randomly reinforce it or check if we are far?
                                    // Simplified: Just ensure we are heading to desk if we wandered off
                                    if (bot.target !== targetDesk && Math.random() > 0.7) {
                                         await apiRequest('POST', `/api/bots/${botId}/goto`, { location: targetDesk });
                                    }
                                    return;
                                }

                                // 3. Life Logic (Idle Mode)
                                // Actions: Wander, Chat, Rest (Pantry)

                                const roll = Math.random();

                                // A. Socialize (High priority if near others)
                                const nearbyBots = allBots.filter((b: any) =>
                                    b.id !== botId &&
                                    Math.abs(b.position.x - bot.position.x) < 3 &&
                                    Math.abs(b.position.y - bot.position.y) < 3
                                );

                                if (nearbyBots.length > 0 && Math.random() > 0.6) {
                                    // Say something!
                                    const personaKey = Object.keys(PERSONAS).find(k => botId.includes(k)) || 'default';
                                    const lines = PERSONAS[personaKey] || PERSONAS['default'];
                                    const message = lines[Math.floor(Math.random() * lines.length)];

                                    await apiRequest('POST', `/api/bots/${botId}/say`, { message, duration: 3000 });
                                    return;
                                }

                                // B. Wander / Change Location
                                if (roll < 0.3) {
                                    // Go to Pantry
                                    await apiRequest('POST', `/api/bots/${botId}/goto`, { location: 'pantry' });
                                } else if (roll < 0.6) {
                                    // Random Walk
                                    const point = await apiRequest('GET', '/api/map/random-point');
                                    await apiRequest('POST', `/api/bots/${botId}/goto`, { x: point.x, y: point.y });
                                } else {
                                    // Stay / Do nothing
                                }

                            } catch (e) {
                                console.error("Simulation error:", e);
                            }
                        };

                        await runSimulation();
                        simulationTimer = setInterval(runSimulation, 10000); // Check every 10s

                        return { text: `🧬 **Life Simulation Started**\nBot will wander, chat, and work naturally.` };
                    }

                    default:
                        return { text: `❌ Unknown command: ${command}\n\nUse '/office-bot' without arguments to see all commands` };
                }
            } catch (err: any) {
                return { text: `❌ ${err.message}` };
            }
        }
    });
}
