/* ASTRA HEALTH - mock backend.
 * Produces JSON shaped exactly like the real Django API (see API.md), so
 * js/api.js can switch between this and fetch() with one flag.
 * Value ranges follow device_simulator/generators.py. Astronaut 2 (Sara Tesfaye)
 * runs the "emergency" scenario (simulator --emergency 2).
 * Live mode: every 3 s a new batch of readings is generated, run through the
 * same threshold rules as health/sensor_rules.py, and alerts are created.
 * The Simulation Lab (/lab/) can replace that story with a scenario
 * (all nominal, one critical...), kept in localStorage "astra_mock_scenario".
 */
(function (global) {
  'use strict';
  var R = global.AstraRules;

  var MISSION = {
    name: 'Artemis Mars Transit',
    vehicle: 'ASTRA-1 Transit Habitat',
    launch: '2026-08-01T06:00:00+00:00'
  };

  var CREW = [
    { id: 1, name: 'Abebe Kebede', role: 'Commander', hr: 62, sbp: 118, dbp: 76, glucose: 90, pvt_ms: 260 },
    { id: 2, name: 'Sara Tesfaye', role: 'Flight Engineer', hr: 68, sbp: 112, dbp: 72, glucose: 88, pvt_ms: 245, emergency: true },
    { id: 3, name: 'Dawit Haile', role: 'Medical Officer', hr: 72, sbp: 124, dbp: 80, glucose: 95, pvt_ms: 270 },
    { id: 4, name: 'Hana Girma', role: 'Mission Specialist', hr: 65, sbp: 115, dbp: 74, glucose: 92, pvt_ms: 255 }
  ];

  var TICK_MS = 3000;

  /* ---------- scenario (Simulation Lab at /lab/; null = the built-in demo story) ---------- */
  var SC = global.AstraScenarios;
  var LS_SCEN = 'astra_mock_scenario', LS_RESET_AT = 'astra_mock_reset_at';
  var scen = SC ? lsGet(LS_SCEN, null) : null;
  function scenarioMode() {
    if (!scen) return;
    CREW.forEach(function (a) { a.emergency = false; });
    DAILY_BAD_TODAY = {};
  }
  function resolvedScenario() { return SC.resolve(scen, CREW.map(function (a) { return a.id; })); }
  var DAY = 86400000, HOUR = 3600000, MIN = 60000;

  /* ---------- helpers ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hash() {
    var s = Array.prototype.join.call(arguments, '|'), h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function gauss(rng, mean, sd) {
    var u = 1 - rng(), v = rng();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function rnd(rng, mean, sd, dec) {
    var v = gauss(rng, mean, sd);
    if (!dec) return Math.round(v);
    var p = Math.pow(10, dec);
    return Math.round(v * p) / p;
  }
  function iso(ms) { return new Date(ms).toISOString().replace(/\.\d{3}Z$/, '+00:00'); }
  function isoMicro(ms) { return new Date(ms).toISOString().replace(/Z$/, '000+00:00'); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function crewById(id) { id = Number(id); for (var i = 0; i < CREW.length; i++) if (CREW[i].id === id) return CREW[i]; return null; }

  /* ---------- metric catalogue (unit, source, generator) ---------- */
  // gen(a, rng, bad, ctx) -> number | string.  ctx.emergency, ctx.hourOfDay, ctx.day
  var LIVE = {
    heart_rate: ['bpm', 'wearable', function (a, g, bad, c) {
      if (c.emergency) return rnd(g, 132, 4);
      var night = c.hourOfDay < 6 ? -10 : 0;
      return bad ? rnd(g, 104, 3) : rnd(g, a.hr + 12 + night, 5);
    }],
    resting_heart_rate: ['bpm', 'wearable', function (a, g) { return rnd(g, a.hr, 2); }],
    hrv: ['ms', 'wearable', function (a, g, bad, c) { return c.emergency ? rnd(g, 26, 3) : bad ? rnd(g, 25, 3) : rnd(g, 56, 7); }],
    ecg_rhythm: ['', 'patch', function (a, g, bad, c) { return c.emergency ? 'irregular' : 'normal_sinus'; }],
    spo2: ['%', 'patch', function (a, g, bad, c) { return c.emergency ? rnd(g, 88, 1.2) : bad ? rnd(g, 93.5, 0.5) : Math.min(100, rnd(g, 98, 0.7)); }],
    skin_temperature: ['°C', 'wearable', function (a, g) { return rnd(g, 33.5, 0.3, 1); }],
    body_temperature: ['°C', 'patch', function (a, g, bad, c) { return c.emergency ? rnd(g, 37.4, 0.1, 1) : rnd(g, 36.8, 0.15, 1); }],
    respiration_rate: ['breaths/min', 'patch', function (a, g, bad, c) { return c.emergency ? rnd(g, 24, 1) : bad ? rnd(g, 23.5, 0.5) : rnd(g, 15, 1.5); }],
    systolic_bp: ['mmHg', 'bp_cuff', function (a, g, bad, c) { return c.emergency ? rnd(g, 153, 4) : bad ? rnd(g, 146, 3) : rnd(g, a.sbp, 5); }],
    diastolic_bp: ['mmHg', 'bp_cuff', function (a, g, bad, c) { return c.emergency ? rnd(g, 94, 3) : rnd(g, a.dbp, 3); }],
    blood_glucose: ['mg/dL', 'cgm', function (a, g, bad) { return bad ? rnd(g, 152, 6) : rnd(g, a.glucose, 6); }],
    stress_level: ['0-100', 'wearable', function (a, g, bad, c) { return c.emergency ? rnd(g, 72, 4) : bad ? rnd(g, 82, 3) : Math.max(5, rnd(g, 33, 9)); }],
    radiation_dose: ['mSv/day', 'dosimeter', function (a, g) { return Math.max(0.2, rnd(g, 0.5, 0.06, 2)); }]
  };
  // once-a-day values (fixed per astronaut per day)
  var DAILY = {
    distance: ['km', 'wearable', function (a, g) { return rnd(g, 4.5, 0.8, 1); }],
    calories_burned: ['kcal', 'wearable', function (a, g) { return rnd(g, 2600, 150); }],
    exercise_minutes: ['min', 'wearable', function (a, g, bad) { return bad ? rnd(g, 42, 6) : rnd(g, 118, 15); }],
    sleep_total: ['h', 'wearable', function (a, g, bad) { return bad ? rnd(g, 4.4, 0.3, 1) : rnd(g, 7.1, 0.5, 1); }],
    recovery_score: ['0-100', 'wearable', function (a, g, bad) { return bad ? rnd(g, 44, 5) : rnd(g, 79, 6); }],
    body_mass: ['kg', 'mass_device', function (a, g, bad, c) { return rnd(g, 72 - c.day * 0.03, 0.2, 1); }],
    grip_strength: ['kg', 'dynamometer', function (a, g, bad, c) { return rnd(g, 44 - c.day * 0.03, 1, 1); }],
    urine_calcium: ['mg/day', 'lab', function (a, g, bad, c) { return bad ? rnd(g, 304, 6) : rnd(g, 180 + c.day * 0.2, 12); }],
    pvt_reaction_time: ['ms', 'pvt_test', function (a, g, bad) { return bad ? rnd(g, a.pvt_ms * 1.3, 10) : rnd(g, a.pvt_ms, 12); }],
    pvt_lapses: ['count', 'pvt_test', function (a, g, bad) { return bad ? 3 + Math.floor(g() * 2) : Math.floor(g() * 2); }]
  };
  var CABIN = {
    co2: ['ppm', function (g, bad) { return bad ? rnd(g, 4300, 120) : rnd(g, 2450, 180); }],
    o2: ['%', function (g) { return rnd(g, 21, 0.15, 1); }],
    cabin_temperature: ['°C', function (g) { return rnd(g, 22.4, 0.3, 1); }],
    humidity: ['%', function (g) { return rnd(g, 45, 2); }],
    cabin_pressure: ['kPa', function (g) { return rnd(g, 101.3, 0.2, 1); }],
    cabin_radiation: ['mSv/day', function (g, bad) { return bad ? rnd(g, 1.5, 0.1, 2) : Math.max(0.2, rnd(g, 0.45, 0.05, 2)); }],
    noise: ['dB', function (g, bad) { return bad ? rnd(g, 72, 1) : rnd(g, 57, 2.5); }],
    voc: ['mg/m³', function (g) { return Math.max(0.05, rnd(g, 0.3, 0.06, 2)); }]
  };
  // Today's "story" for the daily values (so the demo is predictable)
  var DAILY_BAD_TODAY = { 2: ['urine_calcium', 'pvt_lapses', 'pvt_reaction_time', 'recovery_score'], 3: ['sleep_total', 'recovery_score'] };

  function missionDay(now) { return Math.floor((now - Date.parse(MISSION.launch)) / DAY) + 1; }
  function hourOfDayEAT(ms) { return (new Date(ms).getUTCHours() + 3) % 24; }

  function reading(metric, value, unit, source, ts) {
    var numeric = typeof value === 'number';
    return { metric: metric, value: numeric ? value : null, text_value: numeric ? '' : value, unit: unit, source: source, timestamp: iso(ts) };
  }

  /* ---------- state ---------- */
  var state = { latest: {}, cabin: {}, alerts: [], nextAlertId: 1, listeners: [], started: false, liveRng: Math.random };
  var LS_RESOLVED = 'astra_mock_resolved', LS_ACK = 'astra_mock_ack', LS_CHECKINS = 'astra_mock_checkins', LS_PVT = 'astra_mock_pvt';
  function lsGet(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v === null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } }

  function dailyFor(a, metric, dayIndex, now) {
    var g = mulberry32(hash('daily', a.id, metric, dayIndex));
    var today = dayIndex === missionDay(now);
    var bad = today ? (DAILY_BAD_TODAY[a.id] || []).indexOf(metric) >= 0 : g() < 0.07;
    var d = DAILY[metric];
    return d[2](a, g, bad, { day: dayIndex });
  }

  function addAlert(aid, ev, ts, metric) {
    var a = crewById(aid);
    if (ev.system === 'radiation' && scen && scen.preset === 'space_weather' && scen.event) {   // like health/donki.py
      var e = scen.event, rec = ev.recommendation;
      if (rec.indexOf('storm shelter') < 0) rec += ' Shelter in the storm shelter.';
      ev = Object.assign({}, ev, { recommendation: (rec + ' Cause: NASA DONKI ' + e.label + ', ' + e.id + ' (' + e.time.replace('T', ' ').replace('Z', ' UTC') + ').').slice(0, 255) });
    }
    var alert = {
      id: state.nextAlertId++, astronaut_id: aid, astronaut: a ? a.name : null,
      system: ev.system, level: ev.level, message: ev.message, recommendation: ev.recommendation,
      resolved: false, created_at: isoMicro(ts)
    };
    Object.defineProperty(alert, '_metric', { value: metric, enumerable: false });
    Object.defineProperty(alert, '_transient', { value: !!(a && !a.emergency) || aid === null, enumerable: false, writable: true });
    state.alerts.unshift(alert);
    if (state.alerts.length > 400) state.alerts.length = 400;
    return alert;
  }

  function recentDuplicate(aid, metric, level, now, windowMs) {
    for (var i = 0; i < state.alerts.length; i++) {
      var al = state.alerts[i];
      if (Date.parse(al.created_at) < now - windowMs) break;
      if (al.astronaut_id === aid && al._metric === metric && al.level === level && !al.resolved) return true;
    }
    return false;
  }

  function evaluateBatch(aid, readings, now, dedupMs) {
    var fired = [];
    readings.forEach(function (r) {
      var ev = R.evaluateReading(r);
      if (ev && !recentDuplicate(aid, r.metric, ev.level, now, dedupMs)) fired.push(addAlert(aid, ev, now, r.metric));
    });
    return fired;
  }

  /* Seed: a snapshot, plus a believable alert log for the last couple of hours. */
  function seed() {
    var now = Date.now();
    var md = missionDay(now);
    var seedRng = mulberry32(hash('seed', md));
    CREW.forEach(function (a) {
      var latest = {};
      var dailyTs = now - ((hourOfDayEAT(now) + 24 - 7) % 24) * HOUR; // 07:00 EAT today
      Object.keys(DAILY).forEach(function (m) {
        latest[m] = reading(m, dailyFor(a, m, md, now), DAILY[m][0], DAILY[m][1], dailyTs);
      });
      // sleep stages derived from sleep_total
      var sl = latest.sleep_total.value, g = mulberry32(hash('stages', a.id, md));
      var deep = Math.round(sl * (0.16 + g() * 0.05) * 10) / 10, rem = Math.round(sl * (0.2 + g() * 0.05) * 10) / 10;
      latest.sleep_deep = reading('sleep_deep', deep, 'h', 'wearable', dailyTs);
      latest.sleep_rem = reading('sleep_rem', rem, 'h', 'wearable', dailyTs);
      latest.sleep_light = reading('sleep_light', Math.round((sl - deep - rem) * 10) / 10, 'h', 'wearable', dailyTs);
      Object.keys(LIVE).forEach(function (m) {
        latest[m] = reading(m, LIVE[m][2](a, seedRng, false, { emergency: !!a.emergency, hourOfDay: hourOfDayEAT(now) }), LIVE[m][0], LIVE[m][1], now);
      });
      // lab markers inside the bands derived from real NASA OSDR data (OSD-575 serum, OSD-656 urine)
      var labs = SC.nominalLabs(mulberry32(hash('labs', a.id, md)));
      SC.LAB.forEach(function (m) { latest[m.metric] = reading(m.metric, labs[m.metric], m.unit, 'lab', dailyTs); });
      state.latest[a.id] = latest;
    });
    Object.keys(CABIN).forEach(function (m) { state.cabin[m] = reading(m, CABIN[m][1](seedRng, false), CABIN[m][0], 'cabin', now); });

    // Alert log (oldest first so ids increase with time). Not in scenario mode.
    var log = scen ? [] : [
      [3, now - 4.2 * HOUR, 'sleep_total'], [3, now - 4.1 * HOUR, 'recovery_score'],
      [4, now - 3.5 * HOUR, { metric: 'heart_rate', value: 104, unit: 'bpm' }, true],
      [null, now - 2.6 * HOUR, { metric: 'co2', value: 4210, unit: 'ppm' }, true],
      [1, now - 2.1 * HOUR, { metric: 'stress_level', value: 79, unit: '0-100' }, true],
      [2, now - 50 * MIN, 'urine_calcium'], [2, now - 48 * MIN, 'pvt_lapses'],
      [2, now - 22 * MIN, { metric: 'systolic_bp', value: 146, unit: 'mmHg' }],
      [2, now - 9 * MIN, { metric: 'heart_rate', value: 128, unit: 'bpm' }],
      [2, now - 9 * MIN + 1500, { metric: 'spo2', value: 90, unit: '%' }],
      [2, now - 9 * MIN + 2500, { metric: 'ecg_rhythm', text_value: 'irregular', unit: '' }],
      [2, now - 4 * MIN, { metric: 'heart_rate', value: 134, unit: 'bpm' }],
      [2, now - 4 * MIN + 1200, { metric: 'spo2', value: 88, unit: '%' }]
    ];
    log.forEach(function (row) {
      var aid = row[0], ts = row[1], spec = row[2];
      var r = typeof spec === 'string' ? state.latest[aid][spec] : spec;
      if (r.value === undefined) r.value = null;
      var ev = R.evaluateReading(r);
      if (ev) { var al0 = addAlert(aid, ev, ts, r.metric); if (row[3]) al0.resolved = true; }
    });
    // Older, already-resolved history
    var resolvedOld = [[1, 26 * HOUR, 'exercise_minutes', 45, 'min'], [4, 30 * HOUR, 'spo2', 94, '%'], [3, 2 * DAY, 'systolic_bp', 144, 'mmHg'], [null, 3 * DAY, 'noise', 73, 'dB'], [4, 5 * DAY, 'sleep_total', 4.6, 'h']];
    resolvedOld.forEach(function (x) {
      var ev = R.evaluateReading({ metric: x[2], value: x[3], unit: x[4] });
      var al = addAlert(x[0], ev, now - x[1], x[2]); al.resolved = true;
    });
    state.alerts.sort(function (p, q) { return Date.parse(q.created_at) - Date.parse(p.created_at); });
    // ids: oldest = 1
    var n = state.alerts.length;
    state.alerts.forEach(function (al, i) { al.id = n - i; });
    state.nextAlertId = 1000;
    var resolved = lsGet(LS_RESOLVED, []), resetAt = lsGet(LS_RESET_AT, 0);
    state.alerts.forEach(function (al) { if (resolved.indexOf(al.id) >= 0 || Date.parse(al.created_at) < resetAt) al.resolved = true; });
    if (scen) scenarioValues(now, seedRng);
  }

  /* Scenario mode: one batch of values for everyone (returns {aid|'cabin': [readings]}). */
  function scenarioValues(now, g) {
    var p = SC.plan(resolvedScenario(), g), out = {};
    CREW.forEach(function (a) {
      var st = p.astronauts[a.id] || { level: 'normal' }, prob = SC.problem(a, st.level, st.system, g), batch = [];
      Object.keys(LIVE).forEach(function (m) {
        var v = m in prob ? prob[m] : SC.clamp(m, LIVE[m][2](a, g, false, { emergency: false, hourOfDay: hourOfDayEAT(now) }));
        var r = reading(m, v, LIVE[m][0], LIVE[m][1], now); state.latest[a.id][m] = r; batch.push(r);
      });
      ['sleep_total', 'pvt_lapses', 'pvt_reaction_time'].forEach(function (m) {
        var prev = state.latest[a.id][m];
        var v = m in prob ? prob[m] : SC.clamp(m, prev && prev.value !== null && prev._scen ? prev.value : DAILY[m][2](a, g, false, { day: missionDay(now) }));
        var r = reading(m, v, DAILY[m][0], DAILY[m][1], now);
        Object.defineProperty(r, '_scen', { value: !(m in prob), enumerable: false });
        state.latest[a.id][m] = r; batch.push(r);
      });
      ['urine_calcium', 'exercise_minutes', 'recovery_score'].forEach(function (m) {
        var cur = state.latest[a.id][m]; if (cur && typeof cur.value === 'number') cur.value = SC.clamp(m, cur.value);
      });
      var labs = null;
      SC.LAB.forEach(function (m) {      // keep a nominal lab value; redraw it after a problem
        var prev = state.latest[a.id][m.metric], k = m.metric, v;
        if (k in prob) v = prob[k];
        else if (prev && prev._labok !== false && R.levelFor(k, prev.value) === 'green') v = prev.value;
        else v = (labs = labs || SC.nominalLabs(g))[k];
        var r = reading(k, v, m.unit, 'lab', k in prob || !prev ? now : prev.timestamp);
        Object.defineProperty(r, '_labok', { value: !(k in prob), enumerable: false });
        state.latest[a.id][k] = r; if (k in prob || !prev || prev._labok === false) batch.push(r);
      });
      out[a.id] = batch;
    });
    var cp = SC.cabinProblem(p.cabin.level, p.cabin.system, g), cb = [];
    Object.keys(CABIN).forEach(function (m) {
      var r = reading(m, m in cp ? cp[m] : SC.clamp(m, CABIN[m][1](g, false)), CABIN[m][0], 'cabin', now);
      state.cabin[m] = r; cb.push(r);
    });
    out.cabin = cb;
    return out;
  }
  var RANKL = { yellow: 1, red: 2 };
  /* Like the server: an open sensor alert closes when its metric is back in range (or lower) for 2 min. */
  function clearRecovered(now) {
    state.alerts.forEach(function (al) {
      if (al.resolved || !al._metric || al._metric === 'checkin' || Date.parse(al.created_at) > now - 2 * MIN) return;
      var cur = al.astronaut_id === null ? state.cabin[al._metric] : (state.latest[al.astronaut_id] || {})[al._metric];
      if (!cur) return;
      var ev = R.evaluateReading(cur);
      if ((ev ? RANKL[ev.level] : 0) < RANKL[al.level]) al.resolved = true;
    });
  }

  /* One live tick = one simulator batch. */
  function tick() {
    var now = Date.now(), g = state.liveRng;
    var fired = [];
    if (scen) {
      var vals = scenarioValues(now, g);
      CREW.forEach(function (a) { fired = fired.concat(evaluateBatch(a.id, vals[a.id], now, 5 * MIN)); });
      fired = fired.concat(evaluateBatch(null, vals.cabin, now, 5 * MIN));
      clearRecovered(now);
      state.listeners.forEach(function (fn) { try { fn(fired); } catch (e) { console.error(e); } });
      return fired;
    }
    CREW.forEach(function (a) {
      var badMetric = null;
      if (!a.emergency && g() < 0.025) {
        var pool = ['heart_rate', 'spo2', 'stress_level', 'systolic_bp', 'respiration_rate', 'hrv', 'blood_glucose'];
        badMetric = pool[Math.floor(g() * pool.length)];
      }
      var batch = [];
      Object.keys(LIVE).forEach(function (m) {
        var v = LIVE[m][2](a, g, m === badMetric, { emergency: !!a.emergency, hourOfDay: hourOfDayEAT(now) });
        var r = reading(m, v, LIVE[m][0], LIVE[m][1], now);
        state.latest[a.id][m] = r; batch.push(r);
      });
      fired = fired.concat(evaluateBatch(a.id, batch, now, a.emergency ? 45000 : 120000));
    });
    var cabinBad = g() < 0.012 ? (g() < 0.6 ? 'co2' : 'noise') : null;
    var cbatch = [];
    Object.keys(CABIN).forEach(function (m) {
      var r = reading(m, CABIN[m][1](g, m === cabinBad), CABIN[m][0], 'cabin', now);
      state.cabin[m] = r; cbatch.push(r);
    });
    fired = fired.concat(evaluateBatch(null, cbatch, now, 120000));
    // transient anomalies on healthy crew clear themselves after ~2 minutes (mock only)
    state.alerts.forEach(function (al) {
      if (!al.resolved && al._transient && al.id >= 1000 && Date.parse(al.created_at) < now - 2 * MIN) al.resolved = true;
    });
    state.listeners.forEach(function (fn) { try { fn(fired); } catch (e) { console.error(e); } });
    return fired;
  }

  function start() {
    if (state.started) return;
    state.started = true;
    setInterval(tick, TICK_MS);
  }

  /* ---------- history ---------- */
  var HISTORY_DAILY = Object.keys(DAILY).concat(['sleep_deep', 'sleep_rem', 'sleep_light']);
  function historyPoints(a, metric, hours, limit) {
    var now = Date.now();
    var out = [];
    if (HISTORY_DAILY.indexOf(metric) >= 0) {
      var md = missionDay(now);
      var days = Math.max(1, Math.ceil(hours / 24));
      var base = metric.indexOf('sleep_') === 0 && metric !== 'sleep_total' ? 'sleep_total' : metric;
      var unit = (DAILY[base] || DAILY.sleep_total)[0], src = (DAILY[base] || DAILY.sleep_total)[1];
      for (var d = days - 1; d >= 0; d--) {
        var day = md - d, ts = now - d * DAY - ((hourOfDayEAT(now) + 24 - 7) % 24) * HOUR;
        if (ts < now - hours * HOUR) continue;
        var v;
        if (d === 0) { v = state.latest[a.id][metric].value; }
        else if (base !== metric) { var tot = dailyFor(a, 'sleep_total', day, now); v = Math.round(tot * (metric === 'sleep_deep' ? 0.19 : metric === 'sleep_rem' ? 0.23 : 0.58) * 10) / 10; }
        else v = dailyFor(a, metric, day, now);
        out.push(reading(metric, v, unit, src, ts));
      }
    } else if (LIVE[metric]) {
      var step = hours <= 6 ? 5 * MIN : hours <= 24 ? 15 * MIN : HOUR;
      var t0 = Math.floor((now - hours * HOUR) / step) * step + step;
      for (var t = t0; t < now - step / 2; t += step) {
        var gg = mulberry32(hash('hist', a.id, metric, t));
        var emerg = !!a.emergency && t > now - 25 * MIN;
        var bad = !emerg && gg() < 0.03;
        out.push(reading(metric, LIVE[metric][2](a, gg, bad, { emergency: emerg, hourOfDay: hourOfDayEAT(t) }), LIVE[metric][0], LIVE[metric][1], t));
      }
      out.push(clone(state.latest[a.id][metric]));
    }
    if (limit && out.length > limit) out = out.slice(out.length - limit);
    return out;
  }

  /* ---------- check-ins ---------- */
  function seededCheckins(a) {
    var now = Date.now(), md = missionDay(now), list = [];
    for (var d = 1; d <= 7; d++) {
      var g = mulberry32(hash('checkin', a.id, md - d));
      var ts = now - d * DAY - ((hourOfDayEAT(now) + 24 - 8) % 24) * HOUR;
      list.push({
        id: a.id * 100 + (8 - d), astronaut_id: a.id, created_at: isoMicro(ts),
        heart_rate: rnd(g, a.hr + 2, 3), systolic_bp: rnd(g, a.sbp, 4), diastolic_bp: rnd(g, a.dbp, 3),
        temperature: rnd(g, 36.7, 0.15, 1), exercise_minutes: rnd(g, 110, 18),
        sleep_hours: dailyFor(a, 'sleep_total', md - d, now), mood: Math.min(5, Math.max(1, rnd(g, 4, 0.6))),
        stress: Math.min(5, Math.max(1, rnd(g, 2, 0.7))), radiation_msv: Math.max(0.2, rnd(g, 0.5, 0.06, 2)), symptoms: ''
      });
    }
    return list;
  }

  /* ---------- public mock API (same JSON as the Django views) ---------- */
  function statusFor(aid) {
    var lv = [], n = 0;
    state.alerts.forEach(function (al) { if (al.astronaut_id === aid && !al.resolved) { lv.push(al.level); n++; } });
    return { status: R.worst(lv), open_alerts: n };
  }
  function crewJSON(a) {
    var s = statusFor(a.id);
    return { id: a.id, name: a.name, mission: MISSION.name, role: a.role, status: s.status, open_alerts: s.open_alerts, last_reading_at: state.latest[a.id].heart_rate.timestamp };
  }
  function sortedReadings(map) { return Object.keys(map).sort().map(function (k) { return clone(map[k]); }); }
  function err(status, msg) { var e = new Error(msg); e.status = status; e.body = { error: msg }; throw e; }
  function need(id) { var n = Number(id); if (!id && id !== 0 || isNaN(n)) err(400, 'astronaut must be an integer'); var a = crewById(n); if (!a) err(404, 'unknown astronaut ' + id); return a; }

  var MockAPI = {
    mission: function () { return clone(MISSION); },
    getCrew: function () { return { count: CREW.length, astronauts: CREW.map(crewJSON) }; },
    getCrewMember: function (id) {
      var a = need(id), o = crewJSON(a);
      o.baselines = { heart_rate: a.hr, systolic_bp: a.sbp, diastolic_bp: a.dbp };
      return o;
    },
    getLatest: function (id) {
      var a = need(id), r = sortedReadings(state.latest[a.id]);
      return { astronaut_id: a.id, astronaut: a.name, count: r.length, readings: r };
    },
    getCabin: function () { var r = sortedReadings(state.cabin); return { source: 'cabin', count: r.length, readings: r }; },
    getHistory: function (id, metric, hours, limit) {
      var a = need(id);
      if (!metric) err(400, 'metric is required');
      hours = Number(hours) || 24; limit = Number(limit) || 500;
      var r = historyPoints(a, metric, hours, limit);
      return { astronaut_id: a.id, astronaut: a.name, metric: metric, hours: hours, count: r.length, readings: r };
    },
    getAlerts: function (opts) {
      opts = opts || {};
      var list = state.alerts.filter(function (al) {
        if (opts.astronaut !== undefined && opts.astronaut !== null && opts.astronaut !== '' && al.astronaut_id !== Number(opts.astronaut)) return false;
        if (opts.level && al.level !== opts.level) return false;
        if (opts.resolved !== undefined && opts.resolved !== null && opts.resolved !== '' && String(al.resolved) !== String(opts.resolved)) return false;
        return true;
      }).slice(0, Number(opts.limit) || 50);
      var ack = lsGet(LS_ACK, []);
      list = clone(list).map(function (al) {
        al.acknowledged = al.resolved || ack.indexOf(al.id) >= 0;
        al.acknowledged_by = al.acknowledged ? 'surgeon' : null;
        al.resolved_by = al.resolved ? (al.resolved_by || 'surgeon') : null;
        return al;
      });
      if (opts.acknowledged !== undefined && opts.acknowledged !== null && opts.acknowledged !== '') list = list.filter(function (al) { return String(al.acknowledged) === String(opts.acknowledged); });
      return { count: list.length, alerts: list };
    },
    getCheckins: function (opts) {
      opts = opts || {};
      var list = [];
      var mine = lsGet(LS_CHECKINS, []);
      CREW.forEach(function (a) {
        if (opts.astronaut && a.id !== Number(opts.astronaut)) return;
        list = list.concat(mine.filter(function (c) { return c.astronaut_id === a.id; }), seededCheckins(a));
      });
      list.sort(function (p, q) { return Date.parse(q.created_at) - Date.parse(p.created_at); });
      list = list.slice(0, Number(opts.limit) || 30);
      return { count: list.length, checkins: list };
    },

    /* ---- write operations (mock mode keeps them in localStorage) ---- */
    submitCheckin: function (data) {
      var a = need(data.astronaut_id);
      var mine = lsGet(LS_CHECKINS, []);
      var c = clone(data); c.id = 5000 + mine.length; c.created_at = isoMicro(Date.now());
      mine.unshift(c); lsSet(LS_CHECKINS, mine.slice(0, 50));
      var found = R.checkCheckin(c, { heart_rate: a.hr });
      var alerts = found.map(function (f) { return addAlert(a.id, f, Date.now(), 'checkin'); });
      return { checkin: c, alerts: clone(alerts) };
    },
    submitPvt: function (aid, result) {
      var a = need(aid), now = Date.now();
      var rt = reading('pvt_reaction_time', result.mean_rt || result.mean_rt_ms, 'ms', 'pvt_test', now);
      var lp = reading('pvt_lapses', result.lapses, 'count', 'pvt_test', now);
      state.latest[a.id].pvt_reaction_time = rt; state.latest[a.id].pvt_lapses = lp;
      var hist = lsGet(LS_PVT, []); hist.unshift({ astronaut_id: a.id, at: iso(now), mean_rt: result.mean_rt || result.mean_rt_ms, fastest_ms: result.fastest_ms, lapses: result.lapses, false_starts: result.false_starts, trials: result.trials }); lsSet(LS_PVT, hist.slice(0, 30));
      var fired = evaluateBatch(a.id, [lp], now, 0);
      return { saved: 2, alerts_created: fired.length, alerts: clone(fired) };
    },
    resolveAlert: function (id) {
      id = Number(id);
      var al = state.alerts.filter(function (x) { return x.id === id; })[0];
      if (!al) err(404, 'unknown alert ' + id);
      al.resolved = true;
      if (id < 1000) { var r = lsGet(LS_RESOLVED, []); if (r.indexOf(id) < 0) r.push(id); lsSet(LS_RESOLVED, r); }
      return clone(al);
    },
    acknowledgeAlert: function (id) {
      var ack = lsGet(LS_ACK, []); if (ack.indexOf(Number(id)) < 0) ack.push(Number(id)); lsSet(LS_ACK, ack);
      return { id: Number(id), acknowledged: true };
    },
    acknowledged: function () { return lsGet(LS_ACK, []); },
    /** GET /api/pvt/ shape: own runs (localStorage) + one seeded run per past day. */
    getPvt: function (opts) {
      opts = opts || {};
      var now = Date.now(), md = missionDay(now), list = [];
      CREW.forEach(function (a) {
        if (opts.astronaut && a.id !== Number(opts.astronaut)) return;
        lsGet(LS_PVT, []).forEach(function (p, i) {
          if (p.astronaut_id !== a.id) return;
          list.push({ id: 9000 + i, astronaut_id: a.id, created_at: p.at, mean_rt_ms: p.mean_rt, fastest_ms: p.fastest_ms || null, lapses: p.lapses, false_starts: p.false_starts || 0, trials: p.trials || 10 });
        });
        for (var d = 1; d <= 7; d++) {
          var g = mulberry32(hash('pvt', a.id, md - d)), rt = Math.round(dailyFor(a, 'pvt_reaction_time', md - d, now));
          list.push({ id: a.id * 100 + d, astronaut_id: a.id, created_at: isoMicro(now - d * DAY), mean_rt_ms: rt, fastest_ms: Math.round(rt * 0.72),
            lapses: Math.round(dailyFor(a, 'pvt_lapses', md - d, now)), false_starts: Math.floor(g() * 2), trials: 10 });
        }
      });
      list.sort(function (p, q) { return Date.parse(q.created_at) - Date.parse(p.created_at); });
      list = list.slice(0, Number(opts.limit) || 30);
      return { count: list.length, results: list };
    },
    pvtHistory: function (aid) { return lsGet(LS_PVT, []).filter(function (p) { return p.astronaut_id === Number(aid); }); },
    resetDemo: function () { [LS_RESOLVED, LS_ACK, LS_CHECKINS, LS_PVT, LS_SCEN, LS_RESET_AT].forEach(function (k) { localStorage.removeItem(k); }); },

    /* ---- simulation scenario (same JSON as /api/sim/...) ---- */
    getScenario: function () {
      var ids = CREW.map(function (a) { return a.id; });
      var meta = lsGet(LS_SCEN + '_meta', { version: 0 });
      var base = { presets: SC.PRESETS, levels: SC.LEVELS, systems: SC.SYSTEMS, cabin_systems: SC.CABIN_SYSTEMS,
        version: meta.version, updated_at: meta.updated_at || null, updated_by: meta.updated_at ? 'surgeon' : null };
      if (!scen) {
        return Object.assign(base, { preset: 'story', label: 'Demo story (mock default)',
          description: 'The built-in mock story: Sara Tesfaye has a cardiac emergency, the others blip now and then.',
          config: Object.assign({}, SC.DEFAULT, { preset: 'story' }), resolved: null, expected_status: null });
      }
      var res = SC.resolve(scen, ids), p = SC.PRESETS.filter(function (x) { return x.key === scen.preset; })[0] || SC.PRESETS[0];
      return Object.assign(base, { preset: scen.preset, label: p.label, description: p.description,
        config: Object.assign({}, SC.DEFAULT, scen), resolved: res, expected_status: res.mode === 'fixed' ? SC.expected(res) : null });
    },
    setScenario: function (data) {
      data = data || {};
      if (data.preset === 'story') { localStorage.removeItem(LS_SCEN); scen = null; }
      else {
        if (!SC.PRESETS.some(function (p) { return p.key === data.preset; })) err(400, 'preset must be one of ' + SC.PRESETS.map(function (p) { return p.key; }).join(', '));
        var event = null;
        if (data.preset === 'space_weather') {
          var eid = data.event_id || (data.event || {}).id;
          event = ((global.ASTRA_DONKI || {}).events || []).filter(function (e) { return e.id === eid && (e.level === 'critical' || e.level === 'caution'); })[0];
          if (!event) err(400, 'pick a real DONKI SEP event or M/X-class flare (event_id)');
          event = { id: event.id, type: event.type, time: event.time, label: event.label, link: event.link, level: event.level };
        }
        scen = { preset: data.preset, target: Number(data.target) || 2, system: data.system || 'cardiovascular',
          custom: data.custom || {}, cabin: data.cabin || { level: 'normal', system: 'co2' }, anomaly_rate: data.anomaly_rate || 0.002, event: event };
        lsSet(LS_SCEN, scen); scenarioMode();
      }
      var meta = lsGet(LS_SCEN + '_meta', { version: 0 });
      lsSet(LS_SCEN + '_meta', { version: meta.version + 1, updated_at: new Date().toISOString() });
      var out = { scenario: MockAPI.getScenario() };
      if (data.reset) out.reset = MockAPI.resetSim().resolved;
      if (data.apply_now) out.batch = MockAPI.simTick();
      return out;
    },
    resetSim: function () {
      var n = 0;
      state.alerts.forEach(function (al) { if (!al.resolved) { al.resolved = true; al.resolved_by = 'surgeon'; n++; } });
      lsSet(LS_RESET_AT, Date.now());
      return { resolved: n };
    },
    simTick: function () {
      var fired = tick();
      return { saved: CREW.length * 16 + 8, errors: [], alerts: fired.map(function (al) { return { level: al.level, message: al.message, astronaut: al.astronaut || 'CABIN' }; }) };
    },
    getSpaceWeather: function () {
      if (!global.AstraSpaceWeather) err(404, 'space weather not loaded on this page');
      var d = global.AstraSpaceWeather.fromSnapshot();
      d.active_replay = scen && scen.preset === 'space_weather' ? clone(scen.event) : null;
      return d;
    },
    onTick: function (fn) { state.listeners.push(fn); },
    missionDay: function () { return missionDay(Date.now()); },
    TICK_MS: TICK_MS,
    _start: start           // api.js starts the live mock ticker only in mock mode
  };

  scenarioMode();
  seed();
  global.MockAPI = MockAPI;
  global.MOCK_CREW = CREW;
})(window);
