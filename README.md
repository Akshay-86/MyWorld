# 🌍 MyWorld

> A stylized 3D nature simulation built with Three.js — **Work In Progress**

![Status](https://img.shields.io/badge/status-WIP-yellow)

## About

An interactive, explorable 3D world featuring rolling hills, dense forests, multiple ponds, and a village connected by dirt paths — all under a dynamic day/night sky. Built with stylized low-poly assets from [Quaternius](https://quaternius.com/) and [Kenney](https://kenney.nl/).

## Features

- 🌲 **Dense Forest** — 1,500+ trees, 5,000+ flora instances rendered via `InstancedMesh` (~25 draw calls instead of ~4,300)
- 🏠 **Village** — 50 fenced houses with villagers, connected by terrain-hugging dirt paths with scattered rocks
- 💧 **Multiple Ponds** — 5 natural ponds sitting inside terrain bowl depressions
- 🌅 **Day/Night Cycle** — Dynamic sun orbit, sky color transitions (day → sunset → night), shifting shadows and ambient lighting
- 🗺️ **Infinite World Feel** — 600×600 map with exponential fog fading into the horizon
- ⚡ **Optimized** — InstancedMesh batching, reduced shadow maps, pixel ratio capping, squared-distance collision checks

## Controls

| Input | Action |
|-------|--------|
| `W` / `↑` | Move forward |
| `S` / `↓` | Move backward |
| `A` / `←` | Strafe left |
| `D` / `→` | Strafe right |
| `Scroll` | Zoom in/out |
| `Left-click drag` | Rotate view |
| `Shift + drag` | Pan |

## Tech Stack

- **Three.js** — 3D rendering (`InstancedMesh`, `OrbitControls`, `GLTFLoader`)
- **Vite** — Dev server & bundler
- **GLTF models** — Quaternius Ultimate Stylized Nature + Kenney Nature Kit

## Assets

The model and texture assets are also packaged as a zipped download in the GitHub Releases page. If you are setting up the project from a release bundle, download the asset zip and extract it so the `public/models/` directory is populated before running the app.

## Run Locally

1. Download the asset zip from the GitHub Releases page and extract it into the project so `public/models/` contains the model files.
2. Install dependencies.
3. Start the dev server.

```bash
npm install
npm run dev
```

## Roadmap

- [x] Phase 1 — Terrain, models, houses, trees
- [x] Phase 1.5 — Fences, dirt paths, loading screen
- [x] Phase 2 — WASD exploration, dense forests, zoom fix
- [x] Phase 3 — InstancedMesh optimization, multiple ponds, day/night cycle
- [ ] Phase 4 — Oxygen system (trees produce, humans consume)
- [ ] Phase 5 — Character variation (color, size)
- [ ] Phase 6 — AI-driven character behavior
