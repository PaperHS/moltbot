// --- 1. CONFIGURATION ---
const BOT_SPEED = 0.08; 
const TILE_SIZE = 32;
// Note: We will auto-detect frame width based on image size
// Assuming standard 4-frame strips or single frame

const CHARACTERS = {
    pm: { src: 'characters/PM_OldLiu.png', name: '\u8001\u5218 (PM)' },
    xm: { src: 'characters/Designer_XiaoMei.png', name: '\u5c0f\u7f8e (Design)' },
    coder: { src: 'characters/Coder_OldYe.png', name: '\u8001\u53f6 (Dev)' },
    alvin: { src: 'characters/Alvin.png', name: 'Alvin (Boss)' }
};

const LOCATIONS = {
    desk_pm: { x: 10, y: 4 },
    desk_xm: { x: 10, y: 6 },
    desk_coder: { x: 13, y: 4 },
    desk_alvin: { x: 6, y: 8 },
    pantry: { x: 25, y: 5 },
    spawn: { x: 13, y: 19 }
};

// Helper function to assign color based on character
function getColorForCharacter(character) {
    const colorMap = {
        pm: '#ef4444',
        xm: '#ec4899',
        coder: '#22c55e',
        alvin: '#5865f2'
    };
    return colorMap[character] || '#888888'; // default gray
}

// --- Bot State (populated dynamically by WebSocket) ---
const bots = [
    // Local bot (keyboard controlled, always present)
    {
        id: 'alvin-local',
        type: 'local',
        character: 'alvin',
        x: 15,
        y: 20,
        target: 'desk_alvin',
        state: 'working',
        color: '#5865f2',
        frame: 0,
        boundBy: null,
        speech: null,
        manual: false,
        _moveDir: null,
        _autoMove: false
    }
    // Remote bots will be added dynamically via WebSocket
];

// --- OpenClaw Control API ---
window.clawControl = {
    // List available bots
    listBots: function() {
        return bots.map(b => ({
            id: b.id,
            type: b.type || 'remote',
            character: b.character,
            name: b.name || CHARACTERS[b.character]?.name || b.id,
            state: b.state,
            boundBy: b.boundBy,
            position: { x: Math.round(b.x), y: Math.round(b.y) }
        }));
    },

    // Bind to a bot (returns bot info or error)
    bindBot: function(botId, clawId) {
        const bot = bots.find(b => b.id === botId);
        if (!bot) return { error: 'Bot not found', available: bots.map(b => b.id) };
        if (bot.boundBy && bot.boundBy !== clawId) {
            return { error: 'Bot already bound', boundBy: bot.boundBy };
        }
        bot.boundBy = clawId || 'anonymous';
        bot.manual = true; // Disable AI control
        return { ok: true, bot: { id: bot.id, name: bot.name || CHARACTERS[bot.character]?.name } };
    },

    // Unbind from a bot
    unbindBot: function(botId) {
        const bot = bots.find(b => b.id === botId);
        if (!bot) return { error: 'Bot not found' };
        bot.boundBy = null;
        bot.manual = false;
        bot._moveDir = null;
        return { ok: true };
    },

    // Move bot in direction (up/down/left/right/stop)
    move: function(botId, direction) {
        const bot = bots.find(b => b.id === botId);
        if (!bot) return { error: 'Bot not found' };
        if (!bot.boundBy) return { error: 'Bot not bound' };
        bot._moveDir = direction; // Will be processed in updateBots
        return { ok: true, direction };
    },

    // Set bot state (working/coffee/offline)
    setState: function(botId, state) {
        const bot = bots.find(b => b.id === botId);
        if (!bot) return { error: 'Bot not found' };
        if (!['working', 'coffee', 'offline'].includes(state)) {
            return { error: 'Invalid state', valid: ['working', 'coffee', 'offline'] };
        }
        bot.state = state;
        return { ok: true, state };
    },

    // Make bot say something
    say: function(botId, message, durationMs = 5000) {
        const bot = bots.find(b => b.id === botId);
        if (!bot) return { error: 'Bot not found' };
        bot.speech = { text: message, until: Date.now() + durationMs };
        return { ok: true, message };
    },

    // Get bot status
    getStatus: function(botId) {
        const bot = bots.find(b => b.id === botId);
        if (!bot) return { error: 'Bot not found' };
        return {
            id: bot.id,
            type: bot.type || 'remote',
            character: bot.character,
            name: bot.name || CHARACTERS[bot.character]?.name,
            state: bot.state,
            boundBy: bot.boundBy,
            position: { x: Math.round(bot.x), y: Math.round(bot.y) },
            speech: bot.speech?.text || null
        };
    },

    // Move bot to specific location
    moveTo: function(botId, locationName) {
        const bot = bots.find(b => b.id === botId);
        if (!bot) return { error: 'Bot not found' };
        if (!LOCATIONS[locationName]) {
            return { error: 'Location not found', available: Object.keys(LOCATIONS) };
        }
        bot.target = locationName;
        bot._autoMove = true;
        return { ok: true, target: locationName };
    },

    // Internal helper methods for WebSocket client
    _getBotById: function(botId) {
        return bots.find(b => b.id === botId);
    },

    _getAllBots: function() {
        return bots;
    },

    // Add new bot dynamically (called by WebSocket client)
    _addBot: function(botData) {
        // Check if bot already exists
        const existing = bots.find(b => b.id === botData.id);
        if (existing) {
            // Update existing bot
            Object.assign(existing, {
                character: botData.character,
                name: botData.name,
                x: botData.x,
                y: botData.y,
                state: botData.state || 'working',
                boundBy: botData.boundBy || null,
                speech: botData.speech || null,
                target: botData.target || existing.target || 'spawn'
            });
            return existing;
        }

        // Add new bot
        const newBot = {
            id: botData.id,
            type: botData.type || 'remote',
            character: botData.character,
            name: botData.name,
            x: botData.x,
            y: botData.y,
            target: 'spawn',
            state: botData.state || 'working',
            color: getColorForCharacter(botData.character),
            frame: 0,
            boundBy: botData.boundBy || null,
            speech: botData.speech || null,
            manual: true,
            _moveDir: null,
            _autoMove: false
        };

        bots.push(newBot);
        console.log('✅ Added bot:', newBot.id, newBot.character);
        return newBot;
    },

    // Remove bot dynamically (called by WebSocket client)
    _removeBot: function(botId) {
        const index = bots.findIndex(b => b.id === botId);
        if (index > -1) {
            const removed = bots.splice(index, 1)[0];
            console.log('✅ Removed bot:', removed.id);
            return true;
        }
        return false;
    }
};

