# ASTRA HEALTH API

A short guide for the frontend team. You do not need to know Django.

The backend stores live sensor readings and alerts. Your job is to **call a URL and use the JSON that comes back**. JSON is just structured text that looks like `{"metric": "heart_rate", "value": 72}`.

## Base URL

```
http://2.24.53.231:8000
```

This is a **plain HTTP address (an IP, no HTTPS and no domain yet)**. Open any path below after this base URL in a browser or in JavaScript `fetch`.

If your frontend is served over HTTPS, the browser may block these HTTP calls (mixed content). During the hackathon, serve the frontend over HTTP or open the API URLs directly to test.

All times are ISO 8601 strings, for example `2026-11-14T21:07:32+00:00`.

The server allows browser calls from any website (CORS). Only GET is public. Do not call the webhook from the frontend.

The examples below are **real responses** from a test run with the 4 demo astronauts and the device simulator (including an emergency for astronaut 2, Sara Tesfaye). Numbers on the live server will keep changing.

Demo crew:

| id | name | role |
|----|------|------|
| 1 | Abebe Kebede | Commander |
| 2 | Sara Tesfaye | Flight Engineer |
| 3 | Dawit Haile | Medical Officer |
| 4 | Hana Girma | Mission Specialist |

---

## `GET /api/`

Lists every endpoint. Useful as a quick reminder.

`http://2.24.53.231:8000/api/`

```json
{
  "name": "ASTRA HEALTH API",
  "description": "Read-only JSON API for live crew, cabin, reading, alert and check-in data.",
  "endpoints": [
    {
      "method": "GET",
      "path": "/api/",
      "description": "This index."
    },
    {
      "method": "GET",
      "path": "/api/crew/",
      "description": "All astronauts with overall status and open alert counts."
    },
    {
      "method": "GET",
      "path": "/api/crew/<id>/",
      "description": "One astronaut, including personal baselines."
    },
    {
      "method": "GET",
      "path": "/api/readings/latest/",
      "description": "Newest reading per metric. Pass ?astronaut=<id> or ?source=cabin."
    },
    {
      "method": "GET",
      "path": "/api/cabin/latest/",
      "description": "Newest cabin/environment reading per metric (no astronaut)."
    },
    {
      "method": "GET",
      "path": "/api/readings/history/",
      "description": "Time series, oldest first. Requires ?astronaut=<id>&metric=<name>. Optional &hours=24&limit=500."
    },
    {
      "method": "GET",
      "path": "/api/alerts/",
      "description": "Alerts, newest first. Optional ?astronaut=<id>&level=red&resolved=false&limit=50."
    },
    {
      "method": "GET",
      "path": "/api/checkins/",
      "description": "Recent daily check-ins, newest first. Optional ?astronaut=<id>&limit=30."
    },
    {
      "method": "POST",
      "path": "/api/webhook/readings/",
      "description": "Device webhook. HMAC-signed. Not for the frontend."
    }
  ]
}
```

---

## `GET /api/crew/`

All astronauts, with an overall status and how many unresolved alerts they have.

- **status** is the worst unresolved alert: `red`, `yellow`, or `green` if there are none.
- **open_alerts** is the number of unresolved alerts.
- **last_reading_at** is the timestamp of that person's newest sensor reading, or `null`.

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
      "status": "yellow",
      "open_alerts": 3,
      "last_reading_at": "2026-11-14T21:07:32+00:00"
    },
    {
      "id": 2,
      "name": "Sara Tesfaye",
      "mission": "Artemis Mars Transit",
      "role": "Flight Engineer",
      "status": "red",
      "open_alerts": 12,
      "last_reading_at": "2026-11-14T21:07:32+00:00"
    },
    {
      "id": 3,
      "name": "Dawit Haile",
      "mission": "Artemis Mars Transit",
      "role": "Medical Officer",
      "status": "yellow",
      "open_alerts": 4,
      "last_reading_at": "2026-11-14T21:07:32+00:00"
    },
    {
      "id": 4,
      "name": "Hana Girma",
      "mission": "Artemis Mars Transit",
      "role": "Mission Specialist",
      "status": "red",
      "open_alerts": 4,
      "last_reading_at": "2026-11-14T21:07:32+00:00"
    }
  ]
}
```

---

## `GET /api/crew/<id>/`

One astronaut, plus personal baselines (the "normal" heart rate and blood pressure used by the rule engine).

`http://2.24.53.231:8000/api/crew/2/`

