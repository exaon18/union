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
python device_simulator/simulator.py               # normal data every 3 s
python device_simulator/simulator.py --daily       # + sleep, PVT, urine calcium, etc.
python device_simulator/simulator.py --emergency 2 # force a red alert for astronaut 2 (demo)
python device_simulator/simulator.py --anomaly-rate 0.05  # lots of random abnormal readings
```

`--anomaly-rate` is the chance that any one reading is abnormal. The default, `0.0005`, gives
an occasional yellow or red blip per astronaut every few minutes, so the healthy crew stay
mostly green. The emergency astronaut's heart rate, SpO₂ and ECG readings **replace** the
normal ones, so there's no duplicate reading for the same metric.

The shared secret defaults to `astra-dev-secret`. To change it, set `ASTRA_WEBHOOK_SECRET`
to the same value in both terminals.

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
