/* Simulation Lab - Scenario Control (flight surgeon, testing tool): choose what the device
 * simulator sends - presets, a per-astronaut custom grid, Apply / Reset alerts / Push batch now -
 * and watch the crew react. Started by lab.js once a flight surgeon is signed in. */
AstraLab.onReady(function () {
  'use strict';
  var A = Astra, S = AstraScenarios;
  var $ = function (id) { return document.getElementById(id); };
  var COL = { normal: 'green', caution: 'yellow', critical: 'red' };
  var SYS_SHORT = { cardiovascular: 'Cardio', respiratory: 'Respiratory', radiation: 'Radiation', behavioral: 'Behavioral', immune: 'Immune' };
  var CAB_SHORT = { co2: 'CO₂', o2: 'O₂', radiation: 'Radiation', noise: 'Noise' };
  var PRESET_ICON = { nominal: 'shield', one_caution: 'user', one_critical: 'heart', mixed: 'users', several_caution: 'users',
    all_critical: 'alert', cabin_co2: 'wind', radiation_storm: 'radiation', space_weather: 'radiation', realistic: 'pulse', custom: 'gauge' };

  document.querySelectorAll('#counters small').forEach(function (s) {
    s.innerHTML = s.innerHTML.replace('__RED__', A.ST_ICON.red).replace('__YELLOW__', A.ST_ICON.yellow).replace('__GREEN__', A.ST_ICON.green);
  });
  document.querySelectorAll('.disclaimer-box, .sc-col a.btn').forEach(function (n) {
    n.innerHTML = n.innerHTML.replace('__SHIELD__', A.ICONS.shield).replace('__ARROW__', A.ICONS.arrow || '→');
  });
  if (Api.USE_MOCK) {
    $('sc-note').innerHTML = '<div class="banner st-yellow reveal in"><span class="b-ico">' + A.ST_ICON.yellow + '</span><div><div class="b-tag">Demo data mode</div>' +
      '<h3>Scenarios run in this browser only</h3><p>Mock mode has no simulator; the demo data follows the scenario you apply here (saved in this browser). ' +
      '<button class="linkish" type="button" id="sc-story">Back to the built-in demo story</button> · The <a href=\"/app/support.html\">crew app</a> in this browser follows it.</p></div></div>';
    $('sc-story').addEventListener('click', function () { Api.setScenario({ preset: 'story', reset: true }).then(function () { location.reload(); }); });
  }

  var crew = [], active = null, draft = null, dirty = false, busy = false;

  /* ---------- draft state ---------- */
  function fromConfig(cfg) {
    var d = { preset: cfg.preset === 'story' ? 'realistic' : cfg.preset, target: Number(cfg.target) || 2, system: cfg.system || 'cardiovascular',
      anomaly_rate: Number(cfg.anomaly_rate) || 0.002, custom: {}, cabin: Object.assign({ level: 'normal', system: 'co2' }, cfg.cabin || {}),
      event: cfg.event || null };
    crew.forEach(function (a) { d.custom[a.id] = Object.assign({ level: 'normal', system: 'cardiovascular' }, (cfg.custom || {})[a.id] || {}); });
    return d;
  }
  function payload() {
    return { preset: draft.preset, target: draft.target, system: draft.system, anomaly_rate: draft.anomaly_rate, custom: draft.custom, cabin: draft.cabin,
      event: draft.event, event_id: draft.event ? draft.event.id : undefined };
  }
  function resolvedDraft() { return S.resolve(payload(), crew.map(function (a) { return a.id; })); }
  function markDirty() { dirty = true; renderAll(); }

  /* ---------- presets ---------- */
  function dots(res) {
    return crew.map(function (a) {
      var st = res.astronauts[a.id] || { level: 'normal' };
      return '<i class="sc-dot st-' + COL[st.level] + '" title="' + A.esc(a.name.split(' ')[0] + ': ' + st.level + (st.level !== 'normal' ? ' (' + st.system + ')' : '')) + '"></i>';
    }).join('') + '<i class="sc-dot cabin st-' + COL[res.cabin.level] + '" title="Cabin: ' + res.cabin.level + '"></i>';
  }
  function renderPresets() {
    var ids = crew.map(function (a) { return a.id; });
    $('sc-presets').innerHTML = S.PRESETS.map(function (p) {
      var res = S.resolve(Object.assign(payload(), { preset: p.key }), ids);
      var isActive = active && active.preset === p.key;
      return '<button type="button" class="sc-preset' + (p.key === draft.preset ? ' on' : '') + '" data-p="' + p.key + '" aria-pressed="' + (p.key === draft.preset) + '">' +
        '<span class="sc-ico">' + (A.ICONS[PRESET_ICON[p.key]] || A.ICONS.pulse) + '</span>' +
        '<span class="sc-title">' + A.esc(p.label) + (isActive ? ' <span class="tag ack">Active</span>' : '') + '</span>' +
        '<span class="sc-desc">' + A.esc(p.description) + '</span>' +
        '<span class="sc-dots">' + (res.mode === 'random' ? '<span class="dim">mostly green · random blips</span>' : dots(res)) + '</span></button>';
    }).join('');
  }
  $('sc-presets').addEventListener('click', function (e) {
    var b = e.target.closest('[data-p]'); if (!b) return;
    draft.preset = b.dataset.p;
    if (draft.preset === 'space_weather' && !draft.event && sw && sw.replay.length) draft.event = pickEvent(sw.replay[0]);
    markDirty();
  });

  /* ---------- replay a real NASA DONKI event ---------- */
  var sw = null;
  function pickEvent(e) { return { id: e.id, type: e.type, time: e.time, label: e.label, link: e.link, level: e.level }; }
  function utc(t) { return String(t || '').replace('T', ' ').replace('Z', ' UTC'); }
  function renderReplay() {
    if (!sw) return;
    var st = sw.state || {};
    $('sc-sw-src').innerHTML = (sw.source === 'live' ? '<span class="tag ack">live DONKI + cached history</span>' : '<span class="tag">cached snapshot ' + A.esc((sw.fetched_at || '').slice(0, 10)) + '</span>') +
      ' now: <b>' + A.esc(st.level || 'quiet') + '</b>';
    var sel = draft && draft.preset === 'space_weather' && draft.event ? draft.event.id : null;
    $('sc-sw').innerHTML = sw.replay.length ? sw.replay.map(function (e) {
      var col = e.level === 'critical' ? 'red' : 'yellow';
      return '<button type="button" class="sc-ev st-' + col + (e.id === sel ? ' on' : '') + '" data-ev="' + A.esc(e.id) + '" aria-pressed="' + (e.id === sel) + '">' +
        '<span class="sw-type">' + A.esc(e.type) + '</span><span class="sc-ev-main"><b>' + A.esc(e.label) + '</b><small>' + A.esc(utc(e.time)) + ' · ' + A.esc(e.id) + '</small></span>' +
        '<span class="badge st-' + col + '">' + (e.level === 'critical' ? 'storm' : 'caution') + '</span></button>';
    }).join('') : '<p class="empty">No replayable events.</p>';
  }
  $('sc-sw').addEventListener('click', function (e) {
    var b = e.target.closest('[data-ev]'); if (!b || !sw) return;
    var ev = sw.replay.filter(function (x) { return x.id === b.dataset.ev; })[0]; if (!ev) return;
    draft.preset = 'space_weather'; draft.event = pickEvent(ev); markDirty();
  });
  Api.getSpaceWeather().then(function (d) { sw = d; if (draft) renderAll(); })
    .catch(function (e) { $('sc-sw').innerHTML = '<p class="empty">NASA DONKI unavailable: ' + A.esc(e.message) + '</p>'; });

  /* ---------- options ---------- */
  function fillOptions() {
    $('sc-target').innerHTML = crew.map(function (a) { return '<option value="' + a.id + '">' + A.esc(a.name) + '</option>'; }).join('');
    $('sc-system').innerHTML = Object.keys(S.SYSTEMS).map(function (k) { return '<option value="' + k + '">' + A.esc(S.SYSTEMS[k]) + '</option>'; }).join('');
  }
  function renderOptions() {
    $('sc-target').value = draft.target; $('sc-system').value = draft.system; $('sc-rate').value = String(draft.anomaly_rate);
    var p = draft.preset;
    $('sc-target').disabled = ['one_caution', 'one_critical', 'mixed', 'several_caution'].indexOf(p) < 0;
    $('sc-system').disabled = ['one_caution', 'one_critical', 'mixed'].indexOf(p) < 0;
    $('sc-rate').disabled = p !== 'realistic';
  }
  $('sc-target').addEventListener('change', function () { draft.target = Number(this.value); markDirty(); });
  $('sc-system').addEventListener('change', function () { draft.system = this.value; markDirty(); });
  $('sc-rate').addEventListener('change', function () { draft.anomaly_rate = Number(this.value); markDirty(); });

  /* ---------- custom grid ---------- */
  function segFor(key, level) {
    return '<div class="seg sc-seg" role="group" aria-label="Level" data-row="' + key + '">' + S.LEVELS.map(function (l) {
      return '<button type="button" data-l="' + l + '" class="lv-' + COL[l] + '" aria-pressed="' + (l === level) + '">' + { normal: 'Normal', caution: 'Caution', critical: 'Critical' }[l] + '</button>';
    }).join('') + '</div>';
  }
  function sysSelect(key, value, systems, short) {
    return '<select class="input sc-sys" data-row="' + key + '" aria-label="System">' + Object.keys(systems).map(function (k) {
      return '<option value="' + k + '"' + (k === value ? ' selected' : '') + '>' + A.esc(short[k]) + '</option>';
    }).join('') + '</select>';
  }
  function renderCustom() {
    var res = resolvedDraft(), shown = draft.preset === 'custom' ? null : res;
    var rows = crew.map(function (a) {
      var st = shown ? res.astronauts[a.id] : draft.custom[a.id];
      return '<div class="sc-row st-' + COL[st.level] + '"><span class="avatar">' + A.esc(A.initials(a.name)) + '</span><div class="sc-who"><b>' + A.esc(a.name) + '</b><small>' + A.esc(a.role) + '</small></div>' +
        segFor(a.id, st.level) + sysSelect(a.id, st.system, S.SYSTEMS, SYS_SHORT) + '</div>';
    });
    var cab = shown ? res.cabin : draft.cabin;
    rows.push('<div class="sc-row st-' + COL[cab.level] + '"><span class="avatar">' + A.ICONS.wind + '</span><div class="sc-who"><b>Cabin</b><small>shared environment sensors</small></div>' +
      segFor('cabin', cab.level) + sysSelect('cabin', cab.system, S.CABIN_SYSTEMS, CAB_SHORT) + '</div>');
    $('sc-custom').innerHTML = rows.join('');
    $('sc-custom').classList.toggle('derived', !!shown);
  }
  function toCustom() {
    if (draft.preset === 'custom') return;
    var res = resolvedDraft();             // start the custom grid from what the preset would do
    crew.forEach(function (a) { draft.custom[a.id] = Object.assign({}, res.astronauts[a.id]); });
    draft.cabin = Object.assign({}, res.cabin);
    draft.preset = 'custom';
  }
  $('sc-custom').addEventListener('click', function (e) {
    var b = e.target.closest('.sc-seg button'); if (!b) return;
    toCustom();
    var key = b.parentNode.dataset.row;
    (key === 'cabin' ? draft.cabin : draft.custom[key]).level = b.dataset.l;
    markDirty();
  });
  $('sc-custom').addEventListener('change', function (e) {
    var sel = e.target.closest('.sc-sys'); if (!sel) return;
    toCustom();
    var key = sel.dataset.row;
    (key === 'cabin' ? draft.cabin : draft.custom[key]).system = sel.value;
    markDirty();
  });

  /* ---------- preview ---------- */
  function renderPreview() {
    var res = resolvedDraft(), p = S.PRESETS.filter(function (x) { return x.key === draft.preset; })[0];
    var html = '<div class="sc-pv-title"><b>' + A.esc(p.label) + '</b><span class="dim">' + A.esc(p.description) + '</span></div>';
    if (res.mode === 'random') {
      html += '<div class="sc-pv-row"><span class="badge st-green">' + A.ST_ICON.green + 'Mostly nominal</span><span class="dim">random blips at rate ' + res.anomaly_rate + ' per astronaut per tick; each clears by itself after about 2 minutes</span></div>';
    } else {
      var n = { red: 0, yellow: 0, green: 0 };
      html += '<div class="sc-pv-row">' + crew.map(function (a) {
        var st = res.astronauts[a.id]; n[COL[st.level]]++;
        return '<span class="badge st-' + COL[st.level] + '">' + A.ST_ICON[COL[st.level]] + A.esc(a.name.split(' ')[0]) + (st.level !== 'normal' ? ' · ' + SYS_SHORT[st.system] : '') + '</span>';
      }).join('') + '<span class="badge st-' + COL[res.cabin.level] + '">' + A.ST_ICON[COL[res.cabin.level]] + 'Cabin' + (res.cabin.level !== 'normal' ? ' · ' + CAB_SHORT[res.cabin.system] : '') + '</span></div>' +
        '<div class="dim" style="font-size:12.5px">Expected: ' + n.red + ' critical · ' + n.yellow + ' caution · ' + n.green + ' nominal' + (res.cabin.level !== 'normal' ? ' · cabin ' + res.cabin.level : '') + '</div>';
    }
    if (draft.preset === 'space_weather') {
      html += draft.event ? '<div class="dim" style="font-size:12.5px">Event: <b>' + A.esc(draft.event.label) + '</b> · ' + A.esc(utc(draft.event.time)) +
        ' · <a href="' + A.esc(draft.event.link) + '" target="_blank" rel="noopener">' + A.esc(draft.event.id) + ' ↗</a></div>'
        : '<div class="dim">Pick an event in “Replay a real event”.</div>';
    }
    $('sc-preview').innerHTML = html;
    $('sc-dirty').textContent = dirty ? 'not applied yet' : (active ? 'this is the active scenario' : '');
    $('sc-apply-btn').classList.toggle('pulse', dirty);
  }
  function renderAll() { renderPresets(); renderOptions(); renderCustom(); renderPreview(); renderReplay(); }

  /* ---------- actions ---------- */
  function run(btn, fn) {
    if (busy) return; busy = true; btn.disabled = true;
    return fn().catch(function (e) {
      A.toast(e.status === 403 ? 'Only the flight surgeon can change the simulation' : (e.message || 'Request failed'), 'red');
    }).then(function () { busy = false; btn.disabled = false; });
  }
  $('sc-apply-btn').addEventListener('click', function () {
    run(this, function () {
      var body = Object.assign(payload(), { reset: $('sc-reset').checked, apply_now: $('sc-now').checked });
      return Api.setScenario(body).then(function (r) {
        active = r.scenario; dirty = false;
        var bits = [];
        if (r.reset !== undefined) bits.push(r.reset + ' alert' + (r.reset === 1 ? '' : 's') + ' resolved');
        if (r.batch) bits.push('batch pushed, ' + r.batch.alerts.length + ' new alert' + (r.batch.alerts.length === 1 ? '' : 's'));
        A.toast('Scenario applied: ' + r.scenario.label, 'green', bits.join(' · ') || 'The simulator picks it up on its next tick');
        renderActive(); renderAll(); refresh();
      });
    });
  });
  $('sc-reset-btn').addEventListener('click', function () {
    run(this, function () {
      return Api.resetSim().then(function (r) { A.toast(r.resolved + ' open alert' + (r.resolved === 1 ? '' : 's') + ' resolved', 'green', 'Crew status starts clean'); refresh(); });
    });
  });
  $('sc-tick-btn').addEventListener('click', function () {
    run(this, function () {
      return Api.simTick().then(function (r) { A.toast('Batch pushed', r.alerts.length ? 'yellow' : 'green', r.alerts.length + ' new alert' + (r.alerts.length === 1 ? '' : 's')); refresh(); });
    });
  });

  /* ---------- live ---------- */
  function renderActive() {
    if (!active) return;
    $('sc-active').textContent = active.label + (active.version ? ' · v' + active.version : '');
    $('sc-active').title = (active.updated_by ? 'changed by ' + active.updated_by + ' ' : '') + (active.updated_at ? A.fmtTime(active.updated_at, true) + ' EAT' : '');
  }
  var seen = null;
  function refresh() {
    return Promise.all([Api.getCrew(), Api.getAlerts({ resolved: false, limit: 100 }), Api.getScenario()]).then(function (res) {
      var list = res[0].astronauts, alerts = res[1].alerts, sc = res[2];
      if (!crew.length) {
        crew = list.map(function (a) { return { id: a.id, name: a.name, role: a.role }; });
        fillOptions();
      }
      if (!active || sc.version !== active.version) {
        var changedElsewhere = active && !dirty && sc.version !== active.version;
        active = sc;
        if (!draft || !dirty) draft = fromConfig(sc.config);
        if (changedElsewhere) A.toast('Scenario changed: ' + sc.label, 'yellow', sc.updated_by ? 'by ' + sc.updated_by : '');
        renderActive(); renderAll();
      }
      var n = { red: 0, yellow: 0, green: 0 }, exp = sc.expected_status || {};
      $('sc-live').innerHTML = list.map(function (a) {
        n[a.status]++;
        var e = exp[a.id], ok = !e || e === a.status;
        return '<li class="sc-live-row st-' + a.status + '"><span class="avatar">' + A.esc(A.initials(a.name)) + '</span><div class="sc-who"><b>' + A.esc(a.name) + '</b><small>' + a.open_alerts + ' open alert' + (a.open_alerts === 1 ? '' : 's') + '</small></div>' +
          (e ? '<span class="sc-exp st-' + e + '" title="Expected ' + A.statusLabel(e) + '">' + A.ST_ICON[e] + '</span><span class="dim">→</span>' : '') +
          A.badge(a.status) + (e ? '<span class="sc-match ' + (ok ? 'ok' : 'wait') + '" title="' + (ok ? 'matches the scenario' : 'waiting for the next batch / old alerts to clear') + '">' + (ok ? '✓' : '…') + '</span>' : '') + '</li>';
      }).join('');
      A.countTo($('sc-red'), n.red); A.countTo($('sc-yellow'), n.yellow); A.countTo($('sc-green'), n.green); A.countTo($('sc-open'), alerts.length);
      $('ct-red').classList.toggle('hot', n.red > 0);
      var cabinOpen = alerts.filter(function (al) { return !al.astronaut_id; });
      $('sc-cabin').textContent = cabinOpen.length ? cabinOpen.length + ' cabin' : 'cabin clear';
      $('sc-alert-count').textContent = alerts.length ? alerts.length + ' open' : '';
      var sig = JSON.stringify(alerts.slice(0, 15).map(function (al) { return al.id; }));
      if ($('sc-alerts').dataset.sig !== sig) {
        $('sc-alerts').dataset.sig = sig;
        $('sc-alerts').innerHTML = alerts.length ? alerts.slice(0, 15).map(function (al) { return A.alertItem(al, { showName: true }); }).join('')
          : '<li class="empty">' + A.ST_ICON.green + 'No open alerts. All crew nominal.</li>';
      }
      // simulator heartbeat: newest reading across the crew
      var last = list.reduce(function (m, a) { var t = a.last_reading_at ? Date.parse(a.last_reading_at) : 0; return Math.max(m, t); }, 0);
      var age = last ? Math.round((Date.now() - last) / 1000) : null, okSim = age !== null && age < 20;
      var chip = $('sc-sim'); chip.className = 'chip st-' + (Api.USE_MOCK ? 'green' : okSim ? 'green' : 'red');
      $('sc-sim-text').textContent = Api.USE_MOCK ? 'Mock simulator (this browser)' : age === null ? 'Simulator: no data yet' : okSim ? 'Simulator sending · ' + Math.max(0, age) + ' s ago' : 'Simulator silent for ' + (age > 120 ? Math.round(age / 60) + ' min' : age + ' s');
      if (!Api.USE_MOCK && !okSim) chip.title = 'No reading for ' + (age === null ? 'ever' : age + ' s') + '. Start device_simulator/simulator.py (or the astra-sim service). "Push batch now" still works.';
      if (seen) {
        var fresh = alerts.filter(function (al) { return !seen[al.id] && al.level === 'red'; });
        if (fresh.length) A.toast((fresh[0].astronaut || 'Cabin') + ': ' + fresh[0].message, 'red', fresh.length > 1 ? '+' + (fresh.length - 1) + ' more critical' : 'New critical alert');
      }
      seen = {}; alerts.forEach(function (al) { seen[al.id] = 1; });
    });
  }
  A.poll(refresh);
});