// --- 2. INPUT HANDLING (DEBUG) ---
const keys = {};
window.addEventListener('keydown', e => {
    keys[e.key] = true;

    // Space key: log current position of alvin-local
    if (e.key === ' ') {
        const alvin = bots.find(b => b.id === 'alvin-local');
        if (alvin) {
            console.log(`📍 Alvin position: (${Math.floor(alvin.x)}, ${Math.floor(alvin.y)}) - Exact: (${alvin.x.toFixed(2)}, ${alvin.y.toFixed(2)})`);
        }
        e.preventDefault(); // Prevent page scroll
    }
});
window.addEventListener('keyup', e => keys[e.key] = false);

// --- 3. LOGIC ENGINE ---
function updateBots() {
    const collisionLayer = mapData ? mapData.layers.find(l => l.name === 'collisions' || l.name === 'floorLayer') : null;
    const width = mapData ? mapData.width : 0;

    bots.forEach(bot => {
        let moveX = 0;
        let moveY = 0;

        // Clear expired speech
        if (bot.speech && Date.now() > bot.speech.until) {
            bot.speech = null;
        }

        // OpenClaw remote control via _moveDir
        if (bot.boundBy && bot._moveDir) {
            const speed = 0.15;
            switch(bot._moveDir) {
                case 'up': moveY = -speed; break;
                case 'down': moveY = speed; break;
                case 'left': moveX = -speed; break;
                case 'right': moveX = speed; break;
                case 'stop': bot._moveDir = null; break;
            }
        }
        // OpenClaw auto-move with A* path
        else if (bot.boundBy && bot._autoMove && bot._path) {
            // Follow path points
            if (bot._pathIndex < bot._path.length) {
                const targetPoint = bot._path[bot._pathIndex];
                const dx = targetPoint.x - bot.x;
                const dy = targetPoint.y - bot.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < 0.2) {
                    // Reached waypoint, move to next
                    bot._pathIndex++;
                    if (bot._pathIndex >= bot._path.length) {
                        // Reached destination
                        bot._autoMove = false;
                        bot._path = null;
                        bot._pathIndex = 0;
                        console.log(`✅ Bot ${bot.id} reached destination`);
                    }
                } else {
                    // Move towards waypoint
                    moveX = (dx / distance) * BOT_SPEED;
                    moveY = (dy / distance) * BOT_SPEED;
                }
            } else {
                bot._autoMove = false;
            }
        }
        // Keyboard control (debug)
        else if (bot.id === 'alvin-local' && !bot.boundBy) {
            if (keys['ArrowUp']) moveY = -1;
            if (keys['ArrowDown']) moveY = 1;
            if (keys['ArrowLeft']) moveX = -1;
            if (keys['ArrowRight']) moveX = 1;
            if (moveX !== 0 || moveY !== 0) {
                moveX *= 0.15;
                moveY *= 0.15;
            }
        }
        // AI Logic (only for unbound remote bots, not local bot)
        else if (!bot.boundBy && bot.type !== 'local') {
            if (Math.random() < 0.005) {
                const roll = Math.random();
                if (roll < 0.2) { bot.target = 'spawn'; bot.state = 'offline'; }
                else if (roll < 0.5) { bot.target = 'pantry'; bot.state = 'coffee'; }
                else { bot.target = `desk_${bot.id}`; bot.state = 'working'; }
            }
            const dest = LOCATIONS[bot.target];
            if (!dest) return; // Skip if target location not found
            const dx = dest.x - bot.x;
            const dy = dest.y - bot.y;
            if (Math.abs(dx) > 0.1) moveX = Math.sign(dx) * BOT_SPEED;
            if (Math.abs(dy) > 0.1) moveY = Math.sign(dy) * BOT_SPEED;
        }

        // Collision Check
        if (collisionLayer && collisionLayer.data && (moveX !== 0 || moveY !== 0)) {
            const nextX = Math.floor(bot.x + moveX + 0.5);
            const nextY = Math.floor(bot.y + moveY + 0.8);
            const idx = nextY * width + nextX;
            if (collisionLayer.data[idx] !== 0) {
                moveX = 0; moveY = 0;
            }
        }

        bot.x += moveX;
        bot.y += moveY;

        if (moveX !== 0 || moveY !== 0) bot.frame += 0.2;
        else bot.frame = 0;
    });
}

