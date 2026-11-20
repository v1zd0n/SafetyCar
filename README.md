# SafetyCar

Prototype for assessing risk along routes on Bulgaria's national roads.

The landing page (`/`) is a scroll-driven 3D story with a simulated in-car warning and a satellite heatmap built from sample hotspots. Its Demo buttons open `/demo`, an interactive route preview with risk estimates for highlighted segments.

## Run

```bash
npm install
cp .env.example .env   # then put your public Mapbox token (pk.*) in VITE_MAPBOX_TOKEN
npm run dev
```

`npm run build` → production bundle in `dist/` (Mapbox and the demo are code-split).

The demo opens with a sample route. Without `VITE_ROUTE_API_URL`, it offers sample routes between five cities along the Sofia–Burgas corridor. With a backend configured, submitting the form loads a route and any returned risk estimates. The supplied backend uses Mapbox Directions for the route and evaluates risk along that route using the baseline assessment and recent road reports where available. See [`docs/route-api.md`](docs/route-api.md) for the request and response format.

The supplied vehicle and road images are prepared with `python scripts/prepare-demo-images.py` (Pillow and NumPy required).

## Deploy

Live at https://safetycar.invent2025.org (Apache on `wp-host`, behind a Cloudflare Tunnel).

```bash
bash scripts/deploy.sh          # builds, uploads dist/ and swaps it in atomically
```

Needs SSH access to `wp-host`. Without a local `.env` the script takes the shared one from the server
(`/data/home/safetycar/.env`). The previous release stays in `public_html.old`.

## Database

PostgreSQL 17 + PostGIS 3.5 on the same server (localhost only), database `safetycar`.
Built by `db/run_all.sh` (steps `db/01`–`09`). Tables, API and examples for the backend: [`docs/database.md`](docs/database.md).

## Stack

Vite · React 19 · TypeScript · React Three Fiber + drei + postprocessing · GSAP ScrollTrigger · Lenis · Mapbox GL JS.

## Where things live

| Path | What |
|---|---|
| `src/scroll/useStory.ts` | The master scroll timeline (`T` = section positions). All scroll animation is here. |
| `src/three/cameraPath.ts` | Camera keyframes (hero → side → approach → inside → screen). Tune these for the real car model. |
| `src/three/PlaceholderCar.tsx` | Procedural unbranded EV (sculpted body, light bars, spinning aero wheels) — swapped for `public/models/car.glb` when present. |
| `src/three/Decor.tsx` | Studio decor: scrolling lane, turntable, light portals, LED wall, speed streaks, sparkles. |
| `src/cockpit/*` | 2.5D cockpit: interior photo, road, AR HUD, cluster; hotspots in `config.ts`. |
| `scripts/cockpit-keys.py` | Turns the generated images in `assets-src/images` into keyed `.webp` assets + screen coordinates. |
| `src/components/CarScreen.tsx` | The CarPlay-style in-car UI (original design). |
| `src/map/MapView.tsx` | Mapbox map, terrain, heatmap; flies to a view per section (`src/data/hotspots.ts`). |
| `src/components/Glitch.tsx` | Scroll-driven glitch transition. |
| `src/i18n/dict.ts` | Landing page copy, BG + EN. The route demo is currently in Bulgarian. |
| `src/styles/tokens.css` | Design tokens (mirrors the Figma variables). |
| `docs/landing-plan.md` | Plan, Figma link, 3D model shortlist, image prompts. |

## Adding the real car model

1. Download a model from the shortlist in `docs/landing-plan.md` as **glTF/GLB**.
2. Optimise it: `npx @gltf-transform/cli optimize in.glb public/models/car.glb --compress draco --texture-compress webp`
3. Reload — it is picked up automatically. Then adjust `KEYFRAMES` and `SCREEN` in `src/three/cameraPath.ts` so the camera lands in front of the model's centre screen.

## Data

The landing heatmap and cockpit use sample data. The landing page's 2024 casualty totals come from the Ministry of Interior records in `ptp_history_21to25.csv`. The baseline road assessment uses geolocated serious crashes outside built-up areas from 2021–2024 and OpenStreetMap road characteristics. See [`docs/database.md`](docs/database.md) for coverage and [`docs/backend-setup.md`](docs/backend-setup.md) for backend setup.
