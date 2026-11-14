# NASA data in ASTRA HEALTH

The crew is simulated, but three things come from real NASA data:

| What | Source | How it is used |
|------|--------|----------------|
| Serum lab bands: IL-6, TNF-α, IL-10, MCP-1, CRP, calcium, albumin, glucose | NASA OSDR **OSD-575** (SpaceX Inspiration4 serum: metabolic panel + Eve cytokine arrays) | normal range, yellow and red alert levels; immune scenario shift; Immune risk card |
| Urine inflammation bands: IL-6, IL-8 (CXCL8), MPO, NGAL (LCN2) | NASA OSDR **OSD-656** (Inspiration4 urine, Alamar NULISA panel) | same |
| Stress / DNA-repair genes on landing day | NASA OSDR **OSD-53** (6 Shuttle astronauts, whole-blood microarray, GSE47126) | context on the Immune risk card and the NASA Data page |
| Solar flares, solar energetic particle (SEP) events, CMEs, geomagnetic storms | **NASA DONKI** | when crew radiation goes up, alert citations, "Replay real event" |

Vitals (heart rate, SpO₂, BP, sleep, stress, cabin air) stay **simulated from published normal
ranges**; the UI says so. Lab values for our crew are simulated *inside* the real bands.

## OSDR: how the bands are built (`scripts/build_nasa_reference.py`)

```bash
python scripts/build_nasa_reference.py                 # downloads from OSDR, writes the two files below
python scripts/build_nasa_reference.py --cache /tmp/osdr   # keep the raw downloads for re-runs
```

1. File lists come from the OSDR API `https://osdr.nasa.gov/osdr/data/osd/files/{575,656,53}`, study
   titles/publications from `https://osdr.nasa.gov/osdr/data/osd/meta/{n}`. Files used:
   * OSD-575: `LSDS-8_Comprehensive_Metabolic_Panel_CMP.upload_SUBMITTED.csv`,
     `LSDS-8_Multiplex_serum.immune.EvePanel_SUBMITTED.csv`, `LSDS-8_Multiplex_serum.cardiovascular.EvePanel_SUBMITTED.csv`
   * OSD-656: `LSDS-64_Multiplex_urine.immune.AlamarPanel_TRANSFORMED.csv`, `LSDS-64_Multiplex_200plex v1-Target Information.csv`
   * OSD-53: `GLDS-53_microarray_E-GEOD-47126.additional.zip` (→ `GSE47126_Fold_change_data.txt`, the authors'
     table), probes mapped to genes with the GEO platform file GPL140.
2. **Pre-flight** = the Inspiration4 draws at L-92, L-44 and L-3 (4 crew, n ≈ 12 values); **return** = R+1.
   For each analyte: means, SDs, Δ = mean(R+1) − mean(pre-flight), and per crew member whether it went
   up or down. Recovery means at R+45 / R+82 / R+194 are kept too.
3. Fold change: concentrations → R+1 / pre-flight; OSD-656 NPQ values are log₂ → 2^Δ.
4. Only markers that moved **the same way in every crew member** are used for alerts.
5. Bands (μ = pre-flight mean, d = Δ):
   * green: μ − |d| … μ + 0.8·d (mirrored for markers that fall)
   * **yellow** at μ + d: as far from pre-flight as the crew's average on return day
   * **red** at μ + 2·d: beyond twice the change spaceflight caused
6. OSD-53: genes with p < 0.05 measured in ≥ 5 of 6 astronauts before and after flight.

Outputs (committed, small): `health/data/nasa_reference.json` (67 KB, with study titles, OSDR URLs,
DOIs, the tables) and `frontend/js/nasa-reference.js` (the same without the big tables). Raw files
are not committed.

### The numbers (built 2026-11-14)

| Marker | Study | Pre-flight mean ± SD | R+1 mean | Change | Crew | Yellow | Red |
|--------|-------|----------------------|----------|--------|------|--------|-----|
| IL-6 (pg/mL) | OSD-575 | 3.703 ± 1.124 | 6.64 | ×1.79 | 4/4 up | ≥ 6.64 | ≥ 9.58 |
| TNF-α (pg/mL) | OSD-575 | 179.4 ± 209.7 | 257.0 | ×1.43 | 4/4 up | ≥ 257.0 | ≥ 334.6 |
| IL-10 (pg/mL) | OSD-575 | 9.357 ± 3.793 | 13.95 | ×1.49 | 4/4 up | ≥ 13.95 | ≥ 18.55 |
| MCP-1 (pg/mL) | OSD-575 | 885.2 ± 365.6 | 1611.3 | ×1.82 | 4/4 up | ≥ 1611.3 | ≥ 2337.4 |
| CRP (mg/L) | OSD-575 | 17.71 ± 21.61 | 30.32 | ×1.71 | 4/4 up | ≥ 30.32 | ≥ 42.92 |
| Serum glucose (mg/dL) | OSD-575 | 75.33 ± 11.28 | 93.25 | ×1.24 | 4/4 up | ≥ 93.25 | ≥ 111.2 |
| Serum calcium (mg/dL) | OSD-575 | 9.825 ± 0.355 | 9.525 | ×0.97 | 4/4 down | ≤ 9.525 | ≤ 9.225 |
| Serum albumin (g/dL) | OSD-575 | 4.65 ± 0.284 | 4.5 | ×0.97 | 4/4 down | ≤ 4.5 | ≤ 4.35 |
| Urine IL-6 (NPQ) | OSD-656 | 12.05 ± 1.73 | 14.05 | ×3.99 | 3/3 up | ≥ 14.05 | ≥ 16.04 |
| Urine IL-8 (NPQ) | OSD-656 | 11.45 ± 1.51 | 15.37 | ×15.2 | 3/3 up | ≥ 15.37 | ≥ 19.30 |
| Urine MPO (NPQ) | OSD-656 | 5.404 ± 2.306 | 10.61 | ×37.0 | 3/3 up | ≥ 10.61 | ≥ 15.82 |
| Urine NGAL (NPQ) | OSD-656 | 9.068 ± 2.266 | 10.62 | ×2.93 | 3/3 up | ≥ 10.62 | ≥ 12.17 |

