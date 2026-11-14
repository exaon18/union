/* Mission Support Console (flight surgeon): crew grid sorted by urgency, active alerts with
 * Acknowledge / Resolve (real POSTs), cabin gauges, and a per-astronaut detail view with the 3D body. */
(function () {
  'use strict';
  var A = Astra, C = A.COLORS;
  var session = A.requireLogin(['surgeon']);
  if (!session) return;
  A.init('support');
  var $ = function (id) { return document.getElementById(id); };
  var RANK = { red: 0, yellow: 1, green: 2 };

  // icons in the static markup
  document.querySelectorAll('#counters small').forEach(function (s) {
    s.innerHTML = s.innerHTML.replace('__RED__', A.ST_ICON.red).replace('__YELLOW__', A.ST_ICON.yellow).replace('__GREEN__', A.ST_ICON.green);
  });
  document.querySelector('.disclaimer-box').innerHTML = document.querySelector('.disclaimer-box').innerHTML.replace('__SHIELD__', A.ICONS.shield);

  /* ---------- cabin gauges ---------- */
  var GAUGES = [
    ['co2', { name: 'CO₂', unit: 'ppm', min: 0, max: 6000, marks: [4000, 5000] }],
    ['o2', { name: 'O₂', unit: '%', min: 16, max: 23, decimals: 1, marks: [19.5] }],
    ['cabin_temperature', { name: 'Temperature', unit: '°C', min: 14, max: 30, decimals: 1, marks: [18, 27] }],
    ['humidity', { name: 'Humidity', unit: '%', min: 0, max: 100, marks: [25, 70] }],
    ['cabin_pressure', { name: 'Pressure', unit: 'kPa', min: 92, max: 106, decimals: 1, marks: [97.9] }],
    ['cabin_radiation', { name: 'Radiation', unit: 'mSv/day', min: 0, max: 2.5, decimals: 2, marks: [1] }],
    ['noise', { name: 'Noise', unit: 'dB', min: 30, max: 85, marks: [70] }]
  ];
  var gaugeFns = {};
  GAUGES.forEach(function (g) { var h = document.createElement('div'); $('gauges').appendChild(h); gaugeFns[g[0]] = A.gauge(h, g[1]); });

  /* ---------- crew cards ---------- */
  var VITALS = [['heart_rate', 'HR', 'bpm', 0], ['spo2', 'SpO₂', '%', 0], ['bp', 'BP', '', 0], ['body_temperature', 'Temp', '°C', 1],
    ['respiration_rate', 'Resp', '/min', 0], ['hrv', 'HRV', 'ms', 0], ['blood_glucose', 'Gluc', '', 0], ['stress_level', 'Stress', '', 0]];
  var cards = {}, hrBuf = {}, crewById = {};
  function card(a) {
    var n = document.createElement('a');
    n.className = 'crew-card st-green'; n.href = 'support.html?astronaut=' + a.id; n.dataset.id = a.id;
    n.innerHTML = '<div class="cc-top"><span class="avatar lg">' + A.esc(A.initials(a.name)) + '</span><div style="flex:1;min-width:0"><div class="cc-name">' + A.esc(a.name) + '</div><div class="cc-role">' + A.esc(a.role) + '</div></div></div>' +
      '<span class="cc-badge"></span>' +
      '<canvas class="spark" style="display:block;width:100%;height:38px;margin-top:8px" aria-hidden="true"></canvas>' +
      '<div class="cc-mini">' + VITALS.map(function (v) { return '<div class="cc-vital" data-k="' + v[0] + '"><small>' + v[1] + '</small><b>—</b>' + (v[2] ? '<i>' + v[2] + '</i>' : '') + '</div>'; }).join('') + '</div>' +
      '<div class="cc-meta"><span>Open alerts <b data-k="open">0</b></span><span data-k="upd"></span></div>' +
      '<span class="cc-open">Open full view ' + A.ICONS.arrow + '</span>';
    n.addEventListener('click', function (e) { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); openDetail(a.id, true); });
    A.tilt(n, 4);
    $('con-grid').appendChild(n); cards[a.id] = n;
    Api.getHistory(a.id, 'heart_rate', 6, 40).then(function (h) { hrBuf[a.id] = h.readings.map(function (r) { return r.value; }); }).catch(function () {});
    return n;
  }

  /* ---------- alerts ---------- */
  var filter = '', allAlerts = [], seen = null;
  $('con-filter').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    filter = b.dataset.f;
    this.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
    renderAlerts(true);
  });
  AstraHealthView.bindAlertActions($('con-alerts'), function () { return refresh(); });
  $('con-alerts').addEventListener('click', function (e) {
    var o = e.target.closest('[data-open]'); if (o) { e.preventDefault(); openDetail(Number(o.dataset.open), true); }
  });
  function renderAlerts(force) {
    var list = allAlerts.filter(function (al) {
      if (filter === 'new') return !al.acknowledged;
      return !filter || al.level === filter;
    });
    var sig = filter + JSON.stringify(list.map(function (a) { return [a.id, a.acknowledged]; }));
    var feed = $('con-alerts');
    if (!force && feed.dataset.sig === sig) return;
    feed.dataset.sig = sig;
    feed.innerHTML = list.length ? list.slice(0, 40).map(function (al) {
      var open = al.astronaut_id ? '<button class="btn btn-sm" data-open="' + al.astronaut_id + '" type="button">' + A.ICONS.user + 'Open</button>' : '';
      return A.alertItem(al, { actions: AstraHealthView.actionButtons(al).replace('</div>', open + '</div>') });
    }).join('') : '<li class="empty">' + A.ST_ICON.green + (filter ? 'Nothing in this filter.' : 'No active alerts. All crew nominal.') + '</li>';
  }

  /* ---------- banner ---------- */
  function renderBanner(list) {
    var reds = allAlerts.filter(function (al) { return al.level === 'red'; });
    var redCrew = list.filter(function (a) { return a.status === 'red'; });
    var html = '';
    if (redCrew.length) {
      var a = redCrew[0], al = reds.filter(function (x) { return x.astronaut_id === a.id; })[0] || reds[0];
      html = '<div class="banner st-red" role="alert"><span class="b-ico">' + A.ST_ICON.red + '</span><div><div class="b-tag">Critical · contact mission support now</div>' +
        '<h3>' + A.esc(a.name) + (al ? ': ' + A.esc(al.message) : '') + (redCrew.length > 1 ? ' <span class="dim">(+' + (redCrew.length - 1) + ' more crew)</span>' : '') + '</h3>' +
        '<p>' + (al ? A.esc(al.recommendation) + ' ' : '') + 'Recommended: call ' + A.esc(a.name.split(' ')[0]) + ' on the voice loop and alert the mission medical team.</p></div>' +
        '<button class="btn btn-danger" type="button" data-open="' + a.id + '">' + A.ICONS.user + 'Open ' + A.esc(a.name.split(' ')[0]) + '</button></div>';
    } else if (reds.length) {
      html = '<div class="banner st-red" role="alert"><span class="b-ico">' + A.ST_ICON.red + '</span><div><div class="b-tag">Critical · cabin</div><h3>' + A.esc(reds[0].message) + '</h3><p>' + A.esc(reds[0].recommendation) + '</p></div></div>';
    }
    var slot = $('con-banner');
    if (slot.dataset.sig !== html) { slot.dataset.sig = html; slot.innerHTML = html; }
  }
  $('con-banner').addEventListener('click', function (e) { var o = e.target.closest('[data-open]'); if (o) openDetail(Number(o.dataset.open), true); });

  /* ---------- refresh ---------- */
  function refresh() {
    if (detailView) return Promise.resolve();
    return Promise.all([Api.getCrew(), Api.getAlerts({ resolved: false, limit: 100 }), Api.getCabin()]).then(function (res) {
      var list = res[0].astronauts.slice().sort(function (p, q) { return RANK[p.status] - RANK[q.status] || q.open_alerts - p.open_alerts || p.id - q.id; });
      allAlerts = res[1].alerts;
      var cab = A.byMetric(res[2].readings);
      return Promise.all(list.map(function (a) { return Api.getLatest(a.id); })).then(function (latest) {
        var n = { red: 0, yellow: 0, green: 0 };
        list.forEach(function (a, i) {
          crewById[a.id] = a; n[a.status]++;
          var m = A.byMetric(latest[i].readings), node = cards[a.id] || card(a);
          node.style.order = i; A.setStatus(node, a.status);
          node.querySelector('.cc-badge').innerHTML = A.badge(a.status);
          VITALS.forEach(function (v) {
            var cell = node.querySelector('[data-k="' + v[0] + '"]'), out = cell.querySelector('b');
            if (v[0] === 'bp') { out.textContent = A.fmtVal(m.systolic_bp) + '/' + A.fmtVal(m.diastolic_bp); A.setStatus(cell, AstraRules.worst([A.levelOf(m.systolic_bp), A.levelOf(m.diastolic_bp)])); }
            else { A.countTo(out, m[v[0]] ? m[v[0]].value : null, v[3]); A.setStatus(cell, A.levelOf(m[v[0]])); }
          });
          var buf = hrBuf[a.id] = hrBuf[a.id] || [];
          if (m.heart_rate && buf._ts !== m.heart_rate.timestamp) { buf.push(m.heart_rate.value); buf._ts = m.heart_rate.timestamp; if (buf.length > 40) buf.shift(); }
          AstraChart.sparkline(node.querySelector('.spark'), buf, C[a.status === 'green' ? 'cyan' : a.status]);
          node.querySelector('[data-k="open"]').textContent = a.open_alerts;
          node.querySelector('[data-k="upd"]').textContent = a.last_reading_at ? A.fmtTime(a.last_reading_at, true) + ' EAT' : 'no data';
          node.setAttribute('aria-label', a.name + ', ' + A.statusLabel(a.status) + ', ' + a.open_alerts + ' open alerts. Open full view.');
        });
        A.countTo($('con-red'), n.red); A.countTo($('con-yellow'), n.yellow); A.countTo($('con-green'), n.green); A.countTo($('con-open'), allAlerts.length);
        $('ct-red').classList.toggle('hot', n.red > 0);
        var unack = allAlerts.filter(function (al) { return !al.acknowledged; }).length;
        $('con-unack').textContent = unack ? unack + ' not yet acknowledged' : 'all acknowledged';
        $('con-count').textContent = allAlerts.length ? allAlerts.length + (allAlerts.length >= 100 ? '+' : '') : '';
        if (list[0]) $('con-mission').textContent = list[0].mission + ' · mission day ' + A.missionDay() + ' · ' + list.length + ' crew. Most urgent first. Acknowledge when seen; resolve when handled.';
        renderBanner(list);
        renderAlerts();
        GAUGES.forEach(function (g) { var r = cab[g[0]]; gaugeFns[g[0]](r ? r.value : null, A.levelOf(r)); });
        $('cabin-updated').textContent = res[2].readings.length ? 'updated ' + A.fmtTime(res[2].readings[0].timestamp, true) + ' EAT' : '';
        if (seen) {
          var fresh = allAlerts.filter(function (al) { return !seen[al.id] && al.level === 'red'; });
          if (fresh.length) A.toast((fresh[0].astronaut || 'Cabin') + ': ' + fresh[0].message, 'red', fresh.length > 1 ? '+' + (fresh.length - 1) + ' more critical' : 'New critical alert');
        }
        seen = {}; allAlerts.forEach(function (al) { seen[al.id] = 1; });
        A.alarm.set(n.red > 0 || allAlerts.some(function (al) { return al.level === 'red' && !al.acknowledged; }));
      });
    });
  }

  /* ---------- detail view (one astronaut, 3D body) ---------- */
  var detailView = null;
  function openDetail(id, push) {
    if (!id) return;
    if (push) history.pushState({ astronaut: id }, '', 'support.html?astronaut=' + id);
    if (detailView) detailView.destroy();
    $('overview').hidden = true;
    var box = $('detail'); box.hidden = false; box.className = 'view';
    window.scrollTo(0, 0);
    detailView = AstraHealthView.mount(box, {
      aid: id, isSurgeon: true,
      onBack: function () { history.pushState({}, '', 'support.html'); closeDetail(); },
      onUpdate: function (m) { document.title = m.name + ' · Support Console · ASTRA HEALTH'; A.alarm.set(m.status === 'red'); }
    });
  }
  function closeDetail() {
    if (detailView) { detailView.destroy(); detailView = null; }
    $('detail').hidden = true; $('overview').hidden = false;
    document.title = 'Support Console · ASTRA HEALTH';
    refresh();
  }
  window.addEventListener('popstate', function () {
    var id = Number(new URLSearchParams(location.search).get('astronaut'));
    if (id) openDetail(id, false); else closeDetail();
  });

  var start = Number(new URLSearchParams(location.search).get('astronaut'));
  if (start) openDetail(start, false);
  A.poll(refresh);
})();