// --- 4. RENDERING ENGINE ---
const canvas = document.getElementById('mapCanvas');
const ctx = canvas.getContext('2d');
let mapData = null;
let tilesets = [];
let charImages = {};

window.onload = init;

async function init() {
    try {
        const res = await fetch('office.tmj?' + Date.now());
        mapData = await res.json();
        
        for(const ts of mapData.tilesets) {
            if (ts.image) await loadStandardTileset(ts);
            else if (ts.tiles) await loadCollectionTileset(ts);
        }

        for (const [key, data] of Object.entries(CHARACTERS)) {
            const img = new Image();
            img.src = data.src;
            await new Promise(r => { img.onload = r; img.onerror = r; });
            charImages[key] = img;
        }
        
        document.getElementById('loading').style.display = 'none';
        loop();
        window.addEventListener('resize', render);
    } catch(e) {
        document.getElementById('loading').innerText = "Error: " + e;
        console.error(e);
    }
}

function loop() {
    updateBots();
    render();
    requestAnimationFrame(loop);
}

// ... (Tileset loading code) ...
async function loadStandardTileset(ts) {
    const img = new Image();
    let src = ts.image.replace(/^(\.\.\/)+/, '');
    img.src = src;
    await new Promise(r => { img.onload = r; img.onerror = r; });
    tilesets.push({ type: 'standard', ...ts, imgElem: img });
}

async function loadCollectionTileset(ts) {
    const tilesObj = {};
    const promises = [];
    for (const [id, tileData] of Object.entries(ts.tiles)) {
        const img = new Image();
        let src = tileData.image.replace(/^(\.\.\/)+/, '');
        img.src = src;
        promises.push(new Promise(r => { 
            img.onload = () => {
                tilesObj[id] = { img, width: tileData.imagewidth, height: tileData.imageheight };
                r();
            };
            img.onerror = () => r();
        }));
    }
    await Promise.all(promises);
    tilesets.push({ type: 'collection', firstgid: ts.firstgid, tiles: tilesObj });
}

function getTile(gid) {
    for(let i=tilesets.length-1; i>=0; i--) {
        const ts = tilesets[i];
        if(gid >= ts.firstgid) {
            if (ts.type === 'standard') {
                const localId = gid - ts.firstgid;
                if (localId >= ts.tilecount) continue;
                const col = localId % ts.columns;
                const row = Math.floor(localId / ts.columns);
                return { img: ts.imgElem, sx: col * ts.tilewidth, sy: row * ts.tileheight, w: ts.tilewidth, h: ts.tileheight };
            } else {
                const localId = gid - ts.firstgid;
                const t = ts.tiles[localId];
                if (t) return { img: t.img, sx: 0, sy: 0, w: t.width, h: t.height };
            }
        }
    }
    return null;
}

