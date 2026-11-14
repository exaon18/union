# ASTRA HEALTH — Frontend

Static dashboard for the ASTRA HEALTH astronaut health monitoring & early-warning prototype
(NASA Space Apps 2026). Plain HTML + CSS + vanilla JavaScript: **no build step, no npm, no CDN**.
Charts are drawn by a tiny built-in canvas helper (`js/charts.js`), so everything works offline at the venue.

> Decision-support prototype, not a medical diagnosis. Thresholds are demo values.

## Run it

```bash
cd frontend
python3 -m http.server 5500
```

Open <http://localhost:5500>. (Opening `index.html` straight from disk also works, but a local server is closer to production.)

### Demo logins (mock)

| username | password | role |
|----------|----------|------|
| `abebe`  | `astra2026` | Astronaut 1 · Commander |
| `sara`   | `astra2026` | Astronaut 2 · Flight Engineer (**emergency scenario**) |
| `dawit`  | `astra2026` | Astronaut 3 · Medical Officer |
| `hana`   | `astra2026` | Astronaut 4 · Mission Specialist |
| `surgeon`| `astra2026` | Flight Surgeon / Mission Support |

The session is stored in `localStorage` (`astra_session`). Logout clears it.

## Pages (user flow)

| Page | Who | What |
|------|-----|------|
| `index.html` | public | Mission header (mission day, Earth time EAT), 4 crew cards with green/yellow/red status, HR, SpO₂, cabin environment, live alert ticker, login |
| `login.html` | public | Login form with demo credentials |
| `my-health.html` | astronaut (surgeon via `?astronaut=<id>`) | Live vitals vs personal baseline, 6 health modules, recommendations (red → *Contact mission support*), HR 24 h / sleep 7 d / cumulative radiation charts |
| `checkin.html` | astronaut | Daily check-in (sleep, mood, stress, exercise, symptoms, optional urine calcium, device values pre-filled) with validation and instant rule feedback |
| `pvt.html` | astronaut | Working Psychomotor Vigilance Task: random 2–10 s delay, click/Space, 5/10/20 trials, mean RT, lapses (> 500 ms), false starts |
| `history.html` | astronaut / surgeon | Metric selector, 6 h / 24 h / 7 d, chart with thresholds, readings table, alert history |
| `support.html` | surgeon | Crew table sorted by severity, open alerts with Acknowledge / Resolve, drill-down per astronaut |

## Files

```
frontend/
  index.html login.html my-health.html checkin.html pvt.html history.html support.html
  css/style.css          dark space theme, responsive
  js/rules.js            port of health/sensor_rules.py + health/rules.py (same thresholds)
  js/mock-data.js        mock backend: same JSON as the Django API, live every 3 s
  js/api.js              API client — the ONE place to switch mock ↔ real
  js/charts.js           tiny canvas charts (line, bars, sparkline)
  js/common.js           nav, session, formatting, icons, starfield
  js/pages/*.js          one script per page
```

## Mock data

`js/mock-data.js` behaves like the Django backend fed by `device_simulator`:

* Every 3 s it produces a new batch of wearable/patch/cabin readings (same metric names, units and ranges as
  `device_simulator/generators.py`) and runs them through the same rules as `health/sensor_rules.py`.
* **Astronaut 2 (Sara Tesfaye)** is in the *emergency* scenario: HR ≈ 130 bpm, SpO₂ ≈ 88 %, irregular ECG,
  high BP, so red alerts keep firing.
* The other crew members occasionally get a transient yellow anomaly, and the cabin occasionally spikes CO₂ or noise.
* Check-ins, PVT results, acknowledged and resolved alerts are kept in `localStorage` so the demo flows across pages.
  Reset with `MockAPI.resetDemo()` in the browser console.

## Switch to the real API

Open `js/api.js` and change one line:

```js
var USE_MOCK = false;                              // was true
var API_BASE = 'http://2.24.53.231:8000/api';      // the VPS
```

Or, without editing, add `?api=real` to any page URL (e.g. `index.html?api=real`).

All read functions call the endpoints documented in `../API.md` and expect exactly the JSON shown there:

| function | endpoint |
|----------|----------|
| `Api.getCrew()` | `GET /api/crew/` |
| `Api.getCrewMember(id)` | `GET /api/crew/<id>/` |
| `Api.getLatest(id)` | `GET /api/readings/latest/?astronaut=<id>` |
| `Api.getCabin()` | `GET /api/cabin/latest/` |
| `Api.getHistory(id, metric, hours, limit)` | `GET /api/readings/history/?astronaut=&metric=&hours=&limit=` |
| `Api.getAlerts({astronaut, level, resolved, limit})` | `GET /api/alerts/` |
| `Api.getCheckins({astronaut, limit})` | `GET /api/checkins/` |

### Not on the backend yet (proposed)

These work in mock mode only. In real mode they call the paths below, which still need to be built in Django:

| function | proposed endpoint |
|----------|-------------------|
| login (`js/common.js` → `Astra.login`) | `POST /api/auth/login/` |
| `Api.submitCheckin(data)` | `POST /api/checkins/` (DailyCheckIn fields + `astronaut_id`, optional `urine_calcium`) |
| `Api.submitPvt(id, result)` | `POST /api/pvt/` → saves `pvt_reaction_time` and `pvt_lapses` readings |
| `Api.acknowledgeAlert(id)` | `POST /api/alerts/<id>/acknowledge/` |
| `Api.resolveAlert(id)` | `POST /api/alerts/<id>/resolve/` |

### Notes

* Times are shown in **EAT (Africa/Addis_Ababa)**. The API returns ISO 8601 with an offset, which the browser converts.
* The API is plain HTTP, so serve the frontend over HTTP too (an HTTPS page can't call an HTTP API: mixed content).
