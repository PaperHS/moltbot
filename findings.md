# Findings & Research

## Codebase Structure

### Office-Bot System (wa-office项目)
- **WebSocket Server**: `/Users/alvin/workspace/wa-office/server/ws-server.js`
  - HTTP API端口: 3001
  - WebSocket端口: 3002
  - 管理bot状态、WebSocket广播

- **Viewer前端**: `/Users/alvin/workspace/wa-office/viewer.js`
  - 地图渲染、bot移动逻辑
  - 碰撞检测、寻路逻辑

- **地图文件**: `/Users/alvin/workspace/wa-office/office.tmj`
  - Tiled JSON格式
  - 31x21 tiles (每tile 32px)
  - layers: start, collisions, floor等

### OpenClaw Skill (clawdbot项目)
- **Skill脚本**: `/Volumes/extStorage/workspace/llm/clawdbot/skills/office-bot/index.js`
  - 通过HTTP API控制bot
  - 命令: bind, unbind, move, say, state, status

## Technical Discoveries

### 地图结构
- **LOCATIONS常量** (viewer.js:14-21):
  ```javascript
  {
    desk_pm: { x: 4, y: 5 },
    desk_xm: { x: 6, y: 5 },
    desk_coder: { x: 4, y: 8 },
    desk_alvin: { x: 6, y: 8 },
    pantry: { x: 25, y: 5 },  // 茶水间
    spawn: { x: 15, y: 19 }    // 出生点
  }
  ```

- **碰撞检测** (viewer.js:282-289):
  - 从`collisions` layer读取障碍物
  - tile值 ≠ 0 表示不可通行

### Bot状态机
- **状态类型**: working, coffee, offline
- **移动模式**:
  1. `_moveDir`: 手动方向控制 (up/down/left/right)
  2. `_autoMove`: 自动寻路到target位置
  3. AI随机行为 (仅unbound bots)

### WebSocket通信协议
- **bot_created/bot_bound**: 新bot创建或绑定
- **bot_move**: 移动指令
- **bot_state**: 状态变更
- **bot_say**: 发言
- **bot_position**: 位置同步

## External Dependencies

### wa-office项目
- ws (WebSocket server)
- express (HTTP API)
- jsonwebtoken (认证)
- cors

### clawdbot项目
- Node.js原生http模块

## Patterns & Conventions

### 坐标系统
- 原点(0,0)在左上角
- X轴向右，Y轴向下
- 单位: tile (32px = 1 tile)

### Bot命名规范
- 本地bot: `alvin-local`
- 远程bot: 使用clawId (如`pm`, `xm`, `coder`)

## Known Issues

1. ✅ **已修复**: viewer更新bot时缺少target字段
2. ✅ **已修复**: ws-server广播缺少target字段
3. ✅ **已解决**: A*寻路算法已实现

## Plugin Architecture (Phase 5)

### Office Navigation Plugin

**Location**: `.openclaw/plugins/office-navigation/`

**Structure**:
```
office-navigation/
├── package.json    # Plugin metadata
├── index.js        # Hook registration and handlers
└── README.md       # Documentation
```

**Hook Registration**:
```javascript
// Uses OpenClaw Plugin API
export default function register(api) {
  api.registerHook('message_received', handler, { register: true });
  api.registerHook('message_sent', handler, { register: true });
}
```

**Integration Flow**:
```
OpenClaw Gateway
  ↓ loads plugin from .openclaw/plugins/
OpenClaw Plugin API
  ↓ api.registerHook(event, handler)
Global Hook Runner
  ↓ runMessageReceived() / runMessageSent()
Plugin Handler
  ↓ execAsync(`office-bot task-status`)
Office Bot Skill
  ↓ HTTP API call
WebSocket Server
  ↓ updates bot.taskStatus
Auto-Navigate
  ↓ detects status change
Bot Movement
```

**Environment Variables**:
- `OFFICE_BOT_ID`: Bot to control (pm, xm, coder, alvin)
- `OFFICE_API_BASE`: WebSocket server URL
- `OFFICE_API_KEY`: API authentication key
- `OFFICE_BOT_SKILL`: (Optional) Skill command path

## Resources

- Tiled Map Editor: https://www.mapeditor.org/
- A* pathfinding算法参考
- WebSocket协议文档
- OpenClaw Plugin API: https://docs.openclaw.ai/plugin
- OpenClaw Hooks: https://docs.openclaw.ai/hooks