function render() {
    if(!mapData) return;
    
    const scale = Math.min(window.innerWidth / (mapData.width * 32), window.innerHeight / (mapData.height * 32)) * 0.9;
    canvas.width = mapData.width * 32;
    canvas.height = mapData.height * 32;
    canvas.style.width = (canvas.width * scale) + 'px';
    canvas.style.height = (canvas.height * scale) + 'px';
    
    ctx.fillStyle = '#202020';
    ctx.fillRect(0,0,canvas.width, canvas.height);
    
    mapData.layers.forEach(layer => drawLayerRecursive(layer));
    drawBots();
}

function drawLayerRecursive(layer) {
    if (!layer.visible) return;
    if (layer.type === 'group') {
        if(layer.layers) layer.layers.forEach(l => drawLayerRecursive(l));
    } else if (layer.type === 'tilelayer') {
        layer.data.forEach((gid, idx) => {
            if(gid === 0) return;
            const c = idx % mapData.width;
            const r = Math.floor(idx / mapData.width);
            const t = getTile(gid);
            if(t && t.img) {
                ctx.drawImage(t.img, t.sx, t.sy, t.w, t.h, c*32, r*32 - (t.h-32), t.w, t.h);
            }
        });
    }
}

function drawBots() {
    bots.forEach(bot => {
        const img = charImages[bot.character];
        const charData = CHARACTERS[bot.character];
        const screenX = bot.x * 32;
        const screenY = bot.y * 32;

        if (img) {
            // Sprite sheet format: 768x64 = 24 frames of 32x64 each
            const frameW = 32;
            const frameH = 64;
            const totalFrames = Math.floor(img.width / frameW);

            // Frame selection (use first 4 frames for idle animation)
            const frameIndex = Math.floor(bot.frame) % Math.min(4, totalFrames);
            const sx = frameIndex * frameW;

            ctx.drawImage(
                img,
                sx, 0, frameW, frameH,
                screenX, screenY - 32, // Offset up since char is 64 tall
                frameW, frameH
            );
        } else {
            ctx.fillStyle = bot.color;
            ctx.beginPath();
            ctx.arc(screenX + 16, screenY + 16, 10, 0, Math.PI*2);
            ctx.fill();
        }

        // Name Tag
        const name = charData ? charData.name : bot.id;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(screenX - 10, screenY - 45, 52, 12);
        ctx.fillStyle = 'white';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(name, screenX + 16, screenY - 36);

        const status = bot.state === 'working' ? '[W]' : (bot.state === 'coffee' ? '[C]' : '[Z]');
        ctx.fillStyle = bot.state === 'working' ? '#22c55e' : (bot.state === 'coffee' ? '#f59e0b' : '#6b7280');
        ctx.fillText(status, screenX + 16, screenY - 50);

        // Speech bubble
        if (bot.speech && bot.speech.text) {
            const text = bot.speech.text;
            ctx.font = '11px sans-serif';
            const textWidth = Math.min(ctx.measureText(text).width, 120);
            const bubbleW = textWidth + 16;
            const bubbleH = 20;
            const bubbleX = screenX + 16 - bubbleW / 2;
            const bubbleY = screenY - 75;

            // Bubble background
            ctx.fillStyle = 'white';
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(bubbleX, bubbleY, bubbleW, bubbleH, 6);
            ctx.fill();
            ctx.stroke();

            // Bubble tail
            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.moveTo(screenX + 12, bubbleY + bubbleH);
            ctx.lineTo(screenX + 16, bubbleY + bubbleH + 6);
            ctx.lineTo(screenX + 20, bubbleY + bubbleH);
            ctx.fill();

            // Text
            ctx.fillStyle = '#333';
            ctx.textAlign = 'center';
            ctx.fillText(text.length > 18 ? text.slice(0, 16) + '..' : text, screenX + 16, bubbleY + 14);
        }

        // Bound indicator (OpenClaw controlled)
        if (bot.boundBy) {
            ctx.strokeStyle = '#8b5cf6';
            ctx.lineWidth = 2;
            ctx.strokeRect(screenX, screenY - 32, 32, 64);
        }
    });
}
