#!/usr/bin/env python3
"""
Rebuild health/data/nasa_reference.json (and frontend/js/nasa-reference.js) from REAL NASA
Open Science Data Repository (OSDR) files. Standard library only.

    python scripts/build_nasa_reference.py              # download from osdr.nasa.gov and rebuild
    python scripts/build_nasa_reference.py --cache DIR  # keep / reuse the raw downloads in DIR

Sources (downloaded through the OSDR APIs):
  OSD-575  Inspiration4 serum: Comprehensive Metabolic Panel + immune and cardiovascular multiplex
           https://osdr.nasa.gov/osdr/data/osd/files/575
  OSD-656  Inspiration4 urine: Alamar NULISA inflammation panel (NPQ, log2 scale)
           https://osdr.nasa.gov/osdr/data/osd/files/656
  OSD-53   Astronaut whole blood, stress-gene microarray (6 Shuttle astronauts, L-10 vs R+0)
           https://osdr.nasa.gov/osdr/data/osd/files/53
           probe -> gene names from the GEO platform GPL140 (the array the study used)

Everything written is derived from those files: means, SDs, fold changes and the number of crew
whose value moved in the same direction. Nothing is invented. Only the small derived JSON is
committed; the raw files stay in the cache directory.
"""
import argparse
import csv
import io
import json
import math
import re
import statistics as st
import sys
import urllib.request
import zipfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_JSON = ROOT / "health" / "data" / "nasa_reference.json"
OUT_JS = ROOT / "frontend" / "js" / "nasa-reference.js"
OSDR = "https://osdr.nasa.gov"
FILES_API = OSDR + "/osdr/data/osd/files/{n}"
META_API = OSDR + "/osdr/data/osd/meta/{n}"
GPL140 = "https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GPL140&targ=self&form=text&view=data"
PRE = ("L-92", "L-44", "L-3")        # Inspiration4 pre-flight draws (days before launch)
RET = "R+1"                           # first day after return

FILES = {
    "cmp": (575, "LSDS-8_Comprehensive_Metabolic_Panel_CMP.upload_SUBMITTED.csv"),
    "immune": (575, "LSDS-8_Multiplex_serum.immune.EvePanel_SUBMITTED.csv"),
    "cardio": (575, "LSDS-8_Multiplex_serum.cardiovascular.EvePanel_SUBMITTED.csv"),
    "urine": (656, "LSDS-64_Multiplex_urine.immune.AlamarPanel_TRANSFORMED.csv"),
    "urine_targets": (656, "LSDS-64_Multiplex_200plex v1-Target Information.csv"),
    "genes": (53, "GLDS-53_microarray_E-GEOD-47126.additional.zip"),   # holds GSE47126_Fold_change_data.txt
}

# Markers the app monitors (simulated values, real reference bands). Each must have moved in the
# same direction in every crew member with data; the script checks this and refuses otherwise.
MONITOR = [
    # metric,          table,    analyte,                label,                  unit,   scale, system,           what it means
    ("serum_glucose",  "cmp",    "GLUCOSE",              "Serum glucose",        "mg/dL", 1,    "immune",         "metabolic stress response"),
    ("serum_calcium",  "cmp",    "CALCIUM",              "Serum calcium",        "mg/dL", 1,    "musculoskeletal", "calcium balance / bone"),
    ("serum_albumin",  "cmp",    "ALBUMIN",              "Serum albumin",        "g/dL",  1,    "immune",         "protein status / inflammation"),
    ("il6",            "immune", "IL-6",                 "IL-6",                 "pg/mL", 1,    "immune",         "pro-inflammatory cytokine"),
    ("tnf_alpha",      "immune", "TNFα",                 "TNF-α",                "pg/mL", 1,    "immune",         "pro-inflammatory cytokine"),
    ("il10",           "immune", "IL-10",                "IL-10",                "pg/mL", 1,    "immune",         "anti-inflammatory cytokine"),
    ("mcp1",           "immune", "MCP-1",                "MCP-1 (CCL2)",         "pg/mL", 1,    "immune",         "monocyte-recruiting chemokine"),
    ("crp",            "cardio", "CRP",                  "C-reactive protein",   "mg/L",  1e-6, "immune",         "acute-phase inflammation (pg/mL ÷ 10⁶)"),
    ("urine_il6",      "urine",  "il6",                  "Urine IL-6",           "NPQ",   1,    "immune",         "inflammation in urine"),
    ("urine_il8",      "urine",  "cxcl8",                "Urine IL-8 (CXCL8)",   "NPQ",   1,    "immune",         "neutrophil chemokine"),
    ("urine_mpo",      "urine",  "mpo",                  "Urine MPO",            "NPQ",   1,    "immune",         "neutrophil activation"),
    ("urine_lcn2",     "urine",  "lcn2",                 "Urine NGAL (LCN2)",    "NPQ",   1,    "immune",         "kidney stress marker"),
]
SHIFT_LOG2 = 0.5          # |log2 fold change| for "really shifted" lists (1.41×)


