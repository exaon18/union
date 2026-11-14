/* Public Mission Dashboard */
(function () {
  'use strict';
  var A = Astra, C = A.COLORS;
  A.init('mission');
  var session = A.getSession();
  var hrBuf = {};     // astronaut id -> recent HR values for sparklines
  var seenAlerts = null;

  document.getElementById('crewTitle').insertAdjacentHTML('afterbegin', A.ICONS.users);
  document.getElementById('cabinTitle').insertAdjacentHTML('afterbegin', A.ICONS.rocket);
  document.getElementById('snapTitle').insertAdjacentHTML('afterbegin', A.ICONS.pulse);
  document.getElementById('recentTitle').insertAdjacentHTML('afterbegin', A.ICONS.alert);
  document.getElementById('tickerIcon').innerHTML = A.ICONS.alert;
  document.getElementById('ctaIcon').innerHTML = A.ICONS.login;
  document.getElementById('missionDay').textContent = A.missionDay();
  if (session) {
    var cta = document.getElementById('ctaBtn');
    cta.textContent = session.role === 'surgeon' ? 'Open Mission Support' : 'Open My Health';
    cta.href = session.role === 'surgeon' ? 'support.html' : 'my-health.html';
  }

  // Cabin metrics shown as tiles: [metric, max for the bar, limit text]
  var CABIN_TILES = [
    ['co2', 6000, 'Caution > 4,000 · Critical > 5,000 ppm'],
    ['o2', 25, 'Critical < 19.5 %'],
    ['cabin_radiation', 2, 'Critical > 1.0 mSv/day'],
    ['noise', 90, 'Caution > 70 dB'],
    ['cabin_temperature', 30, 'Comfort 18 – 27 °C'],
    ['humidity', 100, 'Comfort 25 – 70 %']
  ];

  function crewCard(a, latest) {
    var m = A.byMetric(latest.readings);
    var hr = m.heart_rate, sp = m.spo2;
    var hl = A.levelOf(hr), sl = A.levelOf(sp);
    var href = session && session.role === 'surgeon' ? 'my-health.html?astronaut=' + a.id : (session && session.astronaut_id === a.id ? 'my-health.html' : '#');
    return '<article class="panel crew-card st-' + a.status + '" data-id="' + a.id + '">' +
      '<div class="crew-top"><div class="avatar">' + A.initials(a.name) + '</div><div class="crew-name"><h3>' + A.esc(a.name) + '</h3><small>' + A.esc(a.role) + '</small></div></div>' +
      '<div class="crew-status">' + A.pill(a.status) + '<span class="alerts-n"><b>' + a.open_alerts + '</b> open alert' + (a.open_alerts === 1 ? '' : 's') + '</span></div>' +
      '<div class="crew-vitals">' +
      '<div class="cv l-' + hl + '"><small><span class="beat">' + A.ICONS.heart + '</span>Heart rate</small><b class="num">' + A.fmtVal(hr) + '</b><em>bpm</em></div>' +
      '<div class="cv l-' + sl + '"><small>' + A.ICONS.lungs + 'SpO₂</small><b class="num">' + A.fmtVal(sp) + '</b><em>%</em></div>' +
      '</div>' +
      '<canvas class="crew-spark" id="spark' + a.id + '"></canvas>' +
      '<div class="crew-foot"><span>' + A.ICONS.clock + ' ' + (a.last_reading_at ? 'updated ' + A.fmtTime(a.last_reading_at, true) + ' EAT' : 'no data') + '</span><span>heart-rate trend</span></div>' +
      (href !== '#' ? '<a href="' + href + '" style="position:absolute;inset:0" aria-label="Open ' + A.esc(a.name) + '"></a>' : '') +
      '</article>';
  }

  function seedSparks(crew) {
    crew.forEach(function (a) {
      Api.getHistory(a.id, 'heart_rate', 6, 40).then(function (h) {
        hrBuf[a.id] = h.readings.map(function (r) { return r.value; }).slice(-40);
      }).catch(function () {});
    });
  }

  function refreshCrew() {
    return Api.getCrew().then(function (crew) {
      if (!Object.keys(hrBuf).length) seedSparks(crew.astronauts);
      var counts = { green: 0, yellow: 0, red: 0 }, open = 0;
      crew.astronauts.forEach(function (a) { counts[a.status]++; open += a.open_alerts; });
      document.getElementById('sumGreen').textContent = counts.green;
      document.getElementById('sumYellow').textContent = counts.yellow;
      document.getElementById('sumRed').textContent = counts.red;
      document.getElementById('crewCount').textContent = crew.count;
      return Promise.all(crew.astronauts.map(function (a) { return Api.getLatest(a.id); })).then(function (latest) {
        document.getElementById('crewGrid').innerHTML = crew.astronauts.map(function (a, i) { return crewCard(a, latest[i]); }).join('');
        renderSnapshot(crew.astronauts, latest);
        crew.astronauts.forEach(function (a, i) {
          var hr = A.byMetric(latest[i].readings).heart_rate;
          var buf = hrBuf[a.id] = hrBuf[a.id] || [];
          if (hr && typeof hr.value === 'number') { buf.push(hr.value); if (buf.length > 40) buf.shift(); }
          AstraChart.sparkline(document.getElementById('spark' + a.id), buf, C[a.status === 'green' ? 'cyan' : a.status]);
        });
        A.setConn(true);
      });
    });
  }

  var SNAP = [['systolic_bp', 'BP'], ['body_temperature', 'Temp'], ['respiration_rate', 'Resp'], ['hrv', 'HRV'], ['blood_glucose', 'Glucose'], ['stress_level', 'Stress'], ['ecg_rhythm', 'ECG']];
  function renderSnapshot(crew, latest) {
    var head = '<tr><th>Astronaut</th>' + SNAP.map(function (c) { return '<th class="num">' + c[1] + '</th>'; }).join('') + '</tr>';
    var rows = crew.map(function (a, i) {
      var m = A.byMetric(latest[i].readings);
      return '<tr class="row-' + a.status + '"><td><b>' + A.esc(a.name) + '</b></td>' + SNAP.map(function (c) {
        var r = m[c[0]], lv = A.levelOf(r), v = A.fmtVal(r);
        if (c[0] === 'systolic_bp') v = A.fmtVal(r) + '/' + A.fmtVal(m.diastolic_bp);
        return '<td class="num"><span class="l-' + lv + '">' + v + '</span></td>';
      }).join('') + '</tr>';
    }).join('');
    document.getElementById('snapTable').innerHTML = '<thead>' + head + '</thead><tbody>' + rows + '</tbody>';
  }

  function refreshCabin() {
    return Api.getCabin().then(function (cab) {
      var m = A.byMetric(cab.readings);
      document.getElementById('cabinGrid').innerHTML = CABIN_TILES.map(function (t) {
        var r = m[t[0]], meta = A.METRICS[t[0]], lv = A.levelOf(r);
        var pct = r && typeof r.value === 'number' ? Math.min(100, r.value / t[1] * 100) : 0;
        return '<div class="env l-' + lv + '"><small>' + A.ICONS[meta.icon] + meta.label + '</small><b>' + A.fmtVal(r) + '<em>' + meta.unit + '</em></b>' +
          '<div class="bar"><i style="width:' + pct.toFixed(1) + '%"></i></div><div class="lim">' + t[2] + '</div></div>';
      }).join('');
      document.getElementById('cabinExtra').innerHTML =
        '<span>' + A.ICONS.gauge + ' Pressure <b class="num" style="color:var(--text)">' + A.fmtVal(m.cabin_pressure) + ' kPa</b></span>' +
        '<span>' + A.ICONS.leaf + ' VOC <b class="num" style="color:var(--text)">' + A.fmtVal(m.voc) + ' mg/m³</b></span>';
      var ts = cab.readings.length ? cab.readings[0].timestamp : null;
      document.getElementById('cabinUpdated').textContent = ts ? 'updated ' + A.fmtTime(ts, true) + ' EAT' : '—';
    });
  }

  function refreshAlerts() {
    return Api.getAlerts({ resolved: false, limit: 30 }).then(function (res) {
      var list = res.alerts;
      document.getElementById('sumAlerts').textContent = list.length >= 30 ? '30+' : list.length;
      // Ticker (duplicated content for seamless loop)
      var items = list.slice(0, 12).map(function (al) {
        return '<span class="ticker-item"><span class="dot" style="background:' + C[al.level] + ';box-shadow:0 0 10px ' + C[al.level] + '"></span>' +
          '<b>' + A.esc(al.astronaut || 'CABIN') + '</b> ' + A.esc(al.message) + ' <span class="t">' + A.fmtTime(al.created_at) + '</span></span>';
      }).join('');
      if (!items) items = '<span class="ticker-item"><span class="dot" style="background:' + C.green + '"></span>All systems nominal</span>';
      var tk = document.getElementById('ticker');
      if (tk.dataset.sig !== items) { tk.innerHTML = items + items; tk.dataset.sig = items; }
      document.getElementById('recentAlerts').innerHTML = list.length ? list.slice(0, 5).map(function (al) {
        return '<div class="alert-item' + A.animCls(al.id) + ' l-' + al.level + '"><div class="alert-ico">' + A.ICONS.alert + '</div><div><h4>' + A.esc(al.message) + '</h4>' +
          '<div class="meta"><span>' + A.esc(al.astronaut || 'Cabin') + '</span><span>' + A.esc(al.system) + '</span><span>' + A.ago(al.created_at) + '</span></div></div><span></span></div>';
      }).join('') : '<div class="empty">' + A.ICONS.check + 'No open alerts</div>';
      // toast for brand-new red alerts
      if (seenAlerts) {
        var fresh = list.filter(function (al) { return !seenAlerts[al.id] && al.level === 'red'; });
        if (fresh.length) A.toast((fresh[0].astronaut || 'Cabin') + ': ' + fresh[0].message + (fresh.length > 1 ? ' (+' + (fresh.length - 1) + ' more)' : ''), 'red');
      }
      seenAlerts = {}; list.forEach(function (al) { seenAlerts[al.id] = 1; });
    });
  }

  A.poll(function () { return Promise.all([refreshCrew(), refreshCabin(), refreshAlerts()]); });
})();
