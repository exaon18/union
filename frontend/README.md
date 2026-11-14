# ASTRA HEALTH — Frontend

Static dashboard for the ASTRA HEALTH astronaut health monitoring & early-warning prototype
(NASA Space Apps 2026). Plain HTML + CSS + vanilla JavaScript: **no build step, no npm, no CDN**.
Charts are drawn by a tiny built-in canvas helper (`js/charts.js`), so everything works offline at the venue.

> Decision-support prototype, not a medical diagnosis. Thresholds are demo values.

## Run it

**Easiest: served by Django** (same server as the API, nothing else to run):

```
http://2.24.53.231:8000/app/        # the VPS
http://127.0.0.1:8000/app/          # local: python manage.py runserver
```

Pages opened under `/app/` call that same server's `/api`.

**Standalone** (any static host):

```bash
cd frontend
python3 -m http.server 5500
```

Open <http://localhost:5500>. It calls the VPS API (`http://2.24.53.231:8000/api`) by default.
For a local backend open any page once with
`?api_base=http://127.0.0.1:8000/api` (remembered in `localStorage`; `?api_base=reset` clears it).

**No backend at all:** add `?api=mock` (remembered; `?api=real` switches back). Mock mode
simulates everything in the browser and shows a "SIMULATED DATA" banner.

### Demo logins

| username | password | role |
|----------|----------|------|
| `abebe`  | `astra2026` | Astronaut 1 · Commander |
| `sara`   | `astra2026` | Astronaut 2 · Flight Engineer (**emergency scenario**) |
| `dawit`  | `astra2026` | Astronaut 3 · Medical Officer |
| `hana`   | `astra2026` | Astronaut 4 · Mission Specialist |
| `surgeon`| `astra2026` | Flight Surgeon / Mission Support |

Real mode logs in with `POST /api/auth/login/` and keeps `{username, role, astronaut_id, name, token}`
in `localStorage` (`astra_session`). The token goes in `Authorization: Token <key>` on every write.
Logout calls `POST /api/auth/logout/` and clears it. If the server rejects the token (expired after 72 h,
or the database was reset) the page says so and sends you to the login page.

## Pages (user flow)

| Page | Who | What |
|------|-----|------|
| `index.html` | public | Mission dashboard: 3D Earth backdrop, rotatable 3D station with a pin per crew member, mission stats, tilting crew cards (status, HR, SpO₂), cabin gauges, live alert feed, red toasts + red alarm frame |
| `login.html` | public | Login card with all 5 demo accounts (one click fills), warp transition into the app |
| `my-health.html` | astronaut (a surgeon is redirected to the Support Console detail) | Status banner (red → *Contact mission support*), 8 live vital tiles vs personal baseline, alerts with what to do, 3D body with organs coloured from readings/alerts, HR / SpO₂ 24 h, sleep and PVT 7 d, radiation, latest check-in, PVT results, red-alert popup |
| `checkin.html` | astronaut | 7-step check-in wizard (mood, stress, symptoms + notes, device values pre-filled, sleep/exercise, radiation/urine calcium, review), instant rule feedback and server alerts after submit |
| `pvt.html` | astronaut | Psychomotor Vigilance Task: random 2–10 s delay, click/tap/Space, 5/10/20 trials, mean/fastest RT, lapses (> 500 ms), false starts, per-trial bars, 7-day history |
| `history.html` | astronaut / surgeon | Metric chips, 6 h / 24 h / 7 d, chart with thresholds, stats, readings table, alert history |
| `support.html` | surgeon | **Support Console**: critical/caution/nominal/open-alert counters, crew grid sorted most urgent first, alert feed with filters and Acknowledge / Resolve, cabin gauges, per-astronaut detail view (same as My Health, plus Ack/Resolve) |

## Files

```
frontend/
  index.html login.html my-health.html checkin.html pvt.html history.html support.html
  css/style.css          mission-control design system (glass panels, status colours, animations), responsive
  js/rules.js            port of health/sensor_rules.py + health/rules.py (same thresholds)
  js/mock-data.js        mock backend for ?api=mock: same JSON as the Django API, live every 3 s
  js/api.js              API client: base URL, token header, errors, mock ↔ real
  js/charts.js           tiny canvas charts (line, bars, sparkline)
  js/common.js           nav, session, formatting, icons, toasts, modal, gauges, alert items, organ mapping, 3D loader
  js/health-view.js      astronaut health view (used by my-health.html and the Support Console detail)
  js/3d/space.js         three.js Earth + starfield backdrop
  js/3d/station.js       rotatable 3D station with crew beacons
  js/3d/body.js          hologram body with organ hotspots (heart beats at the live heart rate)
  js/3d/tween.js         small camera tween (no GSAP)
  js/pages/*.js          one script per page
  vendor/                three.js + fonts, served locally (no CDN)
  img/                   Earth textures
```

## 3D, sound and fallbacks

