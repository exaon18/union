# ASTRA HEALTH API

A short guide for the frontend team. You do not need to know Django.

The backend stores live sensor readings, daily check-ins, PVT results and alerts. Your job is to **call a URL and use the JSON that comes back**. JSON is just structured text that looks like `{"metric": "heart_rate", "value": 72}`.

## Base URL

```
http://2.24.53.231:8000/api
```

Plain HTTP (an IP, no HTTPS or domain yet). If your page is served over HTTPS the browser will block these calls (mixed content); serve the frontend over HTTP, or open it from Django itself at **`http://2.24.53.231:8000/app/`** (same server, so no CORS or mixed-content problems). The Simulation Lab (testing tool) is at **`http://2.24.53.231:8000/lab/`**.

* **Times** are ISO 8601 with an offset, in mission-control time (EAT, `+03:00`), e.g. `2026-11-14T22:35:06+03:00`. `new Date(...)` in JavaScript handles them.
* **Reading** (`GET`) is public: no login. The public mission dashboard uses only GETs.
* **Writing** (`POST`) needs a login token: `Authorization: Token <key>` (see [Login](#login-token-auth)).
* **CORS**: any website may call the API (GET and POST, `Authorization` header allowed).
* The examples below are **real responses** from a local test run (4 astronauts + simulator with an emergency for astronaut 2, Sara Tesfaye). Long lists are cut with `…`.

Demo accounts (password for all: `astra2026`):

| username | role | astronaut_id |
|----------|------|--------------|
| `abebe` | astronaut (Commander) | 1 |
| `sara` | astronaut (Flight Engineer, emergency demo) | 2 |
| `dawit` | astronaut (Medical Officer) | 3 |
| `hana` | astronaut (Mission Specialist) | 4 |
| `surgeon` | flight surgeon (Dr. Meron Alemu, sees everyone, acknowledges/resolves alerts) | – |

## Endpoint summary

| method | path | auth | what |
|--------|------|------|------|
| GET | `/api/` | public | This index. |
| POST | `/api/auth/login/` | public | Body {"username","password"} -> {"token", "user": {username, name, role, astronaut_id}}. |
| GET | `/api/auth/me/` | token | The logged-in user. |
| POST | `/api/auth/logout/` | token | Delete the current token. |
| GET | `/api/crew/` | public | All astronauts with overall status and open alert counts. |
| GET | `/api/crew/<id>/` | public | One astronaut, including personal baselines. |
| GET | `/api/readings/latest/` | public | Newest reading per metric. Pass ?astronaut=<id> or ?source=cabin. Optional &hours=48. |
| GET | `/api/cabin/latest/` | public | Newest cabin/environment reading per metric (no astronaut). |
| GET | `/api/readings/history/` | public | Time series, oldest first. Requires ?astronaut=<id>&metric=<name>. Optional &hours=24&limit=500. |
| GET | `/api/alerts/` | public | Alerts, newest first. Optional ?astronaut=<id>&level=red&resolved=false&acknowledged=false&limit=50. |
| POST | `/api/alerts/<id>/acknowledge/` | token (surgeon) | Mark an alert as seen by mission support. |
| POST | `/api/alerts/<id>/resolve/` | token (surgeon) | Close an alert. |
| GET | `/api/checkins/` | public | Recent daily check-ins, newest first. Optional ?astronaut=<id>&limit=30. |
| POST | `/api/checkins/` | token (astronaut: own data) | Submit a daily check-in. Runs the check-in rules and returns the alerts it created. |
| GET | `/api/pvt/` | public | PVT results, newest first. Optional ?astronaut=<id>&limit=30. |
| POST | `/api/pvt/` | token (astronaut: own data) | Save a PVT run; also stores pvt_reaction_time and pvt_lapses readings so sensor rules fire. |
| POST | `/api/voice-alert/` | token | Body `{"astronaut_id": 2}` -> Gemini-generated `audio/wav` warning for that astronaut. |
| GET | `/api/sim/scenario/` | public | Active simulation scenario, resolved per astronaut, plus presets. The simulator reads it every tick. |
| POST | `/api/sim/scenario/` | token (surgeon) | Change the scenario. Optional `reset` (resolve open alerts) and `apply_now` (push one batch). |
| POST | `/api/sim/reset/` | token (surgeon) | Resolve every open alert. |
| POST | `/api/sim/tick/` | token (surgeon) | Generate and save one simulated batch now. |
| GET | `/api/space-weather/` | none | Real NASA DONKI space weather: crew state, latest events, replayable events. |
| GET | `/api/nasa/reference/` | none | Bands derived from NASA OSDR OSD-575, OSD-656, OSD-53, with provenance. |
| POST | `/api/webhook/readings/` | HMAC (X-Astra-Signature) | Device webhook. HMAC-signed. Not for the frontend. |

`GET /api/` returns this list as JSON (plus `server_time`).

---

## Login (token auth)

### `POST /api/auth/login/`

Body: `{"username": "sara", "password": "astra2026"}`

```json
{
  "token": "3f2a…(40 hex characters)…9c1d",
  "expires_at": "2026-11-17T22:53:03.413089+03:00",
  "user": {
    "id": 2,
    "username": "sara",
    "name": "Sara Tesfaye",
    "role": "astronaut",
    "title": null,
    "astronaut_id": 2
  }
}
```

* `role` is `astronaut` or `surgeon`. `astronaut_id` is the astronaut's own id (null for the surgeon).
* Keep `token` (e.g. in `localStorage`) and send it on every POST: `Authorization: Token <token>`.
* Tokens expire after 72 h (`expires_at`). A wrong password gives **401** `{"error": "wrong username or password"}`.
* Only a hash of the token is stored on the server.

### `GET /api/auth/me/`  (token)

```json
{
  "user": {
    "id": 2,
    "username": "sara",
    "name": "Sara Tesfaye",
    "role": "astronaut",
    "title": null,
    "astronaut_id": 2
  }
}
```

401 means the token is missing, expired or logged out: send the user back to the login page.

### `POST /api/auth/logout/`  (token)

Deletes the token. Returns `{"ok": true}`.

---

## `GET /api/crew/`

All astronauts. `status` is the worst level among the astronaut's **open** alerts (`green` when none). `last_reading_at` is the newest sensor reading.

`http://2.24.53.231:8000/api/crew/`

```json
{
  "count": 4,
  "astronauts": [
    {
      "id": 1,
      "name": "Abebe Kebede",
      "mission": "Artemis Mars Transit",
      "role": "Commander",
      "status": "green",
      "open_alerts": 0,
      "last_reading_at": "2026-11-14T22:53:02+03:00"
    },
    {
      "id": 2,
      "name": "Sara Tesfaye",
      "mission": "Artemis Mars Transit",
      "role": "Flight Engineer",
      "status": "red",
      "open_alerts": 37,
      "last_reading_at": "2026-11-14T22:53:02+03:00"
    },
    {
      "id": 3,
      "name": "Dawit Haile",
      "mission": "Artemis Mars Transit",
      "role": "Medical Officer",
      "status": "green",
      "open_alerts": 0,
      "last_reading_at": "2026-11-14T22:53:02+03:00"
    },
    {
      "id": 4,
      "name": "Hana Girma",
      "mission": "Artemis Mars Transit",
      "role": "Mission Specialist",
      "status": "green",
      "open_alerts": 0,
      "last_reading_at": "2026-11-14T22:53:02+03:00"
    }
  ]
}
```

## `GET /api/crew/<id>/`

One astronaut, plus personal `baselines` (their normal values).

`http://2.24.53.231:8000/api/crew/2/`

```json
{
  "id": 2,
  "name": "Sara Tesfaye",
  "mission": "Artemis Mars Transit",
  "role": "Flight Engineer",
  "status": "red",
  "open_alerts": 37,
  "last_reading_at": "2026-11-14T22:53:02+03:00",
  "baselines": {
    "heart_rate": 68,
    "systolic_bp": 112,
    "diastolic_bp": 72
  }
}
```

---

## `GET /api/readings/latest/`

Newest reading **per metric** for one astronaut (`?astronaut=<id>`) or for the cabin (`?source=cabin`). Optional `&hours=48` (only look at the last N hours; default 48).

* Numbers are in `value`; text metrics (`ecg_rhythm`) use `text_value` and `value` is null.
* Readings dated in the future (bad device clock) are ignored.

`http://2.24.53.231:8000/api/readings/latest/?astronaut=2`

```json
{
  "astronaut_id": 2,
  "astronaut": "Sara Tesfaye",
  "count": 26,
  "readings": [
    {
      "metric": "blood_glucose",
      "value": 87.0,
      "text_value": "",
      "unit": "mg/dL",
      "source": "cgm",
      "timestamp": "2026-11-14T22:53:02+03:00"
    },
    {
      "metric": "body_mass",
      "value": 72.0,
      "text_value": "",
      "unit": "kg",
      "source": "mass_device",
      "timestamp": "2026-11-14T22:37:28+03:00"
    },
    {
      "metric": "body_temperature",
      "value": 36.5,
      "text_value": "",
      "unit": "°C",
      "source": "patch",
      "timestamp": "2026-11-14T22:53:02+03:00"
    },
    {
      "metric": "calories_burned",
      "value": 2538.0,
      "text_value": "",
      "unit": "kcal",
      "source": "wearable",
      "timestamp": "2026-11-14T22:37:28+03:00"
    },
    …
  ]
}
```

## `GET /api/cabin/latest/`

Same as `readings/latest/?source=cabin`: CO₂, O₂, cabin radiation, noise, temperature, humidity, pressure, VOC.

`http://2.24.53.231:8000/api/cabin/latest/`

```json
{
  "source": "cabin",
  "count": 8,
  "readings": [
    {
      "metric": "cabin_pressure",
      "value": 101.8,
      "text_value": "",
      "unit": "kPa",
      "source": "cabin",
      "timestamp": "2026-11-14T22:53:02+03:00"
    },
    {
      "metric": "cabin_radiation",
      "value": 0.6,
      "text_value": "",
      "unit": "mSv/day",
      "source": "cabin",
      "timestamp": "2026-11-14T22:53:02+03:00"
    },
    {
      "metric": "cabin_temperature",
      "value": 22.8,
      "text_value": "",
      "unit": "°C",
      "source": "cabin",
      "timestamp": "2026-11-14T22:53:02+03:00"
    },
    …
  ]
}
```

---

## `GET /api/readings/history/`

Time series for charts, **oldest first**. Required: `astronaut`, `metric`. Optional: `hours` (default 24), `limit` (default 500, max 2000).

If the window has more points than `limit` (24 h of 3-second readings is ~29,000), the server **averages them into time buckets** so the chart still covers the whole window. Then the response has `bucket_seconds`, each point has `samples` (how many readings were averaged) and `timestamp` is the newest reading in that bucket. Add `&downsample=false` to get the newest `limit` raw points instead.

Raw: `http://2.24.53.231:8000/api/readings/history/?astronaut=2&metric=heart_rate&hours=1&limit=3&downsample=false`

```json
{
  "astronaut_id": 2,
  "astronaut": "Sara Tesfaye",
  "metric": "heart_rate",
  "hours": 1,
  "count": 3,
  "readings": [
    {
      "metric": "heart_rate",
      "value": 125.0,
      "text_value": "",
      "unit": "bpm",
      "source": "wearable",
      "timestamp": "2026-11-14T22:52:56+03:00"
    },
    {
      "metric": "heart_rate",
      "value": 126.0,
      "text_value": "",
      "unit": "bpm",
      "source": "wearable",
      "timestamp": "2026-11-14T22:52:59+03:00"
    },
    {
      "metric": "heart_rate",
      "value": 134.0,
      "text_value": "",
      "unit": "bpm",
      "source": "wearable",
      "timestamp": "2026-11-14T22:53:02+03:00"
    }
  ]
}
```

Downsampled: `http://2.24.53.231:8000/api/readings/history/?astronaut=2&metric=heart_rate&hours=24&limit=3`

```json
{
  "astronaut_id": 2,
  "astronaut": "Sara Tesfaye",
  "metric": "heart_rate",
  "hours": 24,
  "count": 3,
  "readings": [
    {
      "metric": "heart_rate",
      "value": 84.94,
      "text_value": "",
      "unit": "bpm",
      "source": "wearable",
      "timestamp": "2026-11-14T06:52:40.251598+03:00",
      "samples": 556
    },
    {
      "metric": "heart_rate",
      "value": 85.48,
      "text_value": "",
      "unit": "bpm",
      "source": "wearable",
      "timestamp": "2026-11-14T14:52:14.329006+03:00",
      "samples": 555
    },
    {
      "metric": "heart_rate",
      "value": 103.19,
      "text_value": "",
      "unit": "bpm",
      "source": "wearable",
      "timestamp": "2026-11-14T22:53:02+03:00",
      "samples": 965
    }
  ],
  "bucket_seconds": 28800
}
```

---

## `GET /api/alerts/`

Alerts, **newest first**. Optional: `astronaut=<id>` (or `astronaut=cabin`), `level=green|yellow|red`, `resolved=true|false`, `acknowledged=true|false`, `limit` (default 50, max 200).

`http://2.24.53.231:8000/api/alerts/?astronaut=2&resolved=false&limit=2`

```json
{
  "count": 2,
  "alerts": [
    {
      "id": 199,
      "astronaut_id": 2,
      "astronaut": "Sara Tesfaye",
      "system": "musculoskeletal",
      "level": "yellow",
      "message": "Only 40 min exercise (target ≥ 60)",
      "recommendation": "Bone and muscle loss risk in microgravity; complete the exercise session.",
      "acknowledged": false,
      "acknowledged_at": null,
      "resolved": false,
      "resolved_at": null,
      "resolved_by": null,
      "acknowledged_by": null,
      "source": "checkin",
      "created_at": "2026-11-14T22:52:55.737987+03:00"
    },
    {
      "id": 197,
      "astronaut_id": 2,
      "astronaut": "Sara Tesfaye",
      "system": "musculoskeletal",
      "level": "yellow",
      "message": "Only 40 min exercise (target ≥ 60)",
      "recommendation": "Bone and muscle loss risk in microgravity; complete the exercise session.",
      "acknowledged": false,
      "acknowledged_at": null,
      "resolved": false,
      "resolved_at": null,
      "resolved_by": null,
      "acknowledged_by": null,
      "source": "checkin",
      "created_at": "2026-11-14T22:52:45.237630+03:00"
    }
  ]
}
```

* `source`: `sensor` (from the webhook or PVT readings), `checkin` (from a daily check-in) or `other`.
* `resolved_by`: the surgeon's username, `"auto"` when the system closed it, `null` while open.
* How alerts open and close on their own:
  * **No duplicates:** while an alert for the same astronaut + metric + level is open and younger than 5 minutes, a repeat reading does not create another one.
  * **Back to normal:** an open sensor alert closes itself (`resolved_by: "auto"`) once a newer reading of the same metric is back in range, or at a lower level (a red heart-rate alert closes when the heart rate is only yellow; a new yellow alert opens), and the alert is at least 2 minutes old. A persistent problem stays open.
  * **Stale:** open sensor alerts older than 30 minutes close automatically. A still-abnormal sensor raises a fresh one. Check-in and PVT alerts wait for the flight surgeon.
  * Tunable on the server with `ASTRA_ALERT_DEDUP_MINUTES`, `ASTRA_ALERT_CLEAR_AFTER_SECONDS`, `ASTRA_ALERT_AUTO_RESOLVE_MINUTES` (0 turns each off).

### `POST /api/alerts/<id>/acknowledge/`  (token, surgeon only)

Marks the alert as seen by mission support. It stays open.

```json
{
  "alert": {
    "id": 202,
    "astronaut_id": 2,
    "astronaut": "Sara Tesfaye",
    "system": "behavioral",
    "level": "yellow",
    "message": "Attention lapses (fatigue): 3",
    "recommendation": "Rest before critical tasks.",
    "acknowledged": true,
    "acknowledged_at": "2026-11-14T22:53:03.718746+03:00",
    "resolved": false,
    "resolved_at": null,
    "resolved_by": null,
    "acknowledged_by": "surgeon",
    "source": "sensor",
    "created_at": "2026-11-14T22:53:03.491748+03:00"
  }
}
```

### `POST /api/alerts/<id>/resolve/`  (token, surgeon only)

Closes the alert (and acknowledges it if it wasn't yet).

```json
{
  "alert": {
    "id": 202,
    "astronaut_id": 2,
    "astronaut": "Sara Tesfaye",
    "system": "behavioral",
    "level": "yellow",
    "message": "Attention lapses (fatigue): 3",
    "recommendation": "Rest before critical tasks.",
    "acknowledged": true,
    "acknowledged_at": "2026-11-14T22:53:03.718746+03:00",
    "resolved": true,
    "resolved_at": "2026-11-14T22:53:03.723265+03:00",
    "resolved_by": "surgeon",
    "acknowledged_by": "surgeon",
    "source": "sensor",
    "created_at": "2026-11-14T22:53:03.491748+03:00"
  }
}
```

An astronaut token gets **403** `{"error": "forbidden for role astronaut"}`.

---

## Daily check-in

### `GET /api/checkins/`

Recent check-ins, newest first. Optional `?astronaut=<id>&limit=30`.

`http://2.24.53.231:8000/api/checkins/?astronaut=2&limit=1`

```json
{
  "count": 1,
  "checkins": [
    {
      "id": 8,
      "astronaut_id": 2,
      "created_at": "2026-11-14T22:53:03.480460+03:00",
      "heart_rate": 74,
      "systolic_bp": 118,
      "diastolic_bp": 76,
      "temperature": 36.9,
      "exercise_minutes": 40,
      "sleep_hours": 6.5,
      "mood": 4,
      "stress": 2,
      "radiation_msv": 0.5,
      "symptoms": "mild headache"
    }
  ]
}
```

### `POST /api/checkins/`  (token)

Astronauts submit for themselves (`astronaut_id` optional, must be their own). The surgeon must pass `astronaut_id`.

| field | type | range | required |
|-------|------|-------|----------|
| `heart_rate` | whole number, bpm | 30–220 | yes |
| `systolic_bp` / `diastolic_bp` | whole numbers, mmHg | 70–250 / 40–150, diastolic < systolic | yes |
| `temperature` | °C | 34–43 | yes |
| `sleep_hours` | hours | 0–16 | yes |
| `mood` | 1 (very low) – 5 (great) | 1–5 | yes |
| `stress` | 1 (calm) – 5 (severe) | 1–5 | yes |
| `exercise_minutes` | whole number | 0–300 | no (0) |
| `radiation_msv` | mSv today | 0–50 | no (0) |
| `symptoms` | text | ≤ 500 chars | no |
| `urine_calcium` | mg/day, saved as a `lab` sensor reading | 0–1000 | no |

The server runs the check-in rules (`health/rules.py`) and returns the alerts they created plus the worst level as `status`:

```json
{
  "checkin": {
    "id": 8,
    "astronaut_id": 2,
    "created_at": "2026-11-14T22:53:03.480460+03:00",
    "heart_rate": 74,
    "systolic_bp": 118,
    "diastolic_bp": 76,
    "temperature": 36.9,
    "exercise_minutes": 40,
    "sleep_hours": 6.5,
    "mood": 4,
    "stress": 2,
    "radiation_msv": 0.5,
    "symptoms": "mild headache"
  },
  "alerts": [
    {
      "id": 201,
      "astronaut_id": 2,
      "astronaut": "Sara Tesfaye",
      "system": "musculoskeletal",
      "level": "yellow",
      "message": "Only 40 min exercise (target ≥ 60)",
      "recommendation": "Bone and muscle loss risk in microgravity; complete the exercise session.",
      "acknowledged": false,
      "acknowledged_at": null,
      "resolved": false,
      "resolved_at": null,
      "resolved_by": null,
      "acknowledged_by": null,
      "source": "checkin",
      "created_at": "2026-11-14T22:53:03.480814+03:00"
    }
  ],
  "status": "yellow"
}
```

Errors: **401** `{"error": "login required (Authorization: Token <key>)"}`, **400** `{"error": "mood must be between 1 and 5"}`, **403** when an astronaut sends someone else's `astronaut_id`.

---

## PVT (Psychomotor Vigilance Task)

### `GET /api/pvt/`

PVT runs, newest first. Optional `?astronaut=<id>&limit=30`.

```json
{
  "count": 1,
  "results": [
    {
      "id": 6,
      "astronaut_id": 2,
      "created_at": "2026-11-14T22:53:03.491076+03:00",
      "mean_rt_ms": 412,
      "fastest_ms": 251,
      "lapses": 3,
      "false_starts": 1,
      "trials": 10
    }
  ]
}
```

### `POST /api/pvt/`  (token)

Body: `{"mean_rt_ms": 412, "fastest_ms": 251, "lapses": 3, "false_starts": 1, "trials": 10}` (`mean_rt_ms` and `trials` required; `astronaut_id` same rule as check-ins; `mean_rt` is accepted as an alias of `mean_rt_ms`).

Also saves two sensor readings, `pvt_reaction_time` (ms) and `pvt_lapses`, so they appear in `readings/history/` and the sensor rules fire (≥ 3 lapses yellow, ≥ 6 red):

```json
{
  "pvt": {
    "id": 6,
    "astronaut_id": 2,
    "created_at": "2026-11-14T22:53:03.491076+03:00",
    "mean_rt_ms": 412,
    "fastest_ms": 251,
    "lapses": 3,
    "false_starts": 1,
    "trials": 10
  },
  "alerts": [
    {
      "id": 202,
      "astronaut_id": 2,
      "astronaut": "Sara Tesfaye",
      "system": "behavioral",
      "level": "yellow",
      "message": "Attention lapses (fatigue): 3",
      "recommendation": "Rest before critical tasks.",
      "acknowledged": false,
      "acknowledged_at": null,
      "resolved": false,
      "resolved_at": null,
      "resolved_by": null,
      "acknowledged_by": null,
      "source": "sensor",
      "created_at": "2026-11-14T22:53:03.491748+03:00"
    }
  ],
  "status": "yellow"
}
```

---

## Simulation lab (`/api/sim/`)

Controls what the device simulator sends, so you can test the system in a chosen situation.
The UI for it is the separate **Simulation Lab** at **`http://2.24.53.231:8000/lab/`** (a testing
tool with its own header and flight-surgeon sign-in, not part of the crew app; `/app/scenarios.html`
redirects there). The crew app does not call the POST endpoints below.
Presets and value bands live in `device_simulator/scenarios.py` (the simulator and the server share it).

| level | what the simulator sends for the chosen system |
|-------|-----------------------------------------------|
| `normal` | values clamped inside the green range: never an alert |
| `caution` | values inside the yellow band only |
| `critical` | values inside the red band |

Astronaut systems: `cardiovascular` (HR, ECG, BP, HRV), `respiratory` (SpO₂, breathing rate),
`radiation` (dosimeter), `behavioral` (stress, sleep, PVT lapses), `immune` (body temperature, glucose,
plus serum cytokines/CRP and urine markers shifted by the real Inspiration4 return-day change, see
[NASA_DATA.md](NASA_DATA.md)).
Cabin systems: `co2`, `o2`, `radiation`, `noise` (cabin alerts have no astronaut).

Presets: `nominal`, `one_caution`, `one_critical`, `mixed` (one critical + one caution), `several_caution`,
`all_critical`, `cabin_co2`, `radiation_storm`, `space_weather` (replay one real NASA DONKI event),
`realistic` (default: mostly green, rare one-tick blips at `anomaly_rate` per astronaut per tick; a real
DONKI SEP event, X-class flare or recent M-class flare raises everyone's radiation automatically), `custom`.

`resolved.space_weather` is `null`, or the real DONKI event driving the radiation
(`{"id", "type", "time", "label", "link", "level", "replay": true|false}`); the simulator prints it.

### `GET /api/sim/scenario/`  (public)

```json
{
  "preset": "one_critical", "label": "One critical",
  "description": "The focus astronaut is red in the chosen system; everyone else is green.",
  "config": {"preset": "one_critical", "target": 2, "system": "cardiovascular", "custom": {},
             "cabin": {"level": "normal", "system": "co2"}, "anomaly_rate": 0.002},
  "resolved": {"mode": "fixed", "anomaly_rate": 0.002,
               "astronauts": {"1": {"level": "normal", "system": "cardiovascular"},
                              "2": {"level": "critical", "system": "cardiovascular"}, "…": "…"},
               "cabin": {"level": "normal", "system": "co2"}},
  "expected_status": {"1": "green", "2": "red", "3": "green", "4": "green"},
  "version": 2, "updated_at": "2026-11-15T00:40:19.512301+03:00", "updated_by": "surgeon",
  "presets": [{"key": "nominal", "label": "All nominal", "description": "…"}, "…"],
  "levels": ["normal", "caution", "critical"], "systems": {"…": "…"}, "cabin_systems": {"…": "…"}
}
```

`expected_status` is `null` for `realistic` (random).

### `POST /api/sim/scenario/`  (token, surgeon only)

```json
{"preset": "one_critical", "target": 2, "system": "respiratory", "reset": true, "apply_now": true}
{"preset": "custom",
 "custom": {"1": {"level": "caution", "system": "behavioral"}, "4": {"level": "critical", "system": "respiratory"}},
 "cabin": {"level": "caution", "system": "noise"}, "reset": true}
```

* `target` (astronaut id) is used by `one_caution`, `one_critical`, `mixed` and `several_caution` (everyone *except* the target).
* `system` is used by `one_caution`, `one_critical`, `mixed`.
* `space_weather` needs `event_id`: a real DONKI SEP event or M/X-class flare id from
  `GET /api/space-weather/` → `replay` (e.g. `"2026-07-04T20:29:00-FLR-001"`). SEP or X = critical
  (everyone + cabin radiation red), M = caution. Unknown ids give 400.
* `reset: true` resolves every open alert first, so the console starts clean.
* `apply_now: true` generates and saves one batch immediately (no waiting for the simulator).

Response: `{"scenario": {...same as GET...}, "reset": 7, "batch": {"saved": 112, "alerts": [...], "errors": []}}`.
400 with `{"error": "...", "errors": [...]}` for an unknown preset/system/astronaut; 401 without a token; 403 for astronauts.

### `POST /api/sim/reset/`  (token, surgeon only)

Resolves every open alert (sensor, check-in and PVT). `{"resolved": 11}`. `resolved_by` is the surgeon.

### `POST /api/sim/tick/`  (token, surgeon only)

Pushes one batch from the active scenario, exactly like one simulator tick. `201 {"saved": 112, "alerts": [...], "errors": []}`.

---

## NASA data

Details, numbers and limits: [NASA_DATA.md](NASA_DATA.md).

### `GET /api/space-weather/`  (public)

Real NASA DONKI events stored by `python manage.py fetch_donki` (`source: "live"`), merged with the
bundled cached snapshot `health/data/donki_snapshot.json` for older history (each event has its own
`source`). If nothing was fetched yet, everything comes from the snapshot (`source: "snapshot"`).

```json
{
  "source": "live", "fetched_at": "2026-11-14T22:03:19+00:00", "snapshot_fetched_at": "2026-11-14T22:03:34+00:00",
  "provider": "NASA DONKI (…)", "provider_url": "https://kauai.ccmc.gsfc.nasa.gov/DONKI/",
  "state": {"level": "quiet", "event": null, "reason": "No solar particle event, X-class or recent M-class flare in DONKI right now."},
  "latest": [{"id": "2026-11-11T21:06:00-FLR-001", "type": "FLR", "time": "2026-11-11T21:06Z", "class": "M1.7",
              "level": "caution", "label": "M1.7 solar flare", "impact": "…", "link": "https://ccmc.gsfc.nasa.gov/DONKI/view/FLR/49504/-1",
              "source": "live"}, "…"],
  "replay": [{"id": "2026-07-04T20:29:00-FLR-001", "type": "FLR", "label": "X1.3 solar flare", "level": "critical", "…": "…"}, "…"],
  "counts": {"FLR": 199, "SEP": 214, "CME": 113, "GST": 62},
  "mapping": {"SEP": "critical", "X-class flare": "critical", "M-class flare": "caution", "CME >= 1000 km/s": "caution", "GST": "info (near-Earth only)"},
  "note": "DONKI gives event times and classes, not the crew's dose; dose values are simulated."
}
```

`state.level` is `critical` (SEP in the last 48 h or X flare in the last 24 h), `caution`
(M flare in the last 6 h or CME ≥ 1000 km/s in the last 24 h) or `quiet`.

### `GET /api/nasa/reference/`  (public)

The whole `health/data/nasa_reference.json`: study titles, OSDR file URLs, publications, the
monitoring bands (`monitoring`), the consistent shifts (`shifted`) and the per-analyte tables.
The lab alert rules (metrics `serum_glucose`, `serum_calcium`, `serum_albumin`, `il6`, `tnf_alpha`,
`il10`, `mcp1`, `crp`, `urine_il6`, `urine_il8`, `urine_mpo`, `urine_lcn2`) are built from it; the
alert recommendation cites the study, e.g. *"… Inspiration4 crew: 3.703 pre-flight -> 6.64 pg/mL on
return day (x1.793, 4/4 crew; NASA OSDR OSD-575)."*

---

## Errors

The body is always JSON: `{"error": "..."}`.

- **400**: bad or missing parameter / body field (the message says which).
- **401**: login required, or the token is wrong/expired.
- **403**: logged in, but your role can't do this.
- **404**: unknown astronaut or alert id.
- **405**: wrong method (e.g. GET on `/api/auth/login/`).

---

## Calling it from JavaScript

The simulator writes a new batch about every 3 seconds, so poll on that interval.

```javascript
const API = "http://2.24.53.231:8000/api";   // or "/api" when the page is served by Django at /app/

// Public data: no login
async function loadCrew() {
  const res = await fetch(`${API}/crew/`);
  if (!res.ok) throw new Error((await res.json()).error);
  return (await res.json()).astronauts;
}

// Login once, keep the token
async function login(username, password) {
  const res = await fetch(`${API}/auth/login/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error);
  localStorage.setItem("token", body.token);
  return body.user;               // { username, name, role, astronaut_id }
}

// Any write: send the token
async function submitCheckin(data) {
  const res = await fetch(`${API}/checkins/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Token " + localStorage.getItem("token") },
    body: JSON.stringify(data),
  });
  const body = await res.json();
  if (res.status === 401) { /* token expired: go to the login page */ }
  if (!res.ok) throw new Error(body.error);
  return body;                    // { checkin, alerts, status }
}

loadCrew().then(console.log);
setInterval(() => loadCrew().then(console.log), 3000);
```

Test any GET by pasting it in a browser, or with curl:

```
curl http://2.24.53.231:8000/api/crew/
curl -X POST http://2.24.53.231:8000/api/auth/login/ -H "Content-Type: application/json" \
     -d '{"username":"sara","password":"astra2026"}'
```

## What the frontend should not call

`POST /api/webhook/readings/` is only for the device simulator (or a real device). It needs an HMAC signature made with the server's secret. See `device_simulator/README.md`.

## Gemini voice alerts

`POST /api/voice-alert/` requires a login token and a JSON body containing an `astronaut_id`.
It returns a WAV phrase such as “Sara is warning”. The Django server reads `GEMINI_API_KEY`
from its environment, calls Gemini TTS, and caches each astronaut's audio for 24 hours. The key
must never be put in frontend code. If Gemini is unavailable or not configured, the frontend
falls back to the browser's built-in speech voice.
On the astronaut's critical-alert popup, the warning repeats every 5 seconds until **I understand**
is clicked; repeats replay the cached audio.
On the public dashboard, opted-in voice announcements use neutral crew counts only, speak when
counts/severity change, and do not include astronaut names or medical details. The full active
count report repeats 5 seconds after each announcement until the visitor clicks **I understand**.
That button silences voice on that device only; it does not resolve the alert. A nominal
announcement is spoken once.

On Windows, add `GEMINI_API_KEY` as a user environment variable and restart VS Code/the terminal
before starting Django with `python manage.py runserver`. This endpoint uses Python's standard
library for the Gemini REST request, so no additional Python package is required.
