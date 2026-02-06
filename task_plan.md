# Task Plan: Office Bot "Life Simulation"

## Overview
Make the office bots behave more naturally when idle, including random wandering and social interactions (chatting).

## Phases

### Phase 1: Backend Capabilities (ws-server.js)
**Goal**: Enable random movement and bot awareness.
- [ ] Add `GET /api/map/random-point` to get valid random coordinates.
- [ ] Ensure `GET /api/bots` returns accurate positions for proximity checks (already exists).

### Phase 2: Extension Logic (extensions/office-bot)
**Goal**: Implement the "Life Simulation" brain.
- [ ] Add `simulate` command to the extension.
- [ ] Implement `SimulationManager` class:
    - [ ] `tick()` loop (every 5-10s).
    - [ ] **State Machine**: `working` -> `idle` -> `wandering` -> `chatting`.
    - [ ] **Wandering**: Fetch random point, goto.
    - [ ] **Chatting**: Detect nearby bots (< 3 tiles), pick random "banter" line, `say`.
    - [ ] **Personas**: Simple dictionary of lines per character type (PM, Dev, Designer, Boss).

### Phase 3: Integration
**Goal**: User control.
- [ ] `/office-bot behave life` (starts simulation).
- [ ] `/office-bot behave robot` (stops simulation, returns to strict work/idle).

## Technical Details
- **Random Walk**: Server side logic to find a walkable tile.
- **Chat**: Client-side (Extension) logic to trigger `say` API.
- **Proximity**: Calculated in Extension based on `GET /api/bots`.

## Verification
- Start simulation.
- Watch bot wander to random spots.
- Place another bot nearby.
- Verify they exchange messages.