```json
{
  "id": 2,
  "name": "Sara Tesfaye",
  "mission": "Artemis Mars Transit",
  "role": "Flight Engineer",
  "status": "red",
  "open_alerts": 12,
  "last_reading_at": "2026-11-14T21:07:32+00:00",
  "baselines": {
    "heart_rate": 68,
    "systolic_bp": 112,
    "diastolic_bp": 72
  }
}
```

If `id` is not a number, the API returns **400**. If that astronaut does not exist, **404**:

```json
{
  "error": "unknown astronaut 99"
}
```

---

## `GET /api/readings/latest/`

The newest reading for each metric.

- Required: `?astronaut=<id>` **or** `?source=cabin`
- Optional: `?hours=48` (only looks at recent rows; default 48)

`http://2.24.53.231:8000/api/readings/latest/?astronaut=2`

```json
{
  "astronaut_id": 2,
  "astronaut": "Sara Tesfaye",
  "count": 26,
  "readings": [
    {
      "metric": "blood_glucose",
      "value": 94.0,
      "text_value": "",
      "unit": "mg/dL",
      "source": "cgm",
      "timestamp": "2026-11-14T21:07:32+00:00"
    },
    {
      "metric": "body_mass",
      "value": 72.5,
      "text_value": "",
      "unit": "kg",
      "source": "mass_device",
      "timestamp": "2026-11-14T21:07:32+00:00"
    },
    {
      "metric": "body_temperature",
      "value": 36.9,
      "text_value": "",
      "unit": "°C",
      "source": "patch",
      "timestamp": "2026-11-14T21:07:32+00:00"
    },
    {
      "metric": "calories_burned",
      "value": 2258.0,
      "text_value": "",
      "unit": "kcal",
      "source": "wearable",
      "timestamp": "2026-11-14T21:07:32+00:00"
    },
    {
      "metric": "diastolic_bp",
      "value": 67.0,
      "text_value": "",
      "unit": "mmHg",
      "source": "bp_cuff",
      "timestamp": "2026-11-14T21:07:32+00:00"
    },
    {
      "metric": "distance",
      "value": 4.3,
      "text_value": "",
      "unit": "km",
      "source": "wearable",
      "timestamp": "2026-11-14T21:07:32+00:00"
    },
    {
      "metric": "ecg_rhythm",
      "value": null,
      "text_value": "irregular",
      "unit": "",
      "source": "patch",
      "timestamp": "2026-11-14T21:07:32+00:00"
    },
    {
      "metric": "exercise_minutes",
      "value": 125.0,
      "text_value": "",
      "unit": "min",
      "source": "wearable",
      "timestamp": "2026-11-14T21:07:32+00:00"
    },
    {
      "metric": "grip_strength",
      "value": 42.5,
      "text_value": "",
      "unit": "kg",
      "source": "dynamometer",
      "timestamp": "2026-11-14T21:07:32+00:00"
    },
    {
      "metric": "heart_rate",
      "value": 132.0,
      "text_value": "",
      "unit": "bpm",
      "source": "wearable",
      "timestamp": "2026-11-14T21:07:32+00:00"
    },
    {
      "metric": "hrv",
      "value": 60.0,
      "text_value": "",
      "unit": "ms",
      "source": "wearable",
      "timestamp": "2026-11-14T21:07:32+00:00"
    },
    {
      "metric": "pvt_lapses",
      "value": 0.0,
      "text_value": "",
      "unit": "count",
      "source": "pvt_test",
      "timestamp": "2026-11-14T21:07:32+00:00"
    },
    {
      "metric": "pvt_reaction_time",
      "value": 255.0,
      "text_value": "",
      "unit": "ms",
      "source": "pvt_test",
      "timestamp": "2026-11-14T21:07:32+00:00"
    },
    {
      "metric": "radiation_dose",
      "value": 0.55,
      "text_value": "",
      "unit": "mSv/day",
      "source": "dosimeter",
      "timestamp": "2026-11-14T21:07:32+00:00"
    },
    {
      "metric": "recovery_score",
      "value": 79.0,
      "text_value": "",
      "unit": "0-100",
      "source": "wearable",
      "timestamp": "2026-11-14T21:07:32+00:00"
    },
    {
      "metric": "respiration_rate",
      "value": 17.0,
      "text_value": "",
      "unit": "breaths/min",
      "source": "patch",
      "timestamp": "2026-11-14T21:07:32+00:00"
    },
    {
      "metric": "resting_heart_rate",
      "value": 67.0,
      "text_value": "",
      "unit": "bpm",
      "source": "wearable",
      "timestamp": "2026-11-14T21:07:32+00:00"
    },
    {
      "metric": "skin_temperature",
      "value": 33.4,
      "text_value": "",
      "unit": "°C",
      "source": "wearable",
      "timestamp": "2026-11-14T21:07:32+00:00"
    },
    {
      "metric": "sleep_deep",
      "value": 1.7,
      "text_value": "",
      "unit": "h",
      "source": "wearable",
      "timestamp": "2026-11-14T21:07:32+00:00"
    },
    {
      "metric": "sleep_light",
      "value": 4.5,
      "text_value": "",
      "unit": "h",
      "source": "wearable",
      "timestamp": "2026-11-14T21:07:32+00:00"
    },
    {
      "metric": "sleep_rem",
      "value": 1.9,
      "text_value": "",
      "unit": "h",
      "source": "wearable",
      "timestamp": "2026-11-14T21:07:32+00:00"
    },
    {
      "metric": "sleep_total",
      "value": 8.1,
      "text_value": "",
      "unit": "h",
      "source": "wearable",
      "timestamp": "2026-11-14T21:07:32+00:00"
    },
    {
      "metric": "spo2",
      "value": 87.0,
      "text_value": "",
      "unit": "%",
      "source": "patch",
      "timestamp": "2026-11-14T21:07:32+00:00"
    },
    {
      "metric": "stress_level",
      "value": 44.0,
      "text_value": "",
      "unit": "0-100",
      "source": "wearable",
      "timestamp": "2026-11-14T21:07:32+00:00"
    },
    {
      "metric": "systolic_bp",
      "value": 155.0,
      "text_value": "",
      "unit": "mmHg",
      "source": "bp_cuff",
      "timestamp": "2026-11-14T21:07:32+00:00"
    },
    {
      "metric": "urine_calcium",
      "value": 302.0,
      "text_value": "",
      "unit": "mg/day",
      "source": "lab",
      "timestamp": "2026-11-14T21:07:32+00:00"
    }
  ]
}
```

