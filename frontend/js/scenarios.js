/* ASTRA HEALTH - simulation scenarios (browser copy of device_simulator/scenarios.py).
 * Used by the Scenario Control page (labels, preview) and by mock mode (?api=mock) so the
 * demo data follows the chosen scenario without a server. Keep the bands in sync with Python.
 */
(function (global) {
  'use strict';

  var LEVELS = ['normal', 'caution', 'critical'];
  var SYSTEMS = {
    cardiovascular: 'Cardiovascular: heart rate, ECG rhythm, blood pressure',
    respiratory: 'Respiratory: SpO2 and breathing rate',
    radiation: 'Radiation: personal dosimeter',
    behavioral: 'Behavioral: stress, sleep and reaction-test lapses',
    immune: 'Immune: body temperature and blood glucose'
  };
  var CABIN_SYSTEMS = { co2: 'Cabin CO2', o2: 'Cabin oxygen', radiation: 'Cabin radiation (solar event)', noise: 'Cabin noise' };
  var CYCLE = ['cardiovascular', 'respiratory', 'behavioral', 'immune', 'radiation'];
  var PRESETS = [
    { key: 'nominal', label: 'All nominal', description: 'Every astronaut and the cabin stay inside the green range. No new alerts.' },
    { key: 'one_caution', label: 'One caution', description: 'The focus astronaut is yellow in the chosen system; everyone else is green.' },
    { key: 'one_critical', label: 'One critical', description: 'The focus astronaut is red in the chosen system; everyone else is green.' },
    { key: 'mixed', label: 'One critical + one caution', description: 'The focus astronaut is red, the next crew member is yellow (behavioral), the rest green.' },
    { key: 'several_caution', label: 'Several caution', description: 'Everyone except the focus astronaut is yellow, each in a different system.' },
    { key: 'all_critical', label: 'All critical', description: 'Every astronaut is red, each in a different system. Worst case for the console.' },
    { key: 'cabin_co2', label: 'Cabin CO2 problem', description: 'CO2 scrubber failure: the cabin raises a red CO2 alert; crew vitals stay green.' },
    { key: 'radiation_storm', label: 'Radiation storm', description: "Solar particle event: cabin radiation and every astronaut's dose are red." },
    { key: 'realistic', label: 'Random / realistic', description: 'Mostly green with rare short anomalies (about one yellow blip every few minutes, a red one much less often). Blips clear by themselves.' },
    { key: 'custom', label: 'Custom', description: 'Pick a level and system for each astronaut and the cabin yourself.' }
  ];
  var DEFAULT = { preset: 'realistic', target: 2, system: 'cardiovascular', custom: {}, cabin: { level: 'normal', system: 'co2' }, anomaly_rate: 0.002 };

  function lv(v) { return LEVELS.indexOf(v) >= 0 ? v : 'normal'; }

  function resolve(cfg, ids) {
    cfg = Object.assign({}, DEFAULT, cfg || {});
    ids = ids.slice().sort(function (a, b) { return a - b; });
    var target = ids.indexOf(Number(cfg.target)) >= 0 ? Number(cfg.target) : (ids.indexOf(2) >= 0 ? 2 : ids[0]);
    var system = SYSTEMS[cfg.system] ? cfg.system : 'cardiovascular';
    var astro = {}, cabin = { level: 'normal', system: 'co2' };
    ids.forEach(function (i) { astro[i] = { level: 'normal', system: 'cardiovascular' }; });
    var others = ids.filter(function (i) { return i !== target; });
    var p = cfg.preset;
    if (p === 'one_caution') astro[target] = { level: 'caution', system: system };
    else if (p === 'one_critical') astro[target] = { level: 'critical', system: system };
    else if (p === 'mixed') {
      astro[target] = { level: 'critical', system: system };
      if (others.length) {
        var nxt = ids.filter(function (i) { return i > target; })[0] || others[0];
        astro[nxt] = { level: 'caution', system: system !== 'behavioral' ? 'behavioral' : 'cardiovascular' };
      }
    } else if (p === 'several_caution') others.forEach(function (i, n) { astro[i] = { level: 'caution', system: CYCLE[n % CYCLE.length] }; });
    else if (p === 'all_critical') ids.forEach(function (i, n) { astro[i] = { level: 'critical', system: CYCLE[n % CYCLE.length] }; });
    else if (p === 'cabin_co2') cabin = { level: 'critical', system: 'co2' };
    else if (p === 'radiation_storm') { ids.forEach(function (i) { astro[i] = { level: 'critical', system: 'radiation' }; }); cabin = { level: 'critical', system: 'radiation' }; }
    else if (p === 'custom') {
      Object.keys(cfg.custom || {}).forEach(function (k) {
        var v = cfg.custom[k] || {};
        if (astro[k]) astro[k] = { level: lv(v.level), system: SYSTEMS[v.system] ? v.system : 'cardiovascular' };
      });
      var c = cfg.cabin || {};
      cabin = { level: lv(c.level), system: CABIN_SYSTEMS[c.system] ? c.system : 'co2' };
    }
    return { mode: p === 'realistic' ? 'random' : 'fixed', anomaly_rate: Number(cfg.anomaly_rate) || 0, astronauts: astro, cabin: cabin };
  }

  function expected(resolved) {
    var col = { normal: 'green', caution: 'yellow', critical: 'red' }, out = {};
    Object.keys(resolved.astronauts).forEach(function (k) { out[k] = col[resolved.astronauts[k].level]; });
    return out;
  }

  /* ---- value bands (same as Python) ---- */
  function U(g, lo, hi, dec) { var v = lo + g() * (hi - lo); var f = Math.pow(10, dec || 0); return Math.round(v * f) / f; }
  function problem(a, level, system, g) {
    if (level === 'normal') return {};
    var c = level === 'critical', pvt = a.pvt_ms || 255;
    switch (system) {
      case 'cardiovascular': return c ? { heart_rate: U(g, 118, 135), ecg_rhythm: 'irregular', systolic_bp: U(g, 162, 175), diastolic_bp: U(g, 98, 106), hrv: U(g, 18, 26) }
        : { heart_rate: U(g, 102, 108), systolic_bp: U(g, 142, 152), diastolic_bp: U(g, 88, 94), hrv: U(g, 22, 28) };
      case 'respiratory': return c ? { spo2: U(g, 86, 90), respiration_rate: U(g, 29, 33) } : { spo2: U(g, 93, 94), respiration_rate: U(g, 23, 26) };
      case 'radiation': return { radiation_dose: c ? U(g, 1.2, 1.6, 2) : U(g, 0.82, 0.95, 2) };
      case 'behavioral': return c ? { stress_level: U(g, 92, 97), sleep_total: U(g, 3.5, 4.2, 1), pvt_lapses: U(g, 6, 8), pvt_reaction_time: Math.round(pvt * U(g, 1.5, 1.7, 2)) }
        : { stress_level: U(g, 78, 88), sleep_total: U(g, 4.2, 4.8, 1), pvt_lapses: U(g, 3, 4), pvt_reaction_time: Math.round(pvt * U(g, 1.25, 1.35, 2)) };
      case 'immune': return c ? { body_temperature: U(g, 38.3, 39, 1), blood_glucose: U(g, 190, 215) } : { body_temperature: U(g, 37.6, 37.9, 1), blood_glucose: U(g, 145, 170) };
    }
    return {};
  }
  function cabinProblem(level, system, g) {
    if (level === 'normal') return {};
    var c = level === 'critical';
    return ({
      co2: { co2: c ? U(g, 5300, 6200) : U(g, 4200, 4800) },
      o2: { o2: c ? U(g, 18.6, 19.3, 1) : U(g, 19.6, 19.9, 1) },
      radiation: { cabin_radiation: c ? U(g, 1.3, 1.8, 2) : U(g, 0.85, 0.95, 2) },
      noise: { noise: c ? U(g, 87, 92) : U(g, 72, 78) }
    })[system] || {};
  }
  /* Nominal clamps: any value outside is pulled back inside the green range. */
  var CLAMP = {
    heart_rate: [50, 92], hrv: [38, 75], spo2: [96, 100], body_temperature: [36.4, 37.2], respiration_rate: [12, 19],
    systolic_bp: [100, 132], diastolic_bp: [60, 86], blood_glucose: [75, 125], stress_level: [10, 60], radiation_dose: [0.3, 0.7],
    sleep_total: [6, 8.5], exercise_minutes: [80, 150], urine_calcium: [150, 235], pvt_lapses: [0, 1], recovery_score: [62, 95],
    co2: [1800, 3500], o2: [20.5, 21.4], cabin_radiation: [0.3, 0.7], noise: [50, 66]
  };
  function clamp(metric, v) { var c = CLAMP[metric]; return c && typeof v === 'number' ? Math.min(c[1], Math.max(c[0], v)) : v; }
  /* Random mode: this tick's blips. */
  function plan(resolved, g) {
    var astro = JSON.parse(JSON.stringify(resolved.astronauts)), cabin = Object.assign({}, resolved.cabin);
    if (resolved.mode === 'random') {
      var rate = resolved.anomaly_rate || 0.002;
      Object.keys(astro).forEach(function (k) {
        var r = g();
        if (r < rate / 8) astro[k] = { level: 'critical', system: CYCLE[Math.floor(g() * 4)] };
        else if (r < rate) astro[k] = { level: 'caution', system: CYCLE[Math.floor(g() * 5)] };
      });
      if (g() < rate / 2) cabin = { level: 'caution', system: g() < 0.5 ? 'co2' : 'noise' };
    }
    return { astronauts: astro, cabin: cabin };
  }

  global.AstraScenarios = {
    LEVELS: LEVELS, SYSTEMS: SYSTEMS, CABIN_SYSTEMS: CABIN_SYSTEMS, PRESETS: PRESETS, DEFAULT: DEFAULT,
    resolve: resolve, expected: expected, problem: problem, cabinProblem: cabinProblem, clamp: clamp, plan: plan
  };
})(window);
