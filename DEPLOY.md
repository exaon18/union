# Deploying the `backend` branch to the VPS

The VPS (`2.24.53.231`) runs two systemd services from `~/astra`:

* `astra`: gunicorn serving Django on port 8000 (2 workers)
* `astra-sim`: `device_simulator/simulator.py` posting to `http://127.0.0.1:8000/api/webhook/readings/`

Secrets and settings live in `~/astra/.env.prod` (`DJANGO_SECRET_KEY`, `DJANGO_DEBUG=False`,
`DJANGO_ALLOWED_HOSTS`, `ASTRA_WEBHOOK_SECRET`). Nothing in this branch changes that file.

## 1. Update the code and database

The commands assume the virtualenv folder is `~/astra/venv`. If yours has another name
(for example `.venv`), change `venv/bin/...` to match (`ls ~/astra` shows it).

```bash
cd ~/astra && git fetch && git checkout backend && git pull \
  && venv/bin/pip install -r requirements.txt \
  && venv/bin/python manage.py migrate \
  && venv/bin/python manage.py seed_crew \
  && sudo systemctl restart astra astra-sim
```

* `migrate` adds login tokens, PVT results, alert acknowledge/resolve fields, and the
  database indexes that make the read API fast. It can take a minute on a big database.
* `seed_crew` is safe to re-run. It (re)sets the 4 astronauts and adds the `surgeon` login.
  All passwords are `astra2026`.

## 2. One-time cleanup after this update

The old simulator saved readings **3 hours in the future** (time-zone bug, now fixed). The API
already ignores future readings, but delete them and trim old data:

```bash
cd ~/astra && venv/bin/python manage.py prune_readings --keep-hours 48 --drop-future --vacuum
```

Optional, to fill the 7-day charts (sleep, PVT, radiation) with history:

```bash
cd ~/astra && venv/bin/python manage.py seed_history --days 7
```

Old open sensor alerts close by themselves on the next simulator batch (anything over 30 min).

## 3. Check it

```bash
curl -s http://127.0.0.1:8000/api/ | head -c 300; echo
curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" "http://127.0.0.1:8000/api/readings/latest/?astronaut=2"
curl -s -X POST http://127.0.0.1:8000/api/auth/login/ -H 'Content-Type: application/json' \
     -d '{"username":"surgeon","password":"astra2026"}' | head -c 200; echo
sudo journalctl -u astra-sim -n 5 --no-pager          # "saved 60" every 3 s
```

`readings/latest` should answer in well under a second (before this update it timed out).

## 4. Keep the database small (recommended)

Readings grow by ~1.7 million rows a day at one batch every 3 s. Prune hourly with cron
(`crontab -e`):

```
0 * * * * cd /home/USER/astra && venv/bin/python manage.py prune_readings --keep-hours 48 >> /tmp/prune.log 2>&1
```

## The frontend: one URL (crew app at `/app/`, Simulation Lab at `/lab/`)

Django serves the static frontend (`frontend/`) at **`/app/`**:

```
http://2.24.53.231:8000/app/      crew health app (astronauts, flight surgeon, public dashboard)
http://2.24.53.231:8000/lab/      Simulation Lab: testing tool, own sign-in (flight surgeon), from lab/
```