Cabin sensors (no astronaut):

`http://2.24.53.231:8000/api/readings/latest/?source=cabin`

This returns the same JSON as `GET /api/cabin/latest/` (see the next section).

A numeric metric uses **value** (and an empty **text_value**). A non-numeric metric such as `ecg_rhythm` uses **text_value** (and **value** is `null`).

---

## `GET /api/cabin/latest/`

Newest cabin / environment reading per metric (CO2, O2, temperature, and so on). These rows have no astronaut.

`http://2.24.53.231:8000/api/cabin/latest/`

```json
{
  "source": "cabin",
  "count": 8,
  "readings": [
    {
      "metric": "cabin_pressure",
      "value": 100.8,
      "text_value": "",
      "unit": "kPa",
      "source": "cabin",
      "timestamp": "2026-11-14T21:07:32+00:00"
    },
    {
      "metric": "cabin_radiation",
      "value": 0.45,
      "text_value": "",
      "unit": "mSv/day",
      "source": "cabin",
      "timestamp": "2026-11-14T21:07:32+00:00"
    },
    {
      "metric": "cabin_temperature",
      "value": 20.7,
      "text_value": "",
      "unit": "°C",
      "source": "cabin",
      "timestamp": "2026-11-14T21:07:32+00:00"
    },
    {
      "metric": "co2",
      "value": 2297.0,
      "text_value": "",
      "unit": "ppm",
      "source": "cabin",
      "timestamp": "2026-11-14T21:07:32+00:00"
    },
    {
      "metric": "humidity",
      "value": 40.0,
      "text_value": "",
      "unit": "%",
      "source": "cabin",
      "timestamp": "2026-11-14T21:07:32+00:00"
    },
    {
      "metric": "noise",
      "value": 52.0,
      "text_value": "",
      "unit": "dB",
      "source": "cabin",
      "timestamp": "2026-11-14T21:07:32+00:00"
    },
    {
      "metric": "o2",
      "value": 21.0,
      "text_value": "",
      "unit": "%",
      "source": "cabin",
      "timestamp": "2026-11-14T21:07:32+00:00"
    },
    {
      "metric": "voc",
      "value": 0.33,
      "text_value": "",
      "unit": "mg/m³",
      "source": "cabin",
      "timestamp": "2026-11-14T21:07:32+00:00"
    }
  ]
}
```

