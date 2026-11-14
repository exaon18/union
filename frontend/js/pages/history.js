/* History: metric selector, time range, chart, readings table, alert history. */
(function () {
  'use strict';
  var A = Astra, C = A.COLORS;
  var session = A.requireLogin(['astronaut', 'surgeon']);
  if (!session) return;
  A.init('history');
  var isSurgeon = session.role === 'surgeon';
  var params = new URLSearchParams(location.search);
  var aid = A.viewedAstronaut(session);
  var metric = params.get('metric') || 'heart_rate';
  var hours = Number(params.get('hours')) || 24;
  var alertFilter = 'all';
  ['chartTitle:chart', 'tableTitle:clipboard', 'alertTitle:alert'].forEach(function (x) { var p = x.split(':'); document.getElementById(p[0]).insertAdjacentHTML('afterbegin', A.ICONS[p[1]]); });

  // Alert thresholds drawn on the chart (mirror of health/sensor_rules.py)
  var THRESH = {
    heart_rate: [[100, 'yellow', '> 100'], [110, 'red', '> 110']],
    hrv: [[30, 'yellow', '< 30']],
    spo2: [[95, 'yellow', '< 95'], [92, 'red', '< 92']],
    systolic_bp: [[140, 'yellow', '> 140'], [160, 'red', '> 160']],
    body_temperature: [[38, 'red', '> 38.0']],
    respiration_rate: [[22, 'yellow', '> 22']],
    blood_glucose: [[140, 'yellow', '> 140'], [180, 'red', '> 180'], [60, 'red', '< 60']],
    stress_level: [[75, 'yellow', '> 75']],
    radiation_dose: [[1, 'red', '> 1.0']],
    sleep_total: [[5, 'yellow', '< 5']],
    urine_calcium: [[250, 'yellow', '> 250'], [300, 'red', '> 300']],
    exercise_minutes: [[60, 'yellow', '< 60']],
    pvt_lapses: [[3, 'yellow', '≥ 3'], [6, 'red', '≥ 6']]
  };
  var GROUPS = [
    ['Cardiovascular', ['heart_rate', 'resting_heart_rate', 'hrv', 'spo2', 'systolic_bp', 'diastolic_bp', 'respiration_rate']],
    ['Immune', ['body_temperature', 'skin_temperature', 'blood_glucose']],
    ['Behavioral', ['stress_level', 'sleep_total', 'sleep_deep', 'sleep_rem', 'recovery_score', 'pvt_reaction_time', 'pvt_lapses']],
    ['Bone & Muscle', ['exercise_minutes', 'urine_calcium', 'grip_strength', 'body_mass', 'distance', 'calories_burned']],
    ['Radiation', ['radiation_dose']]
  ];
  var sel = document.getElementById('metricSel');
  sel.innerHTML = GROUPS.map(function (g) {
    return '<optgroup label="' + g[0] + '">' + g[1].map(function (m) { return '<option value="' + m + '"' + (m === metric ? ' selected' : '') + '>' + A.METRICS[m].label + '</option>'; }).join('') + '</optgroup>';
  }).join('');
  sel.addEventListener('change', function () { metric = sel.value; sync(); load(); });

  if (isSurgeon) {
    var as = document.getElementById('astroSel'); as.classList.remove('hidden');
    Api.getCrew().then(function (c) {
      as.innerHTML = c.astronauts.map(function (a) { return '<option value="' + a.id + '"' + (a.id === aid ? ' selected' : '') + '>' + A.esc(a.name) + '</option>'; }).join('');
    });
    as.addEventListener('change', function () { aid = Number(as.value); sync(); load(); loadAlerts(); });
  }

  var seg = document.getElementById('rangeSeg');
  function markRange() { seg.querySelectorAll('button').forEach(function (b) { b.classList.toggle('active', Number(b.dataset.h) === hours); }); }
  seg.addEventListener('click', function (e) { var h = e.target.dataset && e.target.dataset.h; if (!h) return; hours = Number(h); markRange(); sync(); load(); });
  markRange();
  document.getElementById('alertSeg').addEventListener('click', function (e) {
    var f = e.target.dataset && e.target.dataset.f; if (!f) return; alertFilter = f;
    this.querySelectorAll('button').forEach(function (b) { b.classList.toggle('active', b.dataset.f === f); });
    loadAlerts();
  });

  function sync() {
    var q = new URLSearchParams(); if (isSurgeon) q.set('astronaut', aid); q.set('metric', metric); q.set('hours', hours);
    history.replaceState(null, '', 'history.html?' + q.toString());
  }

  function stat(label, value, unit, lv) {
    return '<div class="panel env l-' + (lv || 'green') + '" style="padding:16px 18px"><small>' + label + '</small><b>' + value + '<em>' + (unit || '') + '</em></b></div>';
  }

  function load() {
    var meta = A.METRICS[metric];
    Api.getHistory(aid, metric, hours, 500).then(function (h) {
      document.getElementById('hTitle').textContent = 'History · ' + h.astronaut;
      var rs = h.readings.filter(function (r) { return typeof r.value === 'number'; });
      var vals = rs.map(function (r) { return r.value; });
      var d = meta.dec !== undefined ? meta.dec : 1;
      var latest = rs[rs.length - 1];
      var nAlert = rs.filter(function (r) { return A.levelOf(r) !== 'green'; }).length;
      document.getElementById('stats').innerHTML = vals.length ? [
        stat('Latest', latest.value.toFixed(d), meta.unit, A.levelOf(latest)),
        stat('Average', (vals.reduce(function (s, v) { return s + v; }, 0) / vals.length).toFixed(d), meta.unit),
        stat('Min / Max', Math.min.apply(null, vals).toFixed(d) + ' / ' + Math.max.apply(null, vals).toFixed(d), meta.unit),
        stat('Out of range', nAlert + ' / ' + vals.length, 'readings', nAlert ? 'yellow' : 'green')
      ].join('') : '';
      document.getElementById('chartTitle').lastChild.textContent = ' ' + meta.label + ' (' + meta.unit + ')';
      document.getElementById('chartSub').textContent = h.count + ' points · last ' + (hours === 168 ? '7 days' : hours + ' h');
      var th = (THRESH[metric] || []).map(function (t) { return { v: t[0], color: C[t[1]], label: t[1] + ' ' + t[2] }; });
      var multiDay = hours > 24;
      var daily = rs.length <= 8 && hours >= 24;
      AstraChart.line(document.getElementById('histChart'), rs.map(function (r) { return { t: Date.parse(r.timestamp), v: r.value }; }), {
        color: C.cyan, thresholds: th, unit: meta.unit, decimals: d > 1 ? d : undefined, bars: daily,
        xFormat: function (t) { var iso = new Date(t).toISOString(); return multiDay ? new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: A.TZ }) : A.fmtTime(iso); },
        tipFormat: function (t) { return A.fmtDateTime(new Date(t).toISOString()) + ' EAT'; },
        pointColor: function (v) { var l = A.levelOf({ metric: metric, value: v, text_value: '' }); return l === 'green' ? (daily ? C.cyan : null) : C[l]; }
      });
      var rows = h.readings.slice().reverse().slice(0, 150).map(function (r) {
        var lv = A.levelOf(r);
        return '<tr class="row-' + lv + '"><td>' + A.fmtDateTime(r.timestamp) + '</td><td class="num"><span class="l-' + lv + '">' + A.fmtVal(r) + '</span> <span class="dim">' + A.esc(r.unit) + '</span></td><td>' + A.esc(r.source) + '</td><td>' + A.pill(lv) + '</td></tr>';
      }).join('');
      document.getElementById('readTable').innerHTML = '<thead><tr><th>Time (EAT)</th><th class="num">Value</th><th>Source</th><th>Status</th></tr></thead><tbody>' + (rows || '<tr><td colspan="4" class="dim">No readings</td></tr>') + '</tbody>';
      document.getElementById('tableSub').textContent = 'newest first' + (h.readings.length > 150 ? ' · showing 150 of ' + h.readings.length : '');
    }).catch(function (e) { A.toast('Could not load history: ' + e.message, 'red'); });
  }

  function loadAlerts() {
    var opts = { astronaut: aid, limit: 50 }; if (alertFilter !== 'all') opts.resolved = alertFilter;
    Api.getAlerts(opts).then(function (res) {
      document.getElementById('alertHist').innerHTML = res.alerts.length ? res.alerts.map(function (al) {
        return '<div class="alert-item l-' + al.level + (al.resolved ? ' resolved' : '') + '"><div class="alert-ico">' + (al.resolved ? A.ICONS.check : A.ICONS.alert) + '</div><div><h4>' + A.esc(al.message) + '</h4><p>' + A.esc(al.recommendation) + '</p>' +
          '<div class="meta"><span>' + A.fmtDateTime(al.created_at) + ' EAT</span><span>' + A.esc(al.system) + '</span><span>' + (al.resolved ? 'resolved' : 'open') + '</span></div></div>' + A.pill(al.level) + '</div>';
      }).join('') : '<div class="empty">' + A.ICONS.check + 'No alerts</div>';
    });
  }

  load(); loadAlerts();
  setInterval(function () { if (!document.hidden) { load(); loadAlerts(); } }, 15000);
  window.addEventListener('resize', function () { clearTimeout(window._rz); window._rz = setTimeout(load, 200); });
})();