def fetch(url, cache, name):
    path = cache / name if cache else None
    if path and path.exists():
        return path.read_bytes()
    print("  downloading", url[:110], file=sys.stderr)
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "astra-health/1.0"}), timeout=180) as r:
        data = r.read()
    if path:
        path.write_bytes(data)
    return data


def study_files(n, cache):
    data = json.loads(fetch(FILES_API.format(n=n), cache, f"files_{n}.json"))
    return {f["file_name"]: OSDR + f["remote_url"] for v in data["studies"].values() for f in v["study_files"]}


def study_meta(n, cache):
    d = json.loads(fetch(META_API.format(n=n), cache, f"meta_{n}.json"))
    s = d["study"][f"OSD-{n}"]["studies"][0]
    return {"title": s.get("title"), "description": (s.get("description") or "")[:600],
            "publications": [{"title": p.get("title"), "doi": p.get("doi")} for p in s.get("publications", [])][:4],
            "release_date": s.get("publicReleaseDate")}


def r(x, n=3):
    return None if x is None else (round(x, n) if abs(x) < 1000 else round(x, 1))


def summarize(values):
    """values: {timepoint: {subject: value}} -> stats for pre-flight vs R+1 (+ paired direction)."""
    pre = [v for tp in PRE for v in values.get(tp, {}).values()]
    ret = values.get(RET, {})
    if len(pre) < 3 or len(ret) < 2:
        return None
    subj = defaultdict(list)
    for tp in PRE:
        for s, v in values.get(tp, {}).items():
            subj[s].append(v)
    diffs = [ret[s] - st.mean(subj[s]) for s in ret if s in subj]
    mu, m1 = st.mean(pre), st.mean(ret.values())
    out = {
        "preflight": {"mean": r(mu), "sd": r(st.stdev(pre)), "n": len(pre), "min": r(min(pre)), "max": r(max(pre))},
        "return_r1": {"mean": r(m1), "sd": r(st.stdev(ret.values())) if len(ret) > 1 else None, "n": len(ret)},
        "delta": r(m1 - mu),
        "fold_change": r(m1 / mu) if mu else None,
        "crew_up": sum(1 for d in diffs if d > 0), "crew_down": sum(1 for d in diffs if d < 0), "crew_n": len(diffs),
    }
    for tp in ("R+45", "R+82", "R+194"):
        if values.get(tp):
            out.setdefault("recovery", {})[tp] = r(st.mean(values[tp].values()))
    return out