---

## `GET /api/readings/history/`

A time series for one metric, **oldest first** (good for charts).

Query parameters:

| param | required | default | meaning |
|-------|----------|---------|---------|
| `astronaut` | yes | | astronaut id |
| `metric` | yes | | e.g. `heart_rate`, `spo2`, `co2` |
| `hours` | no | 24 | how far back to look |
| `limit` | no | 500 | max points (keeps the most recent if there are more) |

`http://2.24.53.231:8000/api/readings/history/?astronaut=2&metric=heart_rate&hours=24&limit=500`

```json
{
  "astronaut_id": 2,
  "astronaut": "Sara Tesfaye",
  "metric": "heart_rate",
  "hours": 24,
  "count": 6,
  "readings": [
    {
      "metric": "heart_rate",
      "value": 78.0,
      "text_value": "",
      "unit": "bpm",
      "source": "wearable",
      "timestamp": "2026-11-14T21:07:30+00:00"
    },
    {
      "metric": "heart_rate",
      "value": 137.0,
      "text_value": "",
      "unit": "bpm",
      "source": "wearable",
      "timestamp": "2026-11-14T21:07:30+00:00"
    },
    {
      "metric": "heart_rate",
      "value": 80.0,
      "text_value": "",
      "unit": "bpm",
      "source": "wearable",
      "timestamp": "2026-11-14T21:07:31+00:00"
    },
    {
      "metric": "heart_rate",
      "value": 131.0,
      "text_value": "",
      "unit": "bpm",
      "source": "wearable",
      "timestamp": "2026-11-14T21:07:31+00:00"
    },
    {
      "metric": "heart_rate",
      "value": 84.0,
      "text_value": "",
      "unit": "bpm",
      "source": "wearable",
      "timestamp": "2026-11-14T21:07:32+00:00"
    },
    {
      "metric": "heart_rate",
      "value": 132.0,
      "text_value": "",
      "unit": "bpm",
      "source": "wearable",
      "timestamp": "2026-11-14T21:07:32+00:00"
    }
  ]
}
```

There are two heart-rate points at some timestamps because the emergency demo adds an extra reading in the same batch as the normal wearable reading.

---

## `GET /api/alerts/`

Alerts, **newest first**.

Query parameters (all optional):

| param | default | meaning |
|-------|---------|---------|
| `astronaut` | all crew | filter to one astronaut |
| `level` | all | `green`, `yellow`, or `red` |
| `resolved` | all | `true` or `false` |
| `limit` | 50 | max rows |

`http://2.24.53.231:8000/api/alerts/?astronaut=2&level=red&resolved=false&limit=50`

