/* Public Mission Dashboard: 3D station hero, crew cards, cabin gauges, alert headlines. */
(function () {
  'use strict';
  var A = Astra;
  A.init('mission');
  var session = A.getSession();
  var $ = function (id) { return document.getElementById(id); };

  $('mission-day').textContent = A.missionDay();
  if (session) {
    var cta = $('cta-main');
    cta.textContent = session.role === 'surgeon' ? 'Open the Support Console' : 'Open My Health';
    cta.href = session.role === 'surgeon' ? 'support.html' : 'my-health.html';
  }

  // Cabin gauges: [metric, config]
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
  GAUGES.forEach(function (g) { var host = document.createElement('div'); $('gauges').appendChild(host); gaugeFns[g[0]] = A.gauge(host, g[1]); });

  // Which module each crew member is shown in on the 3D station (the API has no location yet).
  var MODULES = ['command', 'lab', 'habitat', 'cupola', 'node'];
  var station = null, lastCrew = null;
  A.load3d('station').then(function (m) {
    station = m.createStation($('station'), { onSelect: function (id) { $('station-reset').hidden = false; openCrew(id); } });
    if (lastCrew) station.setCrew(lastCrew);
  }).catch(function (e) {
    console.warn('3D station unavailable:', e.message);
    $('station-hint').textContent = '3D view not available on this device';
    $('station').classList.add('scene-fallback');
    $('station').insertAdjacentHTML('afterbegin', '<div class="station-fallback" aria-hidden="true">' + A.ICONS.globe + '</div>');
  });
  $('station-reset').addEventListener('click', function (e) { if (station) station.reset(); e.currentTarget.hidden = true; });

  var cards = {}, latestById = {}, crewById = {};
  function crewCard(a) {
    var n = document.createElement('button');
    n.type = 'button'; n.className = 'crew-card st-green';
    n.innerHTML = '<div class="cc-top"><span class="avatar lg">' + A.esc(A.initials(a.name)) + '</span><div><div class="cc-name">' + A.esc(a.name) + '</div><div class="cc-role">' + A.esc(a.role) + '</div></div></div>' +
      '<span class="cc-badge"></span>' +
      '<div class="cc-vitals"><div class="cc-vital" data-k="heart_rate"><small>Heart rate</small><b>—</b><i>bpm</i></div><div class="cc-vital" data-k="spo2"><small>SpO₂</small><b>—</b><i>%</i></div></div>' +
      '<div class="cc-meta"><span>Open alerts <b data-k="open">0</b></span><span data-k="upd">—</span></div>';
    n.addEventListener('click', function () { openCrew(a.id); if (station) { station.select(a.id, true); $('station-reset').hidden = false; } });
    A.tilt(n);
    $('crew-grid').appendChild(n); cards[a.id] = n;
    return n;
  }

  function openCrew(id) {
    var a = crewById[id], m = latestById[id] || {};
    if (!a) return;
    var link = '';
    if (session && session.role === 'surgeon') link = '<a class="btn btn-primary" href="support.html?astronaut=' + a.id + '">Open in Support Console</a>';
    else if (session && session.astronaut_id === a.id) link = '<a class="btn btn-primary" href="my-health.html">Open My Health</a>';
    A.modal('<div class="row" style="gap:14px"><span class="avatar lg">' + A.esc(A.initials(a.name)) + '</span><div><h2 style="margin:0">' + A.esc(a.name) + '</h2><p>' + A.esc(a.role) + ' · ' + A.esc(a.mission) + '</p></div></div>' +
      '<div style="margin-top:14px">' + A.badge(a.status) + '</div>' +
      '<div class="cc-vitals" style="margin-top:14px"><div class="cc-vital st-' + A.levelOf(m.heart_rate) + '"><small>Heart rate</small><b>' + A.fmtVal(m.heart_rate) + '</b><i>bpm</i></div><div class="cc-vital st-' + A.levelOf(m.spo2) + '"><small>SpO₂</small><b>' + A.fmtVal(m.spo2) + '</b><i>%</i></div></div>' +
      '<p class="dim" style="margin-top:14px;font-size:13px">This is the public view. Full medical detail is visible only to the crew member and the flight surgeon.</p>' +
      '<div class="modal-actions"><button class="btn" data-close>Close</button>' + link + '</div>');
  }

  function refreshCrew() {
    return Api.getCrew().then(function (crew) {
      var list = crew.astronauts;
      return Promise.all(list.map(function (a) { return Api.getLatest(a.id); })).then(function (latest) {
        var ok = 0, open = 0, worst = [];
        if (list[0]) $('mission-name').textContent = list[0].mission;
        list.forEach(function (a, i) {
          crewById[a.id] = a; latestById[a.id] = A.byMetric(latest[i].readings);
          var m = latestById[a.id], n = cards[a.id] || crewCard(a);
          if (a.status === 'green') ok++;
          open += a.open_alerts; worst.push(a.status);
          A.setStatus(n, a.status);
          n.querySelector('.cc-badge').innerHTML = A.badge(a.status);
          ['heart_rate', 'spo2'].forEach(function (k) {
            var cell = n.querySelector('[data-k="' + k + '"]');
            A.setStatus(cell, A.levelOf(m[k]));
            A.countTo(cell.querySelector('b'), m[k] ? m[k].value : null, 0);
          });
          n.querySelector('[data-k="open"]').textContent = a.open_alerts;
          n.querySelector('[data-k="upd"]').textContent = a.last_reading_at ? 'updated ' + A.fmtTime(a.last_reading_at, true) + ' EAT' : 'no data';
          n.setAttribute('aria-label', a.name + ', ' + a.role + ', ' + A.statusLabel(a.status));
        });
        A.countTo($('stat-crew'), list.length); A.countTo($('stat-ok'), ok); A.countTo($('stat-alerts'), open);
        var overall = AstraRules.worst(worst);
        $('stat-overall').innerHTML = A.badge(overall);
        lastCrew = list.map(function (a, i) { return { id: a.id, name: a.name, status: a.status, location: MODULES[i % MODULES.length] }; });
        if (station) station.setCrew(lastCrew);
        A.alarm.set(overall === 'red', { sound: false });
      });
    });
  }

  function refreshCabin() {
    return Api.getCabin().then(function (cab) {
      var m = A.byMetric(cab.readings);
      GAUGES.forEach(function (g) { var r = m[g[0]]; gaugeFns[g[0]](r ? r.value : null, A.levelOf(r)); });
      var ts = cab.readings.length ? cab.readings[0].timestamp : null;
      $('cabin-updated').textContent = ts ? 'updated ' + A.fmtTime(ts, true) + ' EAT' : '';
    });
  }

  var seen = null;
  function refreshAlerts() {
    return Api.getAlerts({ resolved: false, limit: 30 }).then(function (res) {
      var list = res.alerts;
      $('feed-count').textContent = list.length ? (list.length >= 30 ? '30+' : list.length) + ' open' : '';
      $('feed').innerHTML = list.length ? list.slice(0, 12).map(function (al) { return A.alertItem(al, { detail: false }); }).join('')
        : '<li class="empty">' + A.ST_ICON.green + 'No open alerts. All systems nominal.</li>';
      if (seen) {
        var fresh = list.filter(function (al) { return !seen[al.id] && al.level === 'red'; });
        if (fresh.length) A.toast((fresh[0].astronaut || 'Cabin') + ': ' + fresh[0].message, 'red', fresh.length > 1 ? '+' + (fresh.length - 1) + ' more critical' : 'Critical');
      }
      seen = {}; list.forEach(function (al) { seen[al.id] = 1; });
    });
  }

  A.poll(function () { return Promise.all([refreshCrew(), refreshCabin(), refreshAlerts()]); });
})();
