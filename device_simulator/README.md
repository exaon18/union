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
```

The shared secret defaults to `astra-dev-secret`. To change it, set `ASTRA_WEBHOOK_SECRET`
to the same value in both terminals.

## Payload
```json
{"readings": [
  {"timestamp": "2026-11-14T15:30:00", "astronaut_id": 1, "source": "wearable",
   "metric": "heart_rate", "value": 82, "unit": "bpm"},
  {"timestamp": "2026-11-14T15:30:00", "astronaut_id": null, "source": "cabin",
   "metric": "co2", "value": 2600, "unit": "ppm"}
]}
```
A real device would send exactly the same JSON to the same URL.