def long_table(raw, analyte, value, tp, subject, unit_col=None, ranges=False):
    rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))))
    vals, units, rng = defaultdict(lambda: defaultdict(dict)), {}, {}
    for row in rows:
        try:
            v = float(row[value])
        except (TypeError, ValueError):
            continue
        vals[row[analyte]][row[tp]][row[subject]] = v
        if unit_col:
            units[row[analyte]] = row[unit_col]
        if ranges:
            rng[row[analyte]] = (row.get("RANGE_MIN"), row.get("RANGE_MAX"))
    out = {}
    for a, v in vals.items():
        s = summarize(v)
        if s:
            s["unit"] = units.get(a, "")
            if ranges and a in rng:
                s["lab_range"] = [x if x not in ("N/A", "NA", "") else None for x in rng[a]]
            out[a] = s
    return out, len(rows)


def urine_table(raw, targets_raw):
    rows = list(csv.reader(io.StringIO(raw.decode("utf-8-sig"))))
    hdr = rows[0]
    cols = {h.replace("_concentration_npq", ""): i for i, h in enumerate(hdr) if h.endswith("_concentration_npq")}
    names = {}
    for t in csv.DictReader(io.StringIO(targets_raw.decode("utf-8-sig"))):
        names[(t.get("GeneName") or "").lower()] = t.get("ProteinName")
    out = {}
    for g, i in cols.items():
        vals = defaultdict(dict)
        for row in rows[1:]:
            subject, *_, tp = row[0].split("_")
            try:
                vals[tp][subject] = float(row[i])
            except (ValueError, IndexError):
                continue
        s = summarize(vals)
        if s:
            s["unit"] = "NPQ (log2)"
            s["fold_change"] = r(2 ** s["delta"])        # NPQ is log2-scaled: fold change = 2^difference
            s["protein"] = names.get(g)
            out[g] = s
    return out, len(rows) - 1


def gene_table(zip_raw, gpl_raw):
    lines = gpl_raw.decode("latin-1").splitlines()
    start = lines.index("!platform_table_begin")
    hdr = lines[start + 1].split("\t")
    ann = {}
    for line in lines[start + 2:]:
        if line.startswith("!"):
            break
        d = dict(zip(hdr, line.split("\t")))
        ann[d["ID"]] = d
    z = zipfile.ZipFile(io.BytesIO(zip_raw))
    name = next(n for n in z.namelist() if n.endswith("Fold_change_data.txt"))
    out = []
    for line in z.read(name).decode("latin-1").splitlines()[4:]:
        p = line.split("\t")
        if len(p) < 21 or not p[0]:
            continue
        try:
            pre, post, ratio, log2, pval = float(p[14]), float(p[15]), float(p[16]), float(p[17]), float(p[19])
        except ValueError:
            continue
        n_pre = sum(1 for x in p[2:8] if x.strip())
        n_post = sum(1 for x in p[8:14] if x.strip())
        gene_name = (ann.get(p[0], {}).get("GENE_NAME") or "").strip()
        sym = re.findall(r"\(([^()]+)\)", gene_name)
        symbol = sym[0].split(";")[-1].strip() if sym else gene_name.split(" ")[0]
        out.append({"probe": p[0], "genbank": p[1], "symbol": symbol, "name": gene_name[:90],
                    "preflight_mean": pre, "postflight_mean": post, "ratio": ratio, "log2_ratio": log2,
                    "p_value": pval, "astronauts_pre": n_pre, "astronauts_post": n_post})
    return out, name


