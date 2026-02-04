# Task Plan: OpenClaw自主办公室导航

## Overview

让OpenClaw能够理解办公室地图，并根据任务状态自主移动角色：
- **无任务时**: 移动到茶水间(pantry)休息
- **有任务时**: 移动到工作桌(desk)前工作

## Phases

### Phase 1: 地图数据API ✅ [完成研究]
**Status**: In Progress
**Goal**: 提供地图信息和位置查询接口

**Tasks**:
- [x] 研究现有地图结构(office.tmj)
- [x] 分析LOCATIONS常量和碰撞层
- [ ] 在ws-server添加`GET /api/map/info`接口
- [ ] 在ws-server添加`GET /api/map/locations`接口
- [ ] 在office-bot skill添加`info`命令

**API设计**:
```javascript
// GET /api/map/info
{
  width: 31,
  height: 21,
  tileSize: 32,
  layers: ['start', 'collisions', 'floor']
}

// GET /api/map/locations
{
  locations: {
    desk_pm: { x: 4, y: 5, name: "PM工位" },
    pantry: { x: 25, y: 5, name: "茶水间" },
    ...
  }
}
```

### Phase 2: 自主寻路算法
**Status**: Not Started
**Goal**: 实现A*寻路算法，计算从当前位置到目标的路径

**Tasks**:
- [ ] 在ws-server实现A*寻路算法
- [ ] 添加`POST /api/bots/:id/goto`接口
- [ ] 在office-bot skill添加`goto <location>`命令
- [ ] 测试寻路避障功能

**实现要点**:
- 读取collisions layer作为障碍物地图
- A*启发式: 曼哈顿距离
- 返回路径: `[{x,y}, {x,y}, ...]`
- viewer端逐步执行路径点

### Phase 3: OpenClaw任务状态感知
**Status**: Not Started
**Goal**: OpenClaw能判断当前是否有任务在执行

**Tasks**:
- [ ] 在office-bot skill添加`set-task-status <idle|working>`命令
- [ ] 在ws-server添加bot的`taskStatus`字段
- [ ] 添加`GET /api/bots/:id/task-status`接口
- [ ] 持久化任务状态到bots.json

**状态定义**:
```javascript
taskStatus: {
  status: 'idle' | 'working',
  lastUpdate: timestamp,
  description: string  // 可选，任务描述
}
```

### Phase 4: 自主决策引擎
**Status**: Not Started
**Goal**: 根据任务状态自动选择目标位置

**Tasks**:
- [ ] 在office-bot skill添加`auto-navigate`命令
- [ ] 实现决策逻辑: idle→pantry, working→desk
- [ ] 定期轮询任务状态(每30秒)
- [ ] 到达目标后发送通知

**决策流程**:
```
1. 获取当前bot的taskStatus
2. 根据status选择目标:
   - idle → pantry
   - working → desk_{botId}
3. 调用goto API
4. 等待到达
5. 循环检查状态变化
```

### Phase 5: OpenClaw Agent集成
**Status**: Ready to Implement
**Goal**: 实现完整的工作流 - 接收任务→工位工作→完成后休息

**核心工作流**：
```
1. Boss/其他bot通过Telegram/Feishu发送任务 → 当前bot
2. Bot收到消息 → 自动设置status=working → 导航到工位
3. Agent在工位处理任务
4. 处理完成 → 发送结果到channel
5. 自动设置status=idle → 导航到茶水间休息
6. 循环等待下一个任务
```

**Tasks**:
- [ ] 创建message receive hook: 收到消息时设置working
- [ ] 创建message send hook: 发送回复后设置idle
- [ ] 添加配置: OFFICE_BOT_ID环境变量
- [ ] 启动时自动bind bot并运行auto-navigate
- [ ] 测试完整workflow

**实现要点**:
- 在OpenClaw agent启动脚本中添加bot绑定
- 使用后台进程运行auto-navigate
- Message hooks调用office-bot skill设置状态

### Phase 6: 测试与优化
**Status**: Not Started
**Goal**: 端到端测试和性能优化

**Tasks**:
- [ ] 测试场景1: 无任务→茶水间
- [ ] 测试场景2: 接到任务→工位
- [ ] 测试场景3: 任务完成→茶水间
- [ ] 优化寻路性能
- [ ] 添加错误处理和重试机制

## Key Decisions

### 架构选择
- **方案A (选中)**: 在ws-server实现寻路算法
  - ✅ 中心化管理，易于调试
  - ✅ 可复用于多个client
  - ❌ 服务器计算压力

- **方案B**: 在office-bot skill实现寻路
  - ❌ 需要下载完整地图数据
  - ❌ 重复计算

### 技术选型
- **寻路算法**: A*
  - 成熟、高效
  - 支持障碍物避让

- **状态管理**: 服务端持久化
  - 断线重连后状态不丢失
  - 支持多client监控同一bot

## Risks & Blockers

1. **性能风险**: 大地图寻路可能耗时
   - 缓解: 限制地图大小、预计算常用路径

2. **同步问题**: 多个client同时控制同一bot
   - 缓解: 优先级机制，auto-navigate可被手动控制打断

3. **网络延迟**: 跨网络寻路指令可能延迟
   - 缓解: 本地预测 + 服务端校验

## Success Criteria

- [x] OpenClaw可查询地图上所有位置
- [ ] OpenClaw可让bot自动走到茶水间
- [ ] OpenClaw可让bot自动走到工位
- [ ] Agent开始工作时bot自动去工位
- [ ] Agent空闲时bot自动去茶水间
- [ ] 路径规划避开所有障碍物
- [ ] 整个流程延迟<2秒