Served from there, the frontend calls the same server's `/api` automatically (no CORS or
mixed-content issues). It works with `DEBUG=False` and needs no nginx or whitenoise.
(The Django admin's CSS is still not served with `DEBUG=False`; the JSON API and `/app/` are not affected.)

Teammates can also host `frontend/` anywhere else (or run `python3 -m http.server 5500` in
`frontend/`). Then it calls `http://2.24.53.231:8000/api` by default. To point it at
another backend, open any page once with `?api_base=http://127.0.0.1:8000/api` (saved in
the browser; `?api_base=reset` goes back to the default).

## Simulator and the Simulation Lab

`astra-sim` now follows the **active scenario** stored on the server. Before every batch it calls
`GET http://127.0.0.1:8000/api/sim/scenario/` (derived from its `--url`), so nothing else needs
configuring. The flight surgeon picks a scenario in the **Simulation Lab** at
**`http://2.24.53.231:8000/lab/`** (a testing tool with its own header and login, kept out of the
crew app; the old `/app/scenarios.html` redirects there)
(All nominal, One caution, One critical, Several caution, All critical, Cabin CO2, Radiation storm,
Random / realistic, Custom). The change shows up within one tick (3 s); "Apply" can also resolve
old alerts and push a batch at once. The default is "Random / realistic" (mostly green).

After pulling this update:

```bash
cd ~/astra && git pull \
  && venv/bin/python manage.py migrate \
  && sudo systemctl restart astra astra-sim
sudo journalctl -u astra-sim -n 5 --no-pager      # "scenario v0: Random / realistic", then "sent ... alerts 0"
curl -s http://127.0.0.1:8000/api/sim/scenario/ | head -c 200; echo
```

`migrate` adds one small table (`health_simscenario`). If the service's `ExecStart` still has
`--emergency 2` or `--anomaly-rate`, those flags are now ignored (they only apply with `--legacy`).
You can remove them with `sudo systemctl edit --full astra-sim`, then
`sudo systemctl daemon-reload && sudo systemctl restart astra-sim`.

To clear everything the old simulator left open, open the Simulation Lab (`/lab/`) and press **Reset alerts**,
or:

```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:8000/api/auth/login/ -H 'Content-Type: application/json' \
  -d '{"username":"surgeon","password":"astra2026"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
curl -s -X POST http://127.0.0.1:8000/api/sim/scenario/ -H "Authorization: Token $TOKEN" \
  -H 'Content-Type: application/json' -d '{"preset":"nominal","reset":true,"apply_now":true}' | head -c 200; echo
```

## NASA data (OSDR + DONKI)

After pulling the NASA data update:

```bash
cd ~/astra && git pull \
  && venv/bin/python manage.py migrate \
  && venv/bin/python manage.py fetch_donki --days 30 \
  && sudo systemctl restart astra astra-sim
curl -s http://127.0.0.1:8000/api/space-weather/ | head -c 300; echo
sudo journalctl -u astra-sim -n 5 --no-pager
```

* `migrate` adds the `health_spaceweatherevent` table.
* `fetch_donki` downloads real flares, SEP events, CMEs and geomagnetic storms. It tries
  `api.nasa.gov` with `NASA_API_KEY` (falls back to `DEMO_KEY`), then the CCMC DONKI service (no key
  needed). If both fail it loads the bundled snapshot and says so. A new SEP event or X-class flare
  from the last 48 h raises a cabin radiation alert.
* Keep it fresh with cron (`crontab -e`), e.g. every 3 hours:

  ```
  0 */3 * * * cd /home/USER/astra && NASA_API_KEY=your_key venv/bin/python manage.py fetch_donki --days 7 >> /home/USER/donki.log 2>&1
  ```

  A free key: https://api.nasa.gov/ (leave `NASA_API_KEY=` out to use `DEMO_KEY`).
* The OSDR bands are committed (`health/data/nasa_reference.json`, `frontend/js/nasa-reference.js`);
  nothing to download on the VPS. To rebuild them: `venv/bin/python scripts/build_nasa_reference.py`.

## Optional tuning (`.env.prod`)

| variable | default | meaning |
|----------|---------|---------|
| `ASTRA_ALERT_DEDUP_MINUTES` | 5 | no duplicate open alert for the same astronaut+metric+level within N min |
| `ASTRA_ALERT_CLEAR_AFTER_SECONDS` | 120 | sensor alert closes when the metric is back in range and the alert is this old |
| `ASTRA_ALERT_AUTO_RESOLVE_MINUTES` | 30 | open sensor alerts older than this close automatically |
| `ASTRA_TOKEN_TTL_HOURS` | 72 | login token lifetime |
| `DJANGO_CORS_ALLOWED_ORIGINS` | (all) | comma-separated origins allowed to call the API |
| `NASA_API_KEY` | `DEMO_KEY` | api.nasa.gov key for `fetch_donki` (CCMC fallback needs none) |
