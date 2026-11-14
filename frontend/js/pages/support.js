/* Flight Surgeon / Mission Support console. */
(function () {
  'use strict';
  var A = Astra, C = A.COLORS;
  var session = A.requireLogin(['surgeon']);
  if (!session) return;
  A.init('support');
  var selected = Number(new URLSearchParams(location.search).get('astronaut')) || null;
  var levelFilter = '';
  var ackLocal = {};       // acknowledged alert ids (UI state; backend endpoint not built yet)
  var SEV = { red: 0, yellow: 1, green: 2 };
  ['crewTitle:users', 'alertsTitle:alert', 'drillTitle:eye'].forEach(function (x) { var p = x.split(':'); document.getElementById(p[0]).insertAdjacentHTML('afterbegin', A.ICONS[p[1]]); });
  document.getElementById('drillOpen').insertAdjacentHTML('beforeend', A.ICONS.arrow);
  try { (Api.USE_MOCK ? MockAPI.acknowledged() : JSON.parse(localStorage.getItem('astra_ack') || '[]')).forEach(function (id) { ackLocal[id] = 1; }); } catch (e) { /* ignore */ }

  document.getElementById('levelSeg').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return; levelFilter = b.dataset.l;
    this.querySelectorAll('button').forEach(function (x) { x.classList.toggle('active', x === b); });
    refreshAlerts();
  });

  function crewRow(a, m) {
    var cell = function (k, unit) { var r = m[k]; return '<td class="num"><span class="l-' + A.levelOf(r) + '">' + A.fmtVal(r) + '</span>' + (unit ? ' <span class="dim">' + unit + '</span>' : '') + '</td>'; };
    var bpLv = A.levelOf(m.systolic_bp);
    return '<tr class="row-' + a.status + (a.id === selected ? ' sel' : '') + '" data-id="' + a.id + '" style="cursor:pointer">' +
      '<td><div class="row" style="gap:10px"><div class="avatar sm">' + A.initials(a.name) + '</div><div><b>' + A.esc(a.name) + '</b><div class="dim" style="font-size:12px">' + A.esc(a.role) + '</div></div></div></td>' +
      '<td>' + A.pill(a.status) + '</td>' + cell('heart_rate', 'bpm') + cell('spo2', '%') +
      '<td class="num"><span class="l-' + bpLv + '">' + A.fmtVal(m.systolic_bp) + '/' + A.fmtVal(m.diastolic_bp) + '</span></td>' +
      cell('body_temperature', '°C') + cell('respiration_rate') + '<td class="num"><span class="l-' + A.levelOf(m.ecg_rhythm) + '">' + A.fmtVal(m.ecg_rhythm) + '</span></td>' +
      '<td class="num"><b>' + a.open_alerts + '</b></td><td class="dim">' + (a.last_reading_at ? A.fmtTime(a.last_reading_at, true) : '—') + '</td>' +
      '<td><a class="btn btn-ghost btn-sm" href="my-health.html?astronaut=' + a.id + '">Open</a></td></tr>';
  }

  var latestCache = {};
  function refreshCrew() {
    return Api.getCrew().then(function (crew) {
      var list = crew.astronauts.slice().sort(function (p, q) { return SEV[p.status] - SEV[q.status] || q.open_alerts - p.open_alerts; });
      if (!selected) selected = list[0].id;
      return Promise.all(list.map(function (a) { return Api.getLatest(a.id); })).then(function (lat) {
        lat.forEach(function (l, i) { latestCache[list[i].id] = A.byMetric(l.readings); });
        document.getElementById('crewTable').innerHTML = '<thead><tr><th>Astronaut</th><th>Status</th><th class="num">HR</th><th class="num">SpO₂</th><th class="num">BP</th><th class="num">Temp</th><th class="num">Resp</th><th class="num">ECG</th><th class="num">Alerts</th><th>Updated</th><th></th></tr></thead><tbody>' +
          list.map(function (a) { return crewRow(a, latestCache[a.id]); }).join('') + '</tbody>';
        var n = { red: 0, yellow: 0, green: 0 }; list.forEach(function (a) { n[a.status]++; });
        document.getElementById('headChips').innerHTML = A.pill('red', n.red + ' critical') + A.pill('yellow', n.yellow + ' caution') + A.pill('green', n.green + ' nominal');
        renderDrill(list.filter(function (a) { return a.id === selected; })[0]);
        A.setConn(true);
      });
    });
  }

  document.getElementById('crewTable').addEventListener('click', function (e) {
    if (e.target.closest('a')) return;
    var tr = e.target.closest('tr[data-id]'); if (!tr) return;
    selected = Number(tr.dataset.id);
    history.replaceState(null, '', 'support.html?astronaut=' + selected);
    refreshCrew(); refreshDrillAlerts();
  });

  function renderDrill(a) {
    if (!a) return;
    var m = latestCache[a.id] || {};
    document.getElementById('drillOpen').href = 'my-health.html?astronaut=' + a.id;
    var keys = [['heart_rate', 'bpm'], ['hrv', 'ms'], ['spo2', '%'], ['systolic_bp', 'mmHg'], ['body_temperature', '°C'], ['blood_glucose', 'mg/dL'], ['stress_level', '/100'], ['sleep_total', 'h'], ['urine_calcium', 'mg/day'], ['pvt_lapses', ''], ['radiation_dose', 'mSv/d']];
    var head = '<div class="row" style="gap:14px;margin-bottom:14px"><div class="avatar lg">' + A.initials(a.name) + '</div><div><h3 style="font-size:20px">' + A.esc(a.name) + '</h3><div class="muted" style="font-size:13px">' + A.esc(a.role) + ' · ' + A.esc(a.mission) + '</div><div style="margin-top:6px">' + A.pill(a.status) + '</div></div></div>';
    var kv = '<div class="kv">' + keys.map(function (k) { var meta = A.METRICS[k[0]]; return '<span>' + meta.label + '</span><b class="l-' + A.levelOf(m[k[0]]) + '">' + A.fmtVal(m[k[0]]) + ' <small class="dim">' + k[1] + '</small></b>'; }).join('') + '</div>';
    var body = document.getElementById('drillBody');
    if (!body.dataset.id || Number(body.dataset.id) !== a.id) {
      body.dataset.id = a.id;
      body.innerHTML = head + '<div id="drillKv"></div><div class="module-note"><b style="color:var(--text)">Recent alerts</b></div><div class="alert-list" id="drillAlerts" style="margin-top:10px"></div>' +
        '<div class="row mt"><a class="btn btn-primary btn-sm" href="my-health.html?astronaut=' + a.id + '">' + A.ICONS.heart + 'Health dashboard</a><a class="btn btn-ghost btn-sm" href="history.html?astronaut=' + a.id + '">' + A.ICONS.chart + 'History</a></div>';
      refreshDrillAlerts();
    } else {
      body.querySelector('.avatar').nextElementSibling.querySelector('div:last-child').innerHTML = A.pill(a.status);
    }
    document.getElementById('drillKv').innerHTML = kv;
  }

  function refreshDrillAlerts() {
    if (!selected) return;
    Api.getAlerts({ astronaut: selected, limit: 4 }).then(function (res) {
      var el = document.getElementById('drillAlerts'); if (!el) return;
      el.innerHTML = res.alerts.length ? res.alerts.map(function (al) {
        return '<div class="alert-item l-' + al.level + (al.resolved ? ' resolved' : '') + '" style="padding:10px 12px"><div class="alert-ico">' + A.ICONS.alert + '</div><div><h4>' + A.esc(al.message) + '</h4><div class="meta"><span>' + A.ago(al.created_at) + '</span><span>' + (al.resolved ? 'resolved' : 'open') + '</span></div></div><span></span></div>';
      }).join('') : '<div class="empty">' + A.ICONS.check + 'No alerts</div>';
    });
  }

  function alertItem(al) {
    var acked = !!ackLocal[al.id];
    return '<div class="alert-item l-' + al.level + '" data-alert="' + al.id + '"><div class="alert-ico">' + A.ICONS.alert + '</div>' +
      '<div><h4>' + A.esc(al.astronaut || 'Cabin') + ' · ' + A.esc(al.message) + '</h4><p>' + A.esc(al.recommendation) + '</p>' +
      '<div class="meta"><span>#' + al.id + '</span><span>' + A.esc(al.system) + '</span><span>' + A.fmtTime(al.created_at, true) + ' EAT · ' + A.ago(al.created_at) + '</span>' + (acked ? '<span style="color:var(--cyan-2)">acknowledged</span>' : '') + '</div></div>' +
      '<div class="alert-actions">' + A.pill(al.level) +
      '<div class="row" style="gap:6px"><button class="btn btn-ghost btn-sm" data-act="ack"' + (acked ? ' disabled' : '') + '>' + A.ICONS.eye + (acked ? 'Acked' : 'Acknowledge') + '</button>' +
      '<button class="btn btn-ok btn-sm" data-act="resolve">' + A.ICONS.check + 'Resolve</button></div></div></div>';
  }

  function refreshAlerts() {
    return Api.getAlerts({ resolved: false, level: levelFilter || undefined, limit: 60 }).then(function (res) {
      var list = res.alerts.slice().sort(function (p, q) { return SEV[p.level] - SEV[q.level] || Date.parse(q.created_at) - Date.parse(p.created_at); });
      var el = document.getElementById('openAlerts');
      var sig = list.map(function (a) { return a.id + (ackLocal[a.id] ? 'a' : ''); }).join(',');
      if (el.dataset.sig === sig) return;
      el.dataset.sig = sig;
      el.innerHTML = list.length ? list.map(alertItem).join('') : '<div class="empty">' + A.ICONS.check + 'No open alerts</div>';
    });
  }

  document.getElementById('openAlerts').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]'); if (!b) return;
    var item = b.closest('[data-alert]'), id = Number(item.dataset.alert);
    b.disabled = true;
    if (b.dataset.act === 'ack') {
      Api.acknowledgeAlert(id).catch(function () { /* endpoint may not exist yet */ }).then(function () {
        ackLocal[id] = 1;
        if (!Api.USE_MOCK) localStorage.setItem('astra_ack', JSON.stringify(Object.keys(ackLocal).map(Number)));
        A.toast('Alert #' + id + ' acknowledged', 'green'); refreshAlerts();
      });
    } else {
      Api.resolveAlert(id).then(function () {
        item.style.transition = 'opacity .3s, transform .3s'; item.style.opacity = '0'; item.style.transform = 'translateX(20px)';
        A.toast('Alert #' + id + ' resolved', 'green');
        setTimeout(function () { refreshAlerts(); refreshCrew(); refreshDrillAlerts(); }, 300);
      }).catch(function (err) { b.disabled = false; A.toast('Could not resolve: ' + err.message, 'red'); });
    }
  });

  A.poll(function () { return Promise.all([refreshCrew(), refreshAlerts()]); });
  setInterval(function () { if (!document.hidden) refreshDrillAlerts(); }, 6000);
})();