```json
{
  "count": 10,
  "alerts": [
    {
      "id": 19,
      "astronaut_id": 2,
      "astronaut": "Sara Tesfaye",
      "system": "cardiovascular",
      "level": "red",
      "message": "Irregular heart rhythm detected",
      "recommendation": "Record a full ECG and contact the flight surgeon.",
      "resolved": false,
      "created_at": "2026-11-14T18:07:33.075419+00:00"
    },
    {
      "id": 18,
      "astronaut_id": 2,
      "astronaut": "Sara Tesfaye",
      "system": "cardiovascular",
      "level": "red",
      "message": "Low blood oxygen: 87 %",
      "recommendation": "Check cabin O2 and breathe supplemental oxygen; contact mission support.",
      "resolved": false,
      "created_at": "2026-11-14T18:07:33.074378+00:00"
    },
    {
      "id": 17,
      "astronaut_id": 2,
      "astronaut": "Sara Tesfaye",
      "system": "cardiovascular",
      "level": "red",
      "message": "Very high heart rate: 132 bpm",
      "recommendation": "Stop activity, rest 15 min and re-measure. Contact mission support if it persists.",
      "resolved": false,
      "created_at": "2026-11-14T18:07:33.073133+00:00"
    },
    {
      "id": 16,
      "astronaut_id": 2,
      "astronaut": "Sara Tesfaye",
      "system": "musculoskeletal",
      "level": "red",
      "message": "High urine calcium (bone loss / kidney stone risk): 302 mg/day",
      "recommendation": "Increase water intake and resistance exercise; inform the flight surgeon.",
      "resolved": false,
      "created_at": "2026-11-14T18:07:33.070242+00:00"
    },
    {
      "id": 13,
      "astronaut_id": 2,
      "astronaut": "Sara Tesfaye",
      "system": "cardiovascular",
      "level": "red",
      "message": "Irregular heart rhythm detected",
      "recommendation": "Record a full ECG and contact the flight surgeon.",
      "resolved": false,
      "created_at": "2026-11-14T18:07:31.852611+00:00"
    },
    {
      "id": 12,
      "astronaut_id": 2,
      "astronaut": "Sara Tesfaye",
      "system": "cardiovascular",
      "level": "red",
      "message": "Low blood oxygen: 90 %",
      "recommendation": "Check cabin O2 and breathe supplemental oxygen; contact mission support.",
      "resolved": false,
      "created_at": "2026-11-14T18:07:31.848936+00:00"
    },
    {
      "id": 11,
      "astronaut_id": 2,
      "astronaut": "Sara Tesfaye",
      "system": "cardiovascular",
      "level": "red",
      "message": "Very high heart rate: 131 bpm",
      "recommendation": "Stop activity, rest 15 min and re-measure. Contact mission support if it persists.",
      "resolved": false,
      "created_at": "2026-11-14T18:07:31.845881+00:00"
    },
    {
      "id": 4,
      "astronaut_id": 2,
      "astronaut": "Sara Tesfaye",
      "system": "cardiovascular",
      "level": "red",
      "message": "Irregular heart rhythm detected",
      "recommendation": "Record a full ECG and contact the flight surgeon.",
      "resolved": false,
      "created_at": "2026-11-14T18:07:30.660721+00:00"
    },
    {
      "id": 3,
      "astronaut_id": 2,
      "astronaut": "Sara Tesfaye",
      "system": "cardiovascular",
      "level": "red",
      "message": "Low blood oxygen: 88 %",
      "recommendation": "Check cabin O2 and breathe supplemental oxygen; contact mission support.",
      "resolved": false,
      "created_at": "2026-11-14T18:07:30.657856+00:00"
    },
    {
      "id": 2,
      "astronaut_id": 2,
      "astronaut": "Sara Tesfaye",
      "system": "cardiovascular",
      "level": "red",
      "message": "Very high heart rate: 137 bpm",
      "recommendation": "Stop activity, rest 15 min and re-measure. Contact mission support if it persists.",
      "resolved": false,
      "created_at": "2026-11-14T18:07:30.654572+00:00"
    }
  ]
}
```

---

## `GET /api/checkins/`

Recent daily check-in forms, **newest first**.

Optional: `?astronaut=<id>` and `?limit=30` (default 30).

`http://2.24.53.231:8000/api/checkins/?astronaut=1`

```json
{
  "count": 1,
  "checkins": [
    {
      "id": 1,
      "astronaut_id": 1,
      "created_at": "2026-11-14T18:07:03.151982+00:00",
      "heart_rate": 64,
      "systolic_bp": 118,
      "diastolic_bp": 76,
      "temperature": 36.6,
      "exercise_minutes": 45,
      "sleep_hours": 7.2,
      "mood": 4,
      "stress": 2,
      "radiation_msv": 0.4,
      "symptoms": ""
    }
  ]
}
```

---

## Errors

The body is always JSON: `{"error": "..."}`.

- **400** — a query parameter is missing or not the right type (for example `?astronaut=foo`).
- **404** — that astronaut id does not exist.

---

## Calling it from JavaScript

The simulator writes a new batch about every 3 seconds, so poll on that interval.

```javascript
const BASE = "http://2.24.53.231:8000";

async function loadCrew() {
  const res = await fetch(`${BASE}/api/crew/`);
  if (!res.ok) {
    console.error("crew request failed", res.status, await res.json());
    return;
  }
  const data = await res.json();
  console.log(data.astronauts);
}

async function loadLatest(astronautId) {
  const res = await fetch(`${BASE}/api/readings/latest/?astronaut=${astronautId}`);
  const data = await res.json();
  console.log(data.readings);
}

// First load, then refresh every 3 seconds
loadCrew();
loadLatest(2);
setInterval(() => {
  loadCrew();
  loadLatest(2);
}, 3000);
```

You can test any URL by pasting it into a browser, or with:

```
curl http://2.24.53.231:8000/api/crew/
```

## What the frontend should not call

`POST /api/webhook/readings/` is only for the device simulator (or a real device). It requires a secret signature. The frontend should only use the GET URLs above.
