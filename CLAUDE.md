# benj.bid

Benj's creative business card, live at https://benj.bid. It's a playful 3D experience, not a portfolio: a flight through space to Earth, one continuous fall through the clouds, then a dreamy 3D meadow (soft grass, apple trees, dappled sun, light Japanese touches) full of easter eggs. The setting is "Yosemite meets San Diego": the meadow sits on a sandstone bluff above a Pacific cove lined with palms, framed by granite domes and pine-covered hills.

## Stack
- Astro 5 (static output) + three.js (r187), no UI framework. Astro is pinned to v5 because the local Mac runs Node 22.14; newer Astro needs Node >= 22.23.
- All visuals are procedural (custom GLSL shaders), and all audio is synthesized with WebAudio. There are no image or sound assets.

## Where things live
- `src/data/site.ts`: the business-card text and links. Most "update my card" requests belong here.
- `src/pages/index.astro`: page markup and all overlay UI styles (meishi card, HUD, toasts, secrets panel, SOLD stamp). Styles are `is:global` because toasts and the secrets list are created from JS.
- `src/scripts/main.js`: boot, intro → meadow transition, keyboard secrets, quality tiers (`Q`), adaptive-quality watchdog, debug flags.
- `src/scripts/space.js`: the intro (warp streaks, procedural Earth/clouds/atmosphere, dive onto a coastline). Timeline is in `INTRO`. At the end of the dive, `meadow.arrive()` picks up straight above the meadow (`ARRIVE_H`) inside a cloud layer, so the swap between scenes is hidden and the fall feels continuous.
- `src/scripts/meadow.js`: the meadow orchestrator: time of day palettes, trees/props layout, picking/clicks, physics, easter-egg hooks.
- `src/scripts/glsl.js`: shared GLSL (simplex noise, dapple shadows, fog, lantern light) + JS helpers.
- `terrain.js`: `heightAt()` (meadow, bluff, beach; `bayMask()` marks the cove sector straight ahead, −z), `SEA_LEVEL`, sand/sandstone shading.
- `scenery.js`: ocean (waves, foam, sun glitter), granite domes (Half Dome / El Capitan stand-ins), pines, skyline palms, and the descent clouds the camera falls through.
- `sky.js`, `grass.js`, `trees.js` (canopies + leaf cards + far treeline), `props.js` (lantern, stones, fūrin, fox, mochi, butterflies, planted flowers, red stags, croquet set), `particles.js` (pollen/fireflies, petals), `audio.js`, `eggs.js` (the 12 secrets).

## Easter eggs (keep `eggs.js` and the triggers in sync)
golden (click sun) · newton (drop 3 apples) · furin (click wind chime) · lantern (light it) · kitsune (click the fox) · gardener (double-tap ground) · sold (type "bid", or tap the card's domain 3x) · sakura (Konami code, or type "sakura", or tap 名刺 5x) · mochi (type "mochi", hinted in the console) · stag (click a red stag: it bellows and bounds off) · croquet (whack a ball; balls roll, bounce off trunks and each other) · daydream (idle 30s). Bonus: "g" makes a gust. The secrets panel has a "whisper" box so phone users can type words.

## Debugging
- `?skip` jumps straight to the meadow; `?reset` clears found secrets; `?debug` exposes `window.__meadow` (`debugView(x,y,z,tx,ty,tz)`, `setTod(0|1|2)`, `update(dt,t)`) and `window.__setIntro(seconds)`.
- The Claude desktop browser pane throttles animation when hidden, so step the sim with `__meadow.update(...)` when checking visuals there.

## Deploy
- Pushing to `main` runs `.github/workflows/deploy.yml` → GitHub Pages. `public/CNAME` sets the custom domain; don't delete it.
- GitHub account: personal `bbidi`, never the work account. This repo's git credential helper is pinned to `gh auth git-credential`.
- `npm run build` must pass before pushing.
