# SafetyCar

Interactive map of crash risk on Bulgaria's national roads.

This repo currently contains the **landing page**: a scroll-driven 3D story — the camera orbits a car, enters the cabin, the in-car "SafetyCar OS" screen boots, expands into a full-screen Mapbox satellite map with 3D terrain, walks through the project sections, then glitches into the footer.

## Run

```bash
npm install
cp .env.example .env   # then put your public Mapbox token (pk.*) in VITE_MAPBOX_TOKEN
npm run dev
```

`npm run build` → production bundle in `dist/` (Mapbox is code-split and loaded only when the story reaches the car screen).

## Deploy

Live at https://safetycar.invent2025.org (Apache on `wp-host`, behind a Cloudflare Tunnel).

```bash
bash scripts/deploy.sh          # builds, uploads dist/ and swaps it in atomically
```

Needs SSH access to `wp-host` and `VITE_MAPBOX_TOKEN` in `.env`. The previous release stays in `public_html.old`.

## Database

PostgreSQL 17 + PostGIS 3.5 on the same server (localhost only), database `safetycar`.
`db/01_ptp.sql` loads the crash CSV: `psql -d safetycar -f db/01_ptp.sql < ptp_history_21to25.csv`.

## Stack

Vite · React 19 · TypeScript · React Three Fiber + drei + postprocessing · GSAP ScrollTrigger · Lenis · Mapbox GL JS.

## Where things live

| Path | What |
|---|---|
| `src/scroll/useStory.ts` | The master scroll timeline (`T` = section positions). All scroll animation is here. |
| `src/three/cameraPath.ts` | Camera keyframes (hero → side → approach → inside → screen). Tune these for the real car model. |
| `src/three/PlaceholderCar.tsx` | Procedural unbranded car + interior used until a real model is added. |
| `src/three/CarModel.tsx` | Auto-loads `public/models/car.glb` if it exists, otherwise uses the placeholder. |
| `src/components/CarScreen.tsx` | The CarPlay-style in-car UI (original design). |
| `src/map/MapView.tsx` | Mapbox map, terrain, heatmap; flies to a view per section (`src/data/hotspots.ts`). |
| `src/components/Glitch.tsx` | Scroll-driven glitch transition. |
| `src/i18n/dict.ts` | All copy, BG + EN. |
| `src/styles/tokens.css` | Design tokens (mirrors the Figma variables). |
| `docs/landing-plan.md` | Plan, Figma link, 3D model shortlist, image prompts. |

## Adding the real car model

1. Download a model from the shortlist in `docs/landing-plan.md` as **glTF/GLB**.
2. Optimise it: `npx @gltf-transform/cli optimize in.glb public/models/car.glb --compress draco --texture-compress webp`
3. Reload — it is picked up automatically. Then adjust `KEYFRAMES` and `SCREEN` in `src/three/cameraPath.ts` so the camera lands in front of the model's centre screen.

## Data

Hotspots and stats are **mock values** for now — replace with the real dataset (МВР / АПИ / data.egov.bg).
Credit the 3D model author (CC-BY), Mapbox and OpenStreetMap in the footer.
