### WARNING! This is AI vibed slop! Do not use this code without reviewing it. I have not as of yet and am using this as a boilerplate to start developing an application from this mess right here...
You have been warned, if you can reuse any of this code feel free to do so, but do not complain that it is shite...

# Twinkly Squares Open Controller

A locally-hosted Vue.js 3 webapp + Node.js backend that replaces the official Twinkly Android app for Twinkly Squares LED panels.

## Core features

- Direct local control of your Twinkly Squares matrix without cloud account or mobile app.
- HTTP REST proxy to the device (`/xled/v1/*`) plus Token auth handling.
- Real-time UDP streaming of frames.
- Upload movies / playlists that run on the device.
- Online search & cached local library for GIFs and pixel art.
- Pixel art / GIF editor with live preview scaled to your panels.
- Draw directly on the matrix and back up drawings.
- **Manual panel layout editor** to initialize a new rectangular matrix layout without the official app camera mapping.
- **Interactive panel orientation matrix** with a live test pattern to align each physical 8×8 panel.
- **MQTT integration**: each configured matrix publishes status and subscribes to overlay topics.
- **Scrolling text overlays** over realtime content, with a queued message loop per overlay area.

## MQTT & overlays

The app can connect to an MQTT broker configured entirely in the UI (broker IP/port, credentials, base topic). For each configured matrix:

- Incoming messages on `<baseTopic>/<matrix>/overlay/<areaId>/set` are queued as scrolling text.
- Each message may loop indefinitely or run a fixed number of times, then be removed.
- Each overlay area has a configurable max queue size; the oldest queued message is evicted when it is exceeded.
- Start the realtime composer in the UI and choose a base source (solid color, library item or drawing); the text overlays are composited on top and streamed to the matrix.

## Hardware this was built for

- Twinkly Squares panels arranged in a rectangular grid.
- Controller reachable at `192.168.2.50` on the local LAN.
- Each panel is 8×8 LEDs. The default configuration is a 4×4 grid = 32×32 RGB matrix = 1,024 LEDs, matching the device this app was tested against.

The panel arrangement (panels across × down), device IP, number of LEDs per panel and number of panels are configurable in the UI or via `/api/settings`.

## Project layout

```
.
├── backend/         Node.js + Express + TypeScript Twinkly client & API
├── frontend/        Vue 3 + TypeScript + Vite UI
├── data/            Runtime data (cached library, drawings, playlists)
├── docker-compose.yml
└── Dockerfile
```

## Scripts

- `scripts/dev.sh` – runs the **backend dev server** and the **Vue dev server** side-by-side. The Vite dev server proxies `/api` to the backend. No Docker rebuild is needed when you edit the Vue app.
- `scripts/build.sh` – installs dependencies, compiles TypeScript for backend/frontend and builds the production Docker image. Start the container afterwards with `docker compose up -d`.

## Quick start (development)

```bash
./scripts/dev.sh
```

The UI opens on `http://localhost:5173`, the backend API on `http://localhost:3000`.

## Docker (single container)

```bash
./scripts/build.sh
docker compose up -d
```

Open `http://localhost:8080`.

The container expects to be on the same LAN as the Twinkly controller (IP set in UI or `TWINKLY_DEFAULT_IP`).

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `TWINKLY_DEFAULT_IP` | `192.168.2.50` | Default controller IP |
| `DATA_DIR` | `./data` | Where library, drawings and playlists are persisted |
| `PORT` | `3000` | Backend port |

## Notes on mapping / layout

The official Twinkly app uses the smartphone camera to compute each LED's physical coordinate and uploads them via `POST /xled/v1/led/layout/full`. The panel grid editor in this app generates the same layout JSON for rectangular arrangements, so you can initialize a new matrix without the camera procedure. Non-rectangular shapes still require the official app's camera mapping.

Open the **Layout** page to configure the panel grid, arrange the physical panels in the correct cable-chain order (drag-and-drop the tiles), and set the orientation of each physical 8×8 panel (rotate, flip horizontal, flip vertical). A test pattern that draws a red top edge, a green left edge, and the panel’s cable-index number on every panel is sent to the matrix live as you change it. Click a tile once to select it; click the selected tile again to rotate it, or use the flip / rotate buttons for fine control. Dragging a tile to a new position also refreshes the matrix preview immediately.

## License

MIT