def bands(stats, scale, metric):
    """Green/yellow/red bands from the real flight shift (see the README for the reasoning)."""
    mu, d = stats["preflight"]["mean"] * scale, stats["delta"] * scale
    up = d > 0
    green = [mu - abs(d), mu + 0.8 * d] if up else [mu + 0.8 * d, mu + abs(d)]
    return {
        "metric": metric, "direction": "up" if up else "down",
        "preflight_mean": r(mu, 4), "flight_shift": r(d, 4),
        "green": [r(x, 4) for x in sorted(green)],
        "yellow_at": r(mu + d, 4),        # the Inspiration4 crew's average on return day (R+1)
        "red_at": r(mu + 2 * d, 4),       # twice the change seen in flight
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cache", type=Path, help="directory for raw downloads (reused if present)")
    args = ap.parse_args()
    cache = args.cache
    if cache:
        cache.mkdir(parents=True, exist_ok=True)
    fetched = datetime.now(timezone.utc).isoformat(timespec="seconds")

    urls = {n: study_files(n, cache) for n in (575, 656, 53)}
    raw = {k: fetch(urls[n][f], cache, f) for k, (n, f) in FILES.items()}
    gpl = fetch(GPL140, cache, "GPL140.txt")

    cmp_t, cmp_rows = long_table(raw["cmp"], "ANALYTE", "VALUE", "timepoint", "SUBJECT_ID", "UNITS", ranges=True)
    imm_t, imm_rows = long_table(raw["immune"], "Analyte", "Concentration", "Timepoint", "ID", "Unit")
    car_t, car_rows = long_table(raw["cardio"], "Analyte", "Concentration", "Timepoint", "ID", "Unit")
    uri_t, uri_rows = urine_table(raw["urine"], raw["urine_targets"])
    genes, gene_file = gene_table(raw["genes"], gpl)
    tables = {"cmp": cmp_t, "immune": imm_t, "cardio": car_t, "urine": uri_t}

    monitoring = []
    for metric, table, analyte, label, unit, scale, system, meaning in MONITOR:
        s = tables[table][analyte]
        consistent = s["crew_up"] == s["crew_n"] or s["crew_down"] == s["crew_n"]
        if not consistent:
            sys.exit(f"{analyte}: not consistent across crew ({s['crew_up']}/{s['crew_n']} up); remove it from MONITOR")
        study = 656 if table == "urine" else 575
        b = bands(s, scale, metric)
        b.update(label=label, unit=unit, system=system, meaning=meaning, study=f"OSD-{study}",
                 source_file=FILES[table][1], analyte=analyte, fold_change=s["fold_change"],
                 crew=f"{s['crew_up'] if s['delta'] > 0 else s['crew_down']}/{s['crew_n']}",
                 preflight_n=s["preflight"]["n"], return_n=s["return_r1"]["n"],
                 preflight_sd=r(s["preflight"]["sd"] * scale, 4),
                 recovery={k: (r(v * scale, 4) if v is not None else None) for k, v in (s.get("recovery") or {}).items()})
        monitoring.append(b)

    def shifted(table, study, label_key=None):
        out = []
        for a, s in tables[table].items():
            fc = s["fold_change"]
            if not fc or fc <= 0:
                continue
            l2 = math.log2(fc)
            if abs(l2) >= SHIFT_LOG2 and (s["crew_up"] == s["crew_n"] or s["crew_down"] == s["crew_n"]) and s["crew_n"] >= 3:
                out.append({"marker": a if not label_key else (s.get(label_key) or a), "id": a, "study": study,
                            "fold_change": fc, "log2_fc": r(l2), "crew": f"{max(s['crew_up'], s['crew_down'])}/{s['crew_n']}",
                            "direction": "up" if l2 > 0 else "down"})
        return sorted(out, key=lambda x: -abs(x["log2_fc"]))

    robust_genes = [g for g in genes if g["p_value"] < 0.05 and g["astronauts_pre"] >= 5 and g["astronauts_post"] >= 5]
    low_genes = [g for g in genes if g["p_value"] < 0.05 and g not in robust_genes and g["ratio"] not in (0,)]

    meta = {n: study_meta(n, cache) for n in (575, 656, 53)}
    ref = {
        "generated_at": fetched,
        "generator": "scripts/build_nasa_reference.py",
        "note": "Derived from real NASA OSDR files. Pre-flight = Inspiration4 draws L-92, L-44, L-3 (4 crew); "
                "return = R+1. OSD-53: 6 Shuttle astronauts, L-10 vs R+0. Small samples: decision-support demo only.",
        "studies": {
            "OSD-575": {**meta[575], "url": "https://osdr.nasa.gov/bio/repo/data/studies/OSD-575",
                        "files": [{"name": FILES[k][1], "url": urls[575][FILES[k][1]], "rows": n}
                                  for k, n in (("cmp", cmp_rows), ("immune", imm_rows), ("cardio", car_rows))],
                        "design": "SpaceX Inspiration4 (3 days, 2021), 4 crew; serum at L-92, L-44, L-3, R+1, R+45, R+82, R+194"},
            "OSD-656": {**meta[656], "url": "https://osdr.nasa.gov/bio/repo/data/studies/OSD-656",
                        "files": [{"name": FILES["urine"][1], "url": urls[656][FILES["urine"][1]], "rows": uri_rows},
                                  {"name": FILES["urine_targets"][1], "url": urls[656][FILES["urine_targets"][1]]}],
                        "design": "Inspiration4 urine, Alamar NULISA ~200-plex inflammation panel; NPQ values are log2-scaled"},
            "OSD-53": {**meta[53], "url": "https://osdr.nasa.gov/bio/repo/data/studies/OSD-53",
                       "files": [{"name": FILES["genes"][1], "url": urls[53][FILES["genes"][1]], "member": gene_file},
                                 {"name": "GPL140 platform annotation (probe -> gene)", "url": GPL140}],
                       "design": "6 astronauts, whole blood 10 days before launch vs 2-3 h after landing; 234 stress-response genes"},
        },
        "monitoring": monitoring,
        "shifted": {
            "OSD-575": shifted("immune", "OSD-575") + shifted("cardio", "OSD-575") + shifted("cmp", "OSD-575"),
            "OSD-656": shifted("urine", "OSD-656", "protein")[:15],
            "OSD-53": [{"marker": g["symbol"], "name": g["name"], "study": "OSD-53", "fold_change": g["ratio"],
                        "log2_fc": g["log2_ratio"], "p_value": g["p_value"], "direction": "up" if g["log2_ratio"] > 0 else "down",
                        "astronauts": f"{g['astronauts_pre']}/6 pre, {g['astronauts_post']}/6 post"} for g in sorted(robust_genes, key=lambda x: x["p_value"])],
        },
        "tables": {
            "osd575_cmp": cmp_t,
            "osd575_cytokines": imm_t,
            "osd575_cardio": car_t,
            "osd656_urine_selected": {k: uri_t[k] for k in ("il6", "cxcl8", "mpo", "lcn2", "s100a12", "mmp8", "tnf", "il10", "ccl2", "spp1") if k in uri_t},
            "osd53_genes_p_lt_0_05": sorted(robust_genes + low_genes, key=lambda x: x["p_value"]),
        },
    }
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(ref, indent=1, ensure_ascii=False) + "\n")
    # The browser copy leaves out the big per-analyte tables (they are served at /api/nasa/reference/).
    slim = dict(ref, tables={"osd53_genes_p_lt_0_05": ref["tables"]["osd53_genes_p_lt_0_05"]})
    OUT_JS.write_text("/* Generated by scripts/build_nasa_reference.py from real NASA OSDR data (OSD-575, OSD-656, OSD-53). Do not edit. */\n"
                      "window.ASTRA_NASA = " + json.dumps(slim, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print(f"wrote {OUT_JSON.relative_to(ROOT)} ({OUT_JSON.stat().st_size // 1024} KB) and {OUT_JS.relative_to(ROOT)}")
    for m in monitoring:
        print(f"  {m['metric']:<14} pre {m['preflight_mean']:>10} shift {m['flight_shift']:>9} FC {m['fold_change']:<6} crew {m['crew']}  "
              f"green {m['green']} yellow {'≥' if m['direction'] == 'up' else '≤'}{m['yellow_at']} red {'≥' if m['direction'] == 'up' else '≤'}{m['red_at']}")


if __name__ == "__main__":
    main()