OSD-656 has 3 crew with an R+1 urine sample. OSD-53 genes (landing vs pre-flight, p < 0.05):
BAG1 ×0.37, HSP90 ×0.41, c-fos ×3.11, GPX1 ×0.52, XRCC1 ×0.45.

### Where it shows up

* `health/nasa.py` → `lab_rules()` adds the 12 lab metrics to `health/sensor_rules.py`; the
  recommendation cites the study, e.g. *"Repeat the sample and contact the flight surgeon.
  Inspiration4 crew: 3.703 pre-flight -> 6.64 pg/mL on return day (x1.793, 4/4 crew; NASA OSDR OSD-575)."*
  `frontend/js/rules.js` builds the same rules from `window.ASTRA_NASA`.
* `device_simulator/scenarios.py`: normal lab values inside green; an `immune` problem shifts every
  cytokine/CRP/urine marker by 1.05-1.6× (caution) or 2.1-2.8× (critical) the real shift.
* Immune risk card (My Health / Support Console detail) and the **NASA Data** page (`science.html`).

## DONKI: space weather (`health/donki.py`, `manage.py fetch_donki`)

```bash
python manage.py fetch_donki --days 30          # live; falls back to the cached snapshot
python manage.py fetch_donki --offline          # snapshot only
python manage.py fetch_donki --since 2024-01-01 --write-snapshot   # refresh the bundled snapshot
```

* Sources, in order: `https://api.nasa.gov/DONKI/{FLR,SEP,CME,GST}` with `NASA_API_KEY` (or
  `DEMO_KEY`), then the CCMC DONKI web service `https://ccmc.gsfc.nasa.gov/DONKI/WS/get/...` (and
  `kauai.ccmc.gsfc.nasa.gov`). Requests are split into ≤ 60-day chunks (DONKI's limit).
* **Honest status at build time (2026-11-14):** `api.nasa.gov/DONKI/FLR` answered 404 and
  `kauai.ccmc.gsfc.nasa.gov` failed, so the data came from `ccmc.gsfc.nasa.gov`. In the last 30 days
  DONKI listed 13 flares (all M-class or lower, the latest M1.7 on 2026-11-11), 0 SEP events, 88 CMEs and
  1 geomagnetic storm, so the live state is *quiet*. The newest SEP event in the snapshot is
  2026-09-05 and the newest X-class flare 2026-07-04 (X1.3): use "Replay real event" to see a storm.
* Bundled snapshot `health/data/donki_snapshot.json` (2024-01-01 → 2026-11-14, fetched 2026-11-14):
  every SEP event, X-class flare and geomagnetic storm, plus M-class flares and fast CMEs from the
  last 180 days; labelled *cached snapshot* in the UI. `frontend/js/donki-snapshot.js` is the same
  for mock mode.

Mapping (prototype):

| DONKI event | Crew effect | Window |
|-------------|-------------|--------|
| SEP | critical: dose + cabin radiation red, "shelter in the storm shelter" | 48 h |
| X-class flare | critical | 24 h |
| M-class flare | caution | 6 h |
| CME ≥ 1000 km/s | caution | 24 h |
| Geomagnetic storm | info only (Earth / low orbit) | n/a |

* In **Random / realistic**, an event inside its window raises everyone's radiation (crew + cabin).
* **Replay real space weather** (Scenario Control) replays any SEP or M/X flare by its DONKI id.
* New radiation alerts get the cause appended: *"… Cause: NASA DONKI X1.3 solar flare,
  2026-07-04T20:29:00-FLR-001 (2026-07-04 20:29 UTC)."*
* `fetch_donki` raises one cabin alert for a new SEP / X event from the last 48 h.
* Panels: Mission dashboard, Support Console, Scenario Control, NASA Data page; every event links to DONKI.

**Limit:** DONKI gives event times and classes, not the dose our crew would get. Dose values are
still simulated (radiation bands in `scenarios.py`).

## Limits

* Inspiration4: 4 civilians, 3 days in low Earth orbit; OSD-53: 6 Shuttle astronauts. Small samples:
  these are demo bands, not clinical reference ranges.
* R+1 mixes spaceflight with re-entry and landing stress.
* NPQ (urine) is relative and only comparable within the same assay.
