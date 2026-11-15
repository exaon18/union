# ASTRA HEALTH Device Simulator

A separate program that pretends to be the crew's wearables, patches, CGMs and cabin sensors,
and pushes real-time readings to the ASTRA HEALTH webhook.

```
Device Simulator  --HTTP POST (JSON + HMAC signature)-->  Django /api/webhook/readings/
                                                           -> saves SensorReading rows
                                                           -> runs sensor rules -> Alerts
```

## Run
Terminal 1 (Django):
```
python manage.py migrate
python manage.py seed_crew
python manage.py runserver
```
Terminal 2 (simulator):
```
python device_simulator/simulator.py               # follows the server's active scenario, every 3 s
python device_simulator/simulator.py --daily       # + sleep, PVT, urine calcium, etc. every batch
python device_simulator/simulator.py --scenario nominal   # ignore the server, always use one preset
python device_simulator/simulator.py --legacy --emergency 2   # the old random generator
```

## Scenarios (what gets sent)

Before every batch the simulator reads `GET /api/sim/scenario/` (derived from `--url`, or set
`--scenario-url`). The flight surgeon changes it in the **Simulation Lab**
(`http://<host>:8000/lab/`, a separate testing tool, not part of the crew app) or with `POST /api/sim/scenario/`, so a change shows up on the next tick.
If the server can't be reached it keeps the last scenario it saw (or "Random / realistic").

`scenarios.py` holds the presets and value bands:

* **normal**: values are drawn around each astronaut's baseline and **clamped inside the green
  range**, so a nominal astronaut never raises an alert.
* **caution / critical**: the chosen system's metrics are drawn inside the yellow / red band of
  `health/sensor_rules.py`.
* **Random / realistic** (default): nominal, plus a one-tick blip at `anomaly_rate` per astronaut
  per tick (yellow; red is 8× rarer). A blip clears itself about 2 minutes later.

Why the old simulator looked "all critical": its normal values were unclamped Gaussians, so the
tails regularly crossed thresholds (e.g. heart rate baseline + 15 ± 8 bpm passes 100), `--daily`
sent urine calcium (200 ± 25, yellow above 250) every 3 s, and `--emergency 2` kept one astronaut
red forever. With 4 astronauts × 13 metrics every 3 s, alerts piled up faster than they cleared.

`--emergency` and `--anomaly-rate` now only apply with `--legacy`.

The shared secret defaults to `astra-dev-secret`. To change it, set `ASTRA_WEBHOOK_SECRET`
to the same value in both terminals.

## NASA data in the simulated values

* **Lab markers** (sent with `--daily` and whenever an immune problem is active): serum glucose,
  calcium, albumin, IL-6, TNF-α, IL-10, MCP-1, CRP (OSD-575) and urine IL-6, IL-8, MPO, NGAL (OSD-656).
  Normal values are drawn inside the green band around the **real Inspiration4 pre-flight mean**; an
  `immune` problem shifts every cytokine/CRP/urine marker by **1.05-1.6×** (caution) or **2.1-2.8×**
  (critical) the **real return-day shift**. Bands: `health/data/nasa_reference.json` (see
  [NASA_DATA.md](../NASA_DATA.md)). If that file is missing, no lab markers are sent.
* **Radiation** follows real NASA DONKI space weather: in "Random / realistic" a real SEP event,
  X-class flare or recent M-class flare (stored by `manage.py fetch_donki`) raises everyone's
  radiation; "Replay real space weather" replays one past event. The simulator prints
  `space weather: NASA DONKI FLR 2026-07-04T20:29:00-FLR-001 (X1.3 solar flare) -> crew radiation critical`.
  DONKI gives timing and class, not a dose: the dose values are simulated (radiation bands above).

## Payload
```json
{"readings": [
  {"timestamp": "2026-11-14T12:30:00+00:00", "astronaut_id": 1, "source": "wearable",
   "metric": "heart_rate", "value": 82, "unit": "bpm"},
  {"timestamp": "2026-11-14T12:30:00+00:00", "astronaut_id": null, "source": "cabin",
   "metric": "co2", "value": 2600, "unit": "ppm"}
]}
```
Timestamps carry a UTC offset (the simulator sends UTC). A timestamp **without** an offset is
read as the server's `TIME_ZONE` (Africa/Addis_Ababa, EAT). Timestamps more than 5 minutes in
the future are clamped to the server's "now".
A real device would send exactly the same JSON to the same URL.
