/* Astronaut's own health dashboard (surgeons can view any astronaut with ?astronaut=<id>). */
(function () {
  'use strict';
  var A = Astra, C = A.COLORS, R = AstraRules;
  var session = A.requireLogin(['astronaut', 'surgeon']);
  if (!session) return;
  A.init('health');
  var aid = A.viewedAstronaut(session);
  var isSurgeon = session.role === 'surgeon';
  var member = null, buffers = {}, lastCallLevel = null;

  ['vitalsTitle:pulse', 'modulesTitle:shield', 'recsTitle:clipboard', 'hrTitle:heart', 'sleepTitle:moon', 'radTitle:radiation'].forEach(function (x) {
    var p = x.split(':'); document.getElementById(p[0]).insertAdjacentHTML('afterbegin', A.ICONS[p[1]]);
  });
  document.getElementById('actCheckin').insertAdjacentHTML('afterbegin', A.ICONS.clipboard);
  document.getElementById('actPvt').insertAdjacentHTML('afterbegin', A.ICONS.zap);
  document.getElementById('actHistory').insertAdjacentHTML('afterbegin', A.ICONS.chart);
  document.getElementById('actHistory').href = 'history.html' + (isSurgeon ? '?astronaut=' + aid : '');
  if (isSurgeon) {
    document.getElementById('actCheckin').classList.add('hidden');
    document.getElementById('actPvt').classList.add('hidden');
    var sw = document.getElementById('crewSwitch'); sw.classList.remove('hidden');
    Api.getCrew().then(function (c) {
      sw.innerHTML = '<a href="support.html">← Mission Support</a>' + c.astronauts.map(function (a) {
        return '<a class="' + (a.id === aid ? 'active' : '') + '" href="my-health.html?astronaut=' + a.id + '">' + A.esc(a.name) + '</a>';
      }).join('');
    });
  }

  // Vital tiles: metric, reference text (non-baseline metrics), sparkline colour
  var VITALS = [
    { m: 'heart_rate', base: 'heart_rate', ref: 'normal ≤ 100' },
    { m: 'hrv', ref: 'normal ≥ 30 ms' },
    { m: 'spo2', ref: 'normal ≥ 95 %' },
    { m: 'systolic_bp', base: 'systolic_bp', label: 'Blood pressure', unit: 'mmHg', ref: 'normal ≤ 140' },
    { m: 'body_temperature', ref: 'fever > 38.0 °C' },
    { m: 'respiration_rate', ref: 'normal ≤ 22 /min' },
    { m: 'blood_glucose', ref: 'safe 60 – 140' },
    { m: 'stress_level', ref: 'high > 75' }
  ];
  var MODULES = [
    { sys: 'cardiovascular', metrics: ['heart_rate', 'resting_heart_rate', 'hrv', 'spo2', 'systolic_bp', 'ecg_rhythm'], note: 'Fluid shift in microgravity changes heart load and blood pressure.' },
    { sys: 'musculoskeletal', metrics: ['exercise_minutes', 'urine_calcium', 'grip_strength', 'body_mass', 'distance'], note: 'Bone loses ~1–1.5 % per month without loading; target ≥ 60 min exercise.' },
    { sys: 'immune', metrics: ['body_temperature', 'skin_temperature', 'blood_glucose'], note: 'Spaceflight dampens immunity; watch for fever and glucose swings.' },
    { sys: 'behavioral', metrics: ['sleep_total', 'stress_level', 'recovery_score', 'pvt_reaction_time', 'pvt_lapses'], note: 'Isolation and shifted sleep raise fatigue risk before critical tasks.' },
    { sys: 'radiation', metrics: ['radiation_dose'], note: 'Per-reading dose from the personal dosimeter plus mission cumulative.' },
    { sys: 'environment', metrics: ['co2', 'o2', 'noise', 'cabin_temperature'], cabin: true, note: 'Shared cabin sensors. CO₂ above ~4,000 ppm causes headaches.' }
  ];

  function fmtDelta(v, b) {
    var d = Math.round((v - b) / b * 100);
    var cls = Math.abs(d) <= 10 ? 'd-ok' : d > 0 ? 'd-up' : 'd-down';
    return '<span class="' + cls + '">' + (d > 0 ? '+' : '') + d + '%</span>';
  }

  function renderVitals(m) {
    var b = member.baselines || {};
    document.getElementById('vitals').innerHTML = VITALS.map(function (v) {
      var meta = A.METRICS[v.m], r = m[v.m], lv = A.levelOf(r);
      var val = A.fmtVal(r);
      if (v.m === 'systolic_bp') { val = A.fmtVal(r) + '<span style="font-size:24px;color:var(--muted)">/' + A.fmtVal(m.diastolic_bp) + '</span>'; }
      var base = v.base && b[v.base] && r ? '<span>baseline ' + b[v.base] + (v.m === 'systolic_bp' ? '/' + b.diastolic_bp : '') + '</span>' + fmtDelta(r.value, b[v.base]) : '<span>' + v.ref + '</span><span>' + A.statusLabel(lv) + '</span>';
      return '<div class="panel vital l-' + lv + '"><div class="vital-head"><span>' + A.ICONS[meta.icon] + (v.label || meta.label) + '</span>' + (lv !== 'green' ? A.pill(lv) : '') + '</div>' +
        '<div class="vital-val"><b class="num">' + val + '</b><em>' + (v.unit || meta.unit) + '</em></div>' +
        '<div class="vital-base">' + base + '</div><canvas id="vs-' + v.m + '"></canvas></div>';
    }).join('');
    VITALS.forEach(function (v) {
      var r = m[v.m], buf = buffers[v.m] = buffers[v.m] || [];
      if (r && typeof r.value === 'number' && (!buf._ts || buf._ts !== r.timestamp)) { buf.push(r.value); buf._ts = r.timestamp; if (buf.length > 40) buf.shift(); }
      var lv = A.levelOf(r);
      AstraChart.sparkline(document.getElementById('vs-' + v.m), buf, lv === 'green' ? C.cyan : C[lv]);
    });
  }

  function renderModules(m, cab, alerts, cumulative) {
    document.getElementById('modules').innerHTML = MODULES.map(function (mod) {
      var src = mod.cabin ? cab : m;
      var levels = mod.metrics.map(function (k) { return A.levelOf(src[k]); });
      alerts.forEach(function (al) { if (al.system === mod.sys) levels.push(al.level); });
      var lv = R.worst(levels), sys = A.SYSTEMS[mod.sys];
      var rows = mod.metrics.map(function (k) {
        var meta = A.METRICS[k], r = src[k];
        var extra = k === 'sleep_total' && m.sleep_deep ? ' <small class="dim">(deep ' + A.fmtVal(m.sleep_deep) + ' · REM ' + A.fmtVal(m.sleep_rem) + ')</small>' : '';
        return '<span>' + meta.label + extra + '</span><b class="l-' + A.levelOf(r) + '">' + A.fmtVal(r) + ' <small class="dim">' + meta.unit + '</small></b>';
      });
      if (mod.sys === 'radiation') {
        rows.push('<span>Mission cumulative</span><b>' + (cumulative ? cumulative.toFixed(1) : '—') + ' <small class="dim">mSv</small></b>');
        rows.push('<span>Cabin radiation</span><b class="l-' + A.levelOf(cab.cabin_radiation) + '">' + A.fmtVal(cab.cabin_radiation) + ' <small class="dim">mSv/day</small></b>');
        rows.push('<span>Career limit used</span><b>' + (cumulative ? (cumulative / 600 * 100).toFixed(1) : '—') + ' <small class="dim">% of 600</small></b>');
      }
      var n = alerts.filter(function (al) { return al.system === mod.sys; }).length;
      return '<div class="panel module l-' + lv + '"><div class="module-head"><div class="module-icon">' + A.ICONS[sys.icon] + '</div><div><h3>' + sys.label + '</h3><small>' + (n ? n + ' open alert' + (n > 1 ? 's' : '') : 'no open alerts') + '</small></div>' + A.pill(lv) + '</div>' +
        '<div class="kv">' + rows.join('') + '</div><div class="module-note">' + mod.note + '</div></div>';
    }).join('');
  }

  function renderRecs(alerts) {
    // one recommendation per (system, message type) - newest first
    var seen = {}, recs = [];
    alerts.forEach(function (al) { var k = al.level + al.message.split(':')[0]; if (!seen[k]) { seen[k] = 1; recs.push(al); } });
    recs.sort(function (a, b) { return (b.level === 'red') - (a.level === 'red'); });
    document.getElementById('recsCount').textContent = alerts.length + ' open alert' + (alerts.length === 1 ? '' : 's');
    document.getElementById('recs').innerHTML = recs.length ? recs.slice(0, 7).map(function (al) {
      return '<div class="alert-item' + A.animCls(al.id) + ' l-' + al.level + '"><div class="alert-ico">' + A.ICONS.alert + '</div><div><h4>' + A.esc(al.recommendation) + '</h4><p>' + A.esc(al.message) + '</p>' +
        '<div class="meta"><span>' + A.esc(A.SYSTEMS[al.system] ? A.SYSTEMS[al.system].label : al.system) + '</span><span>' + A.ago(al.created_at) + '</span></div>' +
        (al.level === 'red' && !isSurgeon ? '<button class="btn btn-danger btn-sm mt contact-btn" style="margin-top:10px">' + A.ICONS.headset + 'Contact mission support</button>' : '') +
        '</div><span></span></div>';
    }).join('') : '<div class="empty">' + A.ICONS.check + 'No recommendations. Keep up the routine!</div>';
  }

  function renderCallout(status, alerts) {
    var el = document.getElementById('callout');
    if (status === lastCallLevel && status !== 'red') return;
    lastCallLevel = status;
    var reds = alerts.filter(function (a) { return a.level === 'red'; });
    if (status === 'red') {
      el.innerHTML = '<div class="callout red">' + A.ICONS.alert + '<div><h3>Critical: ' + A.esc(reds[0] ? reds[0].message : 'critical alert') + (reds.length > 1 ? ' (+' + (reds.length - 1) + ' more)' : '') + '</h3>' +
        '<p>' + A.esc(reds[0] ? reds[0].recommendation : '') + '</p></div>' +
        (isSurgeon ? '' : '<button class="btn btn-danger contact-btn">' + A.ICONS.headset + 'Contact mission support</button>') + '</div>';
    } else if (status === 'yellow') {
      el.innerHTML = '<div class="callout yellow">' + A.ICONS.alert + '<div><h3>Caution: ' + alerts.length + ' item' + (alerts.length > 1 ? 's' : '') + ' need attention</h3><p>See the recommendations below. Re-check after resting.</p></div></div>';
    } else {
      el.innerHTML = '<div class="callout green">' + A.ICONS.check + '<div><h3>All systems nominal</h3><p>No open alerts. Remember today\'s check-in and exercise session.</p></div></div>';
    }
  }

  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('.contact-btn')) {
      A.toast('Mission support has been notified. Flight surgeon will call you shortly.', 'green');
    }
  });

  var cumulative = null;
  function refresh() {
    return Promise.all([Api.getCrewMember(aid), Api.getLatest(aid), Api.getCabin(), Api.getAlerts({ astronaut: aid, resolved: false, limit: 50 })]).then(function (res) {
      member = res[0];
      var m = A.byMetric(res[1].readings), cab = A.byMetric(res[2].readings), alerts = res[3].alerts;
      document.getElementById('pAvatar').textContent = A.initials(member.name);
      document.getElementById('pName').textContent = isSurgeon ? member.name : member.name + ' · My Health';
      document.getElementById('pStatus').innerHTML = A.pill(member.status);
      document.getElementById('pRole').textContent = member.role;
      document.getElementById('pMission').textContent = member.mission;
      document.getElementById('pDay').textContent = 'Mission day ' + A.missionDay();
      document.getElementById('pUpdated').textContent = member.last_reading_at ? 'updated ' + A.fmtTime(member.last_reading_at, true) + ' EAT' : '';
      renderCallout(member.status, alerts);
      renderVitals(m);
      renderModules(m, cab, alerts, cumulative);
      renderRecs(alerts);
      A.setConn(true);
    });
  }

  function hoursFmt(t) { return A.fmtTime(new Date(t).toISOString()); }
  function dayFmt(t) { return new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: A.TZ }); }

  function loadCharts() {
    Api.getHistory(aid, 'heart_rate', 24, 500).then(function (h) {
      var pts = h.readings.map(function (r) { return { t: Date.parse(r.timestamp), v: r.value }; });
      var base = member && member.baselines ? member.baselines.heart_rate : null;
      var th = [{ v: 110, color: C.red, label: 'red > 110' }, { v: 100, color: C.yellow, label: 'yellow > 100' }];
      if (base) th.push({ v: base, color: C.cyan, label: 'baseline ' + base });
      AstraChart.line(document.getElementById('hrChart'), pts, { color: C.cyan, thresholds: th, unit: 'bpm', xFormat: hoursFmt, tipFormat: function (t) { return A.fmtDateTime(new Date(t).toISOString()) + ' EAT'; }, pointColor: function (v) { return v > 110 ? C.red : v > 100 ? C.yellow : null; } });
      var vals = h.readings.map(function (r) { return r.value; });
      document.getElementById('hrSub').textContent = 'min ' + Math.min.apply(null, vals) + ' · max ' + Math.max.apply(null, vals) + ' bpm';
    });
    Api.getHistory(aid, 'sleep_total', 168).then(function (h) {
      var pts = h.readings.map(function (r) { return { t: Date.parse(r.timestamp), v: r.value }; });
      AstraChart.line(document.getElementById('sleepChart'), pts, { bars: true, color: C.violet, yMin: 0, yMax: 9, decimals: 0, unit: 'h', xFormat: dayFmt, tipFormat: function (t) { return A.fmtDate(new Date(t).toISOString()); }, thresholds: [{ v: 5, color: C.yellow, label: 'short sleep < 5 h' }], pointColor: function (v) { return v < 5 ? C.yellow : C.violet; } });
    });
    Api.getHistory(aid, 'radiation_dose', 168, 500).then(function (h) {
      var md = A.missionDay(), sum = Math.max(0, md - 7) * 0.5, pts = [], prev = null;
      h.readings.forEach(function (r) {
        var t = Date.parse(r.timestamp);
        var dt = prev === null ? 1 : Math.max(0, (t - prev) / 86400000);
        sum += r.value * dt; prev = t;
        pts.push({ t: t, v: Math.round(sum * 100) / 100 });
      });
      cumulative = sum;
      document.getElementById('radSub').textContent = sum.toFixed(1) + ' mSv mission total';
      AstraChart.line(document.getElementById('radChart'), pts, { color: '#fb923c', decimals: 1, unit: 'mSv', xFormat: dayFmt, tipFormat: function (t) { return A.fmtDateTime(new Date(t).toISOString()) + ' EAT'; } });
    });
  }

  function seedBuffers() {
    return Promise.all(VITALS.map(function (v) {
      return Api.getHistory(aid, v.m, 6, 30).then(function (h) {
        var b = buffers[v.m] = h.readings.map(function (r) { return r.value; }).filter(function (x) { return typeof x === 'number'; });
        b._ts = h.readings.length ? h.readings[h.readings.length - 1].timestamp : null;
      }).catch(function () {});
    }));
  }

  seedBuffers().then(refresh).then(loadCharts);
  setTimeout(function () { A.poll(refresh); }, Api.POLL_MS);
  setInterval(loadCharts, 30000);
  window.addEventListener('resize', function () { clearTimeout(window._rz); window._rz = setTimeout(loadCharts, 200); });
})();