* All 3D is three.js r169 loaded from `vendor/` with native ES modules; nothing is fetched from a CDN at runtime.
* No WebGL (or `?no3d=1` in the URL): the pages add `html.no-webgl`, show a CSS starfield and gradient instead of the
  Earth, an icon instead of the station, and the organ list without the 3D body. Everything else works the same.
* `prefers-reduced-motion` turns off count-ups, tilts, the warp transition and auto-rotation.
* The alarm sound for new red alerts is **off by default**; the speaker button in the top bar turns it on (saved in
  `localStorage` as `astra_sound`).

## Third-party assets and licences

| Asset | Path | Licence |
|-------|------|---------|
| three.js r169 (`three.module.min.js`, `OrbitControls.js`, `MeshSurfaceSampler.js`) | `vendor/three/` | MIT, see `vendor/three/LICENSE` |
| Space Grotesk (variable, latin + latin-ext) | `vendor/fonts/` | SIL Open Font License 1.1, via Fontsource |
| JetBrains Mono (variable, latin) | `vendor/fonts/` | SIL Open Font License 1.1, via Fontsource |
| Earth day / night lights / water mask textures | `img/earth-*.jpg` | From the three.js examples (`examples/textures/planets`, MIT repo), derived from NASA Blue Marble / Black Marble imagery (public domain) |

Total added size: about 1.3 MB (three.js 0.7 MB, fonts 0.1 MB, textures 0.5 MB).
The visual design follows the "UNION Mission Health" mock-up made by a teammate.

## Mock data (`?api=mock`)

`js/mock-data.js` (only active in mock mode) behaves like the Django backend fed by `device_simulator`:

* Every 3 s it produces a new batch of wearable/patch/cabin readings (same metric names, units and ranges as
  `device_simulator/generators.py`) and runs them through the same rules as `health/sensor_rules.py`.
* **Astronaut 2 (Sara Tesfaye)** is in the *emergency* scenario: HR ≈ 130 bpm, SpO₂ ≈ 88 %, irregular ECG,
  high BP, so red alerts keep firing.
* The other crew members occasionally get a transient yellow anomaly, and the cabin occasionally spikes CO₂ or noise.
* Check-ins, PVT results, acknowledged and resolved alerts are kept in `localStorage` so the demo flows across pages.
  Reset with `MockAPI.resetDemo()` in the browser console.

## API wiring

`js/api.js` is the only file that talks to the server. Order used to pick the API:
`?api_base=` / saved `astra_api_base` → same-origin `/api` when served by Django at `/app/` →
`http://2.24.53.231:8000/api`. Mock mode only with `?api=mock`.

| function | endpoint | auth |
|----------|----------|------|
| `Api.login(u, p)` (via `Astra.login`) | `POST /api/auth/login/` | – |
| `Api.me()` | `GET /api/auth/me/` (token check on protected pages) | token |
| `Api.logout()` (via `Astra.logout`) | `POST /api/auth/logout/` | token |
| `Api.getCrew()` | `GET /api/crew/` | – |
| `Api.getCrewMember(id)` | `GET /api/crew/<id>/` | – |
| `Api.getLatest(id)` | `GET /api/readings/latest/?astronaut=<id>` | – |
| `Api.getCabin()` | `GET /api/cabin/latest/` | – |
| `Api.getHistory(id, metric, hours, limit)` | `GET /api/readings/history/` (long windows come back averaged into buckets) | – |
| `Api.getAlerts({astronaut, level, resolved, limit})` | `GET /api/alerts/` | – |
| `Api.getCheckins({astronaut, limit})` | `GET /api/checkins/` | – |
| `Api.getPvt({astronaut, limit})` | `GET /api/pvt/` | – |
| `Api.submitCheckin(data)` | `POST /api/checkins/` → `{checkin, alerts, status}`; the page shows the server's alerts | astronaut |
| `Api.submitPvt(id, result)` | `POST /api/pvt/` → `{pvt, alerts, status}` | astronaut |
| `Api.acknowledgeAlert(id)` | `POST /api/alerts/<id>/acknowledge/` | surgeon |
| `Api.resolveAlert(id)` | `POST /api/alerts/<id>/resolve/` | surgeon |

Errors: every call rejects with an `Error` whose `status` is the HTTP code (`0` + `offline: true`
when the server can't be reached or takes > 10 s). Pages show a toast; polling pages switch
the LIVE badge to OFFLINE and show a red "cannot reach …" bar until the server answers again.

### Notes

* Times are shown in **EAT (Africa/Addis_Ababa)**. The API returns ISO 8601 with an offset, which the browser converts.
* The API is plain HTTP, so serve the frontend over HTTP too (an HTTPS page can't call an HTTP API: mixed content).
* The status shown for each astronaut comes from the server (`status` in `/api/crew/`). Value colours on tiles use
  `js/rules.js`, a copy of the server thresholds: keep both in sync if you change a threshold.
