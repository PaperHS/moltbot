# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WorkAdventure map project using Vite + TypeScript. Maps are built with Tiled Editor (`.tmj` files) and scripting is done via the WorkAdventure iframe API.

## Commands

```bash
pnpm install          # Install dependencies
pnpm run dev          # Start dev server with HMR
pnpm run build        # Type-check + production build
pnpm run prod         # Preview production build
pnpm run upload       # Build and upload to WA Map Storage
pnpm run upload-only  # Upload without rebuilding
```

## Architecture

**Map Files**: Root-level `.tmj` files (Tiled JSON format) define the maps. Each map can have an associated TypeScript file in `src/` for scripting.

**Build Pipeline**: `wa-map-optimizer-vite` plugin auto-discovers `.tmj` files via `getMaps()` and:
- Registers corresponding `src/<mapname>.ts` scripts as entry points
- Applies tileset optimization (configurable via `.env`)

**Scripting**: `src/main.ts` uses the WorkAdventure iframe API (`WA.*` globals from `@workadventure/iframe-api-typings`). Reference the types via triple-slash directive at file top.

**Environment Config** (`.env`):
- `LOG_LEVEL`: Build verbosity (0-2)
- `TILESET_OPTIMIZATION`: Enable lossy PNG compression
- `UPLOAD_MODE`: `GH_PAGES` or `MAP_STORAGE`

## Key Dependencies

- `@workadventure/iframe-api-typings`: Type definitions for WA scripting API
- `@workadventure/scripting-api-extra`: Extended API utilities
- `wa-map-optimizer-vite`: Vite plugin for map processing and tileset optimization

## Deployment

Push to `master` triggers GitHub Actions workflow that either:
1. Deploys `dist/` to `gh-pages` branch (default)
2. Uploads to WA Map Storage (requires `MAP_STORAGE_API_KEY` secret)
