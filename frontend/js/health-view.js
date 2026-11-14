/* ASTRA HEALTH - one astronaut's full health view, shared by "My Health" (astronaut) and the
 * Support Console detail view (flight surgeon): banner, live vitals, 3D body map, alerts,
 * history charts, latest check-in and PVT results. Uses only the real API calls in api.js. */
(function (global) {
  'use strict';
  var A = Astra, C = A.COLORS;

  // Live vital tiles: [metric, label, unit, decimals, baseline key]
  var TILES = [
    ['heart_rate', 'Heart rate', 'bpm', 0, 'heart_rate', 'heart'],
    ['spo2', 'SpO₂', '%', 0, null, 'lungs'],
    ['systolic_bp', 'Blood pressure', 'mmHg', 0, 'systolic_bp', 'gauge'],
    ['body_temperature', 'Body temp', '°C', 1, null, 'thermo'],
    ['respiration_rate', 'Respiration', '/min', 0, null, 'wind'],
    ['hrv', 'HRV', 'ms', 0, null, 'pulse'],
    ['blood_glucose', 'Glucose', 'mg/dL', 0, null, 'drop'],
    ['stress_level', 'Stress', '/100', 0, null, 'brain']
  ];

  /* ---------- surgeon actions on alerts (shared with the console overview) ---------- */
  function actionButtons(al) {
    if (al.resolved) return '';
    return '<div class="fi-actions">' +
      (al.acknowledged ? '' : '<button class="btn btn-sm" data-ack="' + al.id + '">' + A.ICONS.eye + 'Acknowledge</button>') +
      '<button class="btn btn-sm ' + (al.level === 'red' ? 'btn-danger' : 'btn-ok') + '" data-resolve="' + al.id + '">' + A.ICONS.check + 'Resolve</button>' +
      '</div>';
  }
  /** Delegate Acknowledge / Resolve clicks inside `root`. after() re-renders. */
  function bindAlertActions(root, after) {
    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-ack],[data-resolve]'); if (!b || b.disabled) return;
      var ack = b.hasAttribute('data-ack'), id = b.getAttribute(ack ? 'data-ack' : 'data-resolve');
      var row = b.closest('.feed-item'), title = row ? row.querySelector('.fi-title').textContent : 'Alert #' + id;
      b.disabled = true; b.textContent = ack ? 'Acknowledging…' : 'Resolving…';
      (ack ? Api.acknowledgeAlert(id) : Api.resolveAlert(id)).then(function () {
        A.toast(ack ? 'Alert acknowledged' : 'Alert resolved', 'green', title);
        if (!ack && row) { row.style.transition = 'opacity .35s, transform .35s'; row.style.opacity = '0'; row.style.transform = 'translateX(16px)'; }
        return after && after();
      }).catch(function (err) {
        A.toast(ack ? 'Could not acknowledge' : 'Could not resolve', 'red', err.status === 403 ? 'Only the flight surgeon can do this.' : err.message);
        b.disabled = false; b.textContent = ack ? 'Acknowledge' : 'Resolve';
      });
    });
  }

  function mount(root, opts) {
    var aid = opts.aid, isSurgeon = !!opts.isSurgeon;
    var stopped = false, timers = [], member = null, latest = {}, openAlerts = [], buffers = {}, body3d = null, picked = null, popup = null;
    var q = function (sel) { return root.querySelector(sel); };

    root.innerHTML =
      '<div data-slot="banner"></div>' +
      '<div class="page-head">' +
        '<div>' + (isSurgeon ? '<button class="back-link" data-back type="button">' + A.ICONS.arrow + 'Support Console</button>' : '') +
          '<div class="detail-head"><span class="avatar xl" data-k="avatar">—</span><div>' +
            '<div class="eyebrow" style="margin-bottom:6px">' + (isSurgeon ? 'Astronaut detail · flight surgeon view' : 'My health · live') + '</div>' +
            '<h1 data-k="name">—</h1><p class="muted" data-k="role"></p></div></div></div>' +
        '<div class="row wrap"><span data-k="status"></span>' +
          (isSurgeon ? '<a class="btn btn-sm" data-k="hist-link" href="history.html">' + A.ICONS.chart + 'Full history</a>'
                     : '<a class="btn btn-sm" href="checkin.html">' + A.ICONS.clipboard + 'Daily check-in</a><a class="btn btn-sm" href="pvt.html">' + A.ICONS.zap + 'Reaction test</a>') +
        '</div></div>' +
      '<section class="grid g-12">' +
        '<div class="panel span-8 lg-12 reveal"><div class="panel-head"><h2>Live vitals <span class="sub" data-k="updated"></span></h2><span class="live-tag">Live</span></div><div class="tiles" data-k="tiles"></div></div>' +
        '<div class="panel span-4 lg-12 reveal"><div class="panel-head"><h2>' + (isSurgeon ? 'Open alerts' : 'Alerts and what to do') + '</h2><span class="sub" data-k="alert-count"></span></div><ul class="feed mid" data-k="alerts" aria-live="polite"></ul></div>' +
        '<div class="panel span-12 reveal"><div class="panel-head"><h2>Body map <span class="sub">drag to rotate · select an organ</span></h2><button class="btn btn-sm" data-k="body-reset" hidden>Reset view</button></div>' +
          '<div class="body-wrap"><div class="scene body-scene" data-k="body"></div><div><div class="organ-list" data-k="organs"></div>' +
          '<div class="organ-detail" data-k="organ-detail"><p class="dim">Select an organ on the body or in the list to see its readings.</p></div></div></div></div>' +
        '<div class="panel span-6 reveal"><div class="panel-head"><h2>Heart rate <span class="sub">last 24 h · bpm</span></h2><span class="sub" data-k="hr-sub"></span></div><div class="chart-box"><canvas data-c="hr"></canvas></div></div>' +
        '<div class="panel span-6 reveal"><div class="panel-head"><h2>SpO₂ <span class="sub">last 24 h · %</span></h2></div><div class="chart-box"><canvas data-c="spo2"></canvas></div></div>' +
        '<div class="panel span-4 lg-12 reveal"><div class="panel-head"><h2>Sleep <span class="sub">7 nights · h</span></h2></div><div class="chart-box sm"><canvas data-c="sleep"></canvas></div></div>' +
        '<div class="panel span-4 lg-12 reveal"><div class="panel-head"><h2>Reaction time <span class="sub">7 days · ms</span></h2></div><div class="chart-box sm"><canvas data-c="pvt"></canvas></div></div>' +
        '<div class="panel span-4 lg-12 reveal"><div class="panel-head"><h2>Radiation <span class="sub">today</span></h2></div>' +
          '<div class="kv"><div><small>Dose today</small><b data-k="rad-today">—</b><i>mSv/day</i></div><div><small>Cabin</small><b data-k="rad-cabin">—</b><i>mSv/day</i></div></div>' +
          '<div class="rad-row"><span>Est. mission total <b class="mono" data-k="rad-total">—</b> mSv</span><span data-k="rad-pct"></span></div><div class="meter"><span data-k="rad-meter" style="width:0"></span></div>' +
          '<p class="dim" style="font-size:12px;margin-top:8px">Career limit used: 600 mSv (NASA standard).</p></div>' +
        '<div class="panel span-6 lg-12 reveal"><div class="panel-head"><h2>Latest check-in</h2><span data-k="ci-when" class="sub"></span></div><div data-k="checkin"></div></div>' +
        '<div class="panel span-6 lg-12 reveal"><div class="panel-head"><h2>Reaction test results <span class="sub">PVT</span></h2></div><div class="table-wrap"><table class="table" data-k="pvt-table"></table></div></div>' +
        '<div class="span-12 disclaimer-box reveal">' + A.ICONS.shield + '<span><b>Decision-support prototype, not a diagnosis.</b> Rule-based thresholds on simulated data. Every alert must be confirmed by the flight surgeon before any action.</span></div>' +
      '</section>';

    if (isSurgeon) q('[data-back]').addEventListener('click', function () { if (opts.onBack) opts.onBack(); });
    if (isSurgeon) bindAlertActions(q('[data-k="alerts"]'), function () { return refresh(); });

    /* tiles */
    q('[data-k="tiles"]').innerHTML = TILES.map(function (t) {
      return '<div class="tile st-green" data-t="' + t[0] + '"><div class="tile-label"><span class="row" style="gap:6px">' + A.ICONS[t[5]] + A.esc(t[1]) + '</span><span class="dot"></span></div>' +
        '<div class="tile-value"><b>—</b><small>' + A.esc(t[2]) + '</small></div><div class="tile-foot"><span class="st-word">—</span><span class="tile-base"></span></div><canvas class="spark" aria-hidden="true"></canvas></div>';
    }).join('');

    /* organ list + 3D body */
    var organBtns = {};
    A.ORGAN_ORDER.forEach(function (k) {
      var o = A.ORGANS[k], b = document.createElement('button');
      b.type = 'button'; b.className = 'organ-btn st-green'; b.setAttribute('aria-pressed', 'false');
      b.innerHTML = '<span class="o-ico">' + A.ICONS[o.icon] + '</span><span><b>' + A.esc(o.label) + '</b><small class="o-note">—</small></span><span class="o-badge"></span>';
      b.addEventListener('click', function () { pick(k); if (body3d) body3d.select(k, true); });
      q('[data-k="organs"]').appendChild(b); organBtns[k] = b;
    });
    var organs = null;
    function pick(k) {
      picked = k; q('[data-k="body-reset"]').hidden = false;
      A.ORGAN_ORDER.forEach(function (x) { organBtns[x].setAttribute('aria-pressed', x === k); });
      renderOrganDetail();
    }
    function renderOrganDetail() {
      if (!picked || !organs) return;
      var o = organs[picked];
      q('[data-k="organ-detail"]').innerHTML = '<div class="row" style="justify-content:space-between"><h3>' + A.esc(A.ORGANS[picked].label) + '</h3>' + A.badge(o.status) + '</div>' +
        '<p class="muted" style="font-size:13.5px">' + A.esc(o.note) + '</p><ul>' + Object.keys(o.metrics).map(function (m) { return '<li><span>' + A.esc(m) + '</span><b>' + A.esc(o.metrics[m]) + '</b></li>'; }).join('') + '</ul>';
    }
    q('[data-k="body-reset"]').addEventListener('click', function (e) {
      picked = null; if (body3d) body3d.reset(); e.currentTarget.hidden = true;
      A.ORGAN_ORDER.forEach(function (x) { organBtns[x].setAttribute('aria-pressed', 'false'); });
      q('[data-k="organ-detail"]').innerHTML = '<p class="dim">Select an organ on the body or in the list to see its readings.</p>';
    });
    var labels = {}; A.ORGAN_ORDER.forEach(function (k) { labels[k] = A.ORGANS[k].label.split(' ')[0]; });
    A.load3d('body').then(function (m) {
      if (stopped) return;
      body3d = m.createBody(q('[data-k="body"]'), { labels: labels, onSelect: pick });
      paintBody();
    }).catch(function (e) {
      console.warn('3D body unavailable:', e.message);
      q('[data-k="body"]').innerHTML = '<p class="empty">3D view is not available on this device. Use the list to see each organ.</p>';
    });
    function paintBody() {
      if (!body3d || !organs) return;
      body3d.setOrgans(organs);
      var hr = latest.heart_rate, rr = latest.respiration_rate;
      body3d.setRates({ hr: hr && hr.value, resp: rr && rr.value });
    }

    /* ---------- live refresh ---------- */
    function renderBanner(status) {
      var slot = q('[data-slot="banner"]'), reds = openAlerts.filter(function (a) { return a.level === 'red'; });
      var name = member ? member.name.split(' ')[0] : 'Crew member';
      var html;
      if (status === 'red') {
        html = '<div class="banner st-red" role="alert"><span class="b-ico">' + A.ST_ICON.red + '</span><div><div class="b-tag">Critical · contact mission support</div>' +
          '<h3>' + A.esc(reds[0] ? reds[0].message : 'Critical alert') + (reds.length > 1 ? ' <span class="dim">(+' + (reds.length - 1) + ' more)</span>' : '') + '</h3>' +
          '<p>' + A.esc(reds[0] ? reds[0].recommendation : '') + (isSurgeon ? ' Recommended: call ' + A.esc(name) + ' on the voice loop now and stand up the medical team.' : ' Stop critical tasks and call the flight surgeon now.') + '</p></div>' +
          (isSurgeon ? '<span class="b-act">' + A.badge('red', reds.length + ' critical') + '</span>' : '<button class="btn btn-danger" data-contact type="button">' + A.ICONS.headset + 'Contact mission support</button>') + '</div>';
      } else if (status === 'yellow') {
        html = '<div class="banner st-yellow"><span class="b-ico">' + A.ST_ICON.yellow + '</span><div><div class="b-tag">Caution</div><h3>' + openAlerts.length + ' item' + (openAlerts.length === 1 ? '' : 's') + ' need attention</h3><p>' + A.esc(openAlerts[0] ? openAlerts[0].recommendation : 'Re-check after resting.') + '</p></div></div>';
      } else {
        html = '<div class="banner st-green"><span class="b-ico">' + A.ST_ICON.green + '</span><div><div class="b-tag">Nominal</div><h3>All systems nominal</h3><p>' + (isSurgeon ? 'No open alerts for ' + A.esc(name) + '.' : 'No open alerts. Remember today\'s check-in and exercise session.') + '</p></div></div>';
      }
      if (slot.dataset.sig !== html) { slot.dataset.sig = html; slot.innerHTML = html; }
      var cb = slot.querySelector('[data-contact]');
      if (cb && !cb._b) { cb._b = 1; cb.addEventListener('click', function () { A.toast('Mission support can see this alert now', 'red', 'Your flight surgeon sees it on the Support Console. Use the voice loop to talk to them.'); }); }
    }

    var ACK = 'astra_red_seen';
    function redPopup(al) {
      if (isSurgeon || popup) return;
      var seen; try { seen = JSON.parse(sessionStorage.getItem(ACK)) || []; } catch (e) { seen = []; }
      if (seen.indexOf(al.id) >= 0) return;
      A.alarm.set(true);
      popup = A.modal(A.badge('red') + '<h2>' + A.esc(al.message) + '</h2><p>A critical rule fired for you just now.</p>' +
        '<div class="label" style="margin-top:16px">What to do</div><ol><li>' + A.esc(al.recommendation) + '</li><li>Stop any critical task (EVA, docking, piloting).</li><li>Contact mission support on the voice loop.</li></ol>' +
        '<div class="modal-actions"><button class="btn btn-danger btn-lg" data-close autofocus>I understand</button></div>',
        { red: true, onClose: function () { seen.push(al.id); try { sessionStorage.setItem(ACK, JSON.stringify(seen)); } catch (e) { /* ignore */ } popup = null; } });
    }

    function renderTiles() {
      var base = (member && member.baselines) || {};
      TILES.forEach(function (t) {
        var n = q('[data-t="' + t[0] + '"]'), r = latest[t[0]], lv = A.levelOf(r);
        if (t[0] === 'systolic_bp') lv = AstraRules.worst([lv, A.levelOf(latest.diastolic_bp)]);
        A.setStatus(n, lv);
        var out = n.querySelector('.tile-value b');
        if (t[0] === 'systolic_bp') out.textContent = A.fmtVal(r) + '/' + A.fmtVal(latest.diastolic_bp);
        else A.countTo(out, r && r.value !== null ? r.value : null, t[3]);
        n.querySelector('.st-word').textContent = r ? A.statusLabel(lv) : 'no data';
        n.querySelector('.tile-base').textContent = t[4] && base[t[4]] ? 'baseline ' + base[t[4]] + (t[0] === 'systolic_bp' && base.diastolic_bp ? '/' + base.diastolic_bp : '') : '';
        var buf = buffers[t[0]] = buffers[t[0]] || [];
        if (r && typeof r.value === 'number' && buf._ts !== r.timestamp) { buf.push(r.value); buf._ts = r.timestamp; if (buf.length > 40) buf.shift(); }
        AstraChart.sparkline(n.querySelector('canvas'), buf, lv === 'green' ? C.cyan : C[lv]);
      });
    }

    function refresh() {
      if (stopped) return Promise.resolve();
      return Promise.all([Api.getCrewMember(aid), Api.getLatest(aid), Api.getAlerts({ astronaut: aid, resolved: false, limit: 50 }), Api.getCabin()]).then(function (res) {
        if (stopped) return;
        member = res[0]; latest = A.byMetric(res[1].readings); openAlerts = res[2].alerts;
        var cab = A.byMetric(res[3].readings);
        q('[data-k="avatar"]').textContent = A.initials(member.name);
        A.setStatus(q('[data-k="avatar"]'), member.status);
        q('[data-k="name"]').textContent = member.name;
        q('[data-k="role"]').textContent = member.role + ' · ' + member.mission + ' · mission day ' + A.missionDay();
        q('[data-k="status"]').innerHTML = A.badge(member.status);
        q('[data-k="updated"]').textContent = member.last_reading_at ? 'updated ' + A.fmtTime(member.last_reading_at, true) + ' EAT' : '';
        if (isSurgeon) q('[data-k="hist-link"]').href = 'history.html?astronaut=' + aid;
        renderBanner(member.status);
        renderTiles();
        organs = A.organsFrom(latest, openAlerts);
        A.ORGAN_ORDER.forEach(function (k) {
          var o = organs[k], b = organBtns[k];
          A.setStatus(b, o.status); b.querySelector('.o-note').textContent = o.note; b.querySelector('.o-badge').innerHTML = A.badge(o.status);
        });
        renderOrganDetail(); paintBody();
        q('[data-k="alert-count"]').textContent = openAlerts.length ? openAlerts.length + ' open' : '';
        var feed = q('[data-k="alerts"]');
        var html = openAlerts.length ? openAlerts.slice(0, 25).map(function (al) { return A.alertItem(al, { showName: false, actions: isSurgeon ? actionButtons(al) : '' }); }).join('')
          : '<li class="empty">' + A.ST_ICON.green + (isSurgeon ? 'No open alerts.' : 'No open alerts. Keep to today\'s plan.') + '</li>';
        if (feed.dataset.sig !== JSON.stringify(openAlerts.map(function (a) { return [a.id, a.acknowledged]; }))) {
          feed.dataset.sig = JSON.stringify(openAlerts.map(function (a) { return [a.id, a.acknowledged]; }));
          feed.innerHTML = html;
        }
        var rd = latest.radiation_dose, rc = cab.cabin_radiation;
        A.countTo(q('[data-k="rad-today"]'), rd ? rd.value : null, 2);
        A.countTo(q('[data-k="rad-cabin"]'), rc ? rc.value : null, 2);
        var total = (rd ? rd.value : 0.5) * A.missionDay(), pct = total / 600 * 100;
        q('[data-k="rad-total"]').textContent = total.toFixed(1);
        q('[data-k="rad-pct"]').textContent = pct.toFixed(1) + '% of career limit';
        var meter = q('[data-k="rad-meter"]'); meter.style.width = Math.min(100, pct) + '%'; meter.className = pct > 80 ? 'bad' : pct > 50 ? 'warn' : '';
        var red = openAlerts.filter(function (a) { return a.level === 'red'; })[0];
        if (red) redPopup(red);
        if (!isSurgeon) A.alarm.set(member.status === 'red', { sound: true });
        if (opts.onUpdate) opts.onUpdate(member);
      });
    }

    /* ---------- charts + check-in + PVT (slower refresh) ---------- */
    var hoursFmt = function (t) { return A.fmtTime(new Date(t).toISOString()); };
    var dayFmt = function (t) { return new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: A.TZ }); };
    var tipFmt = function (t) { return A.fmtDateTime(new Date(t).toISOString()) + ' EAT'; };
    var pts = function (h) { return h.readings.map(function (r) { return { t: Date.parse(r.timestamp), v: r.value }; }); };
    function loadCharts() {
      if (stopped) return;
      Api.getHistory(aid, 'heart_rate', 24, 300).then(function (h) {
        var base = member && member.baselines ? member.baselines.heart_rate : null;
        var th = [{ v: 110, color: C.red, label: 'critical > 110' }, { v: 100, color: C.yellow, label: 'caution > 100' }];
        if (base) th.push({ v: base, color: C.cyan, label: 'baseline ' + base });
        AstraChart.line(q('[data-c="hr"]'), pts(h), { color: C.blue, thresholds: th, unit: 'bpm', xFormat: hoursFmt, tipFormat: tipFmt, pointColor: function (v) { return v > 110 ? C.red : v > 100 ? C.yellow : null; } });
        var vals = h.readings.map(function (r) { return r.value; });
        if (vals.length) q('[data-k="hr-sub"]').textContent = 'min ' + Math.round(Math.min.apply(null, vals)) + ' · max ' + Math.round(Math.max.apply(null, vals));
      }).catch(function () {});
      Api.getHistory(aid, 'spo2', 24, 300).then(function (h) {
        AstraChart.line(q('[data-c="spo2"]'), pts(h), { color: C.cyan, unit: '%', yMax: 100, thresholds: [{ v: 90, color: C.red, label: 'critical < 90' }, { v: 94, color: C.yellow, label: 'caution < 94' }], xFormat: hoursFmt, tipFormat: tipFmt, pointColor: function (v) { return v < 90 ? C.red : v < 94 ? C.yellow : null; } });
      }).catch(function () {});
      Api.getHistory(aid, 'sleep_total', 168).then(function (h) {
        AstraChart.line(q('[data-c="sleep"]'), pts(h), { bars: true, color: C.violet, yMin: 0, yMax: 9, decimals: 0, unit: 'h', xFormat: dayFmt, tipFormat: function (t) { return A.fmtDate(new Date(t).toISOString()); }, thresholds: [{ v: 5, color: C.yellow, label: '< 5 h' }], pointColor: function (v) { return v < 5 ? C.yellow : C.violet; } });
      }).catch(function () {});
      Api.getHistory(aid, 'pvt_reaction_time', 168).then(function (h) {
        AstraChart.line(q('[data-c="pvt"]'), pts(h), { color: C.orange, unit: 'ms', decimals: 0, thresholds: [{ v: 350, color: C.yellow, label: 'slow > 350' }], xFormat: dayFmt, tipFormat: tipFmt });
      }).catch(function () {});
      Api.getCheckins({ astronaut: aid, limit: 1 }).then(function (res) {
        var c = res.checkins[0], box = q('[data-k="checkin"]');
        if (!c) { box.innerHTML = '<p class="empty">No check-in yet.</p>'; return; }
        var found = AstraRules.checkCheckin(c, member ? member.baselines : null), lv = AstraRules.worst(found.map(function (f) { return f.level; }));
        q('[data-k="ci-when"]').innerHTML = A.badge(lv) + ' <span style="margin-left:6px">' + A.fmtDateTime(c.created_at) + ' EAT · ' + A.ago(c.created_at) + '</span>';
        var cell = function (label, v, unit, l) { return '<div class="st-' + (l || 'green') + '"><small>' + label + '</small><b>' + v + '</b>' + (unit ? ' <span class="dim" style="font-size:11px">' + unit + '</span>' : '') + '</div>'; };
        box.innerHTML = '<div class="checkin-card">' +
          cell('Heart rate', c.heart_rate, 'bpm') + cell('Blood pressure', c.systolic_bp + '/' + c.diastolic_bp, 'mmHg') + cell('Temperature', Number(c.temperature).toFixed(1), '°C') +
          cell('Sleep', Number(c.sleep_hours).toFixed(1), 'h') + cell('Exercise', c.exercise_minutes, 'min') + cell('Mood', c.mood + '/5') + cell('Stress', c.stress + '/5') + cell('Radiation', Number(c.radiation_msv).toFixed(2), 'mSv') + '</div>' +
          (c.symptoms ? '<div class="note"><b style="color:var(--text)">Symptoms / notes:</b> ' + A.esc(c.symptoms) + '</div>' : '') +
          (found.length ? '<ul class="feed" style="margin-top:10px;max-height:none">' + found.map(function (f) { return '<li class="feed-item st-' + f.level + '"><span class="fi-ico">' + A.ST_ICON[f.level] + '</span><div><div class="fi-title">' + A.esc(f.message) + '</div><div class="fi-meta">' + A.esc(f.recommendation) + '</div></div><span></span></li>'; }).join('') + '</ul>' : '');
      }).catch(function () {});
      Api.getPvt({ astronaut: aid, limit: 6 }).then(function (res) {
        var rows = res.results.map(function (p) {
          var lv = p.lapses >= 6 ? 'red' : p.lapses >= 3 || p.mean_rt_ms > 350 ? 'yellow' : 'green';
          return '<tr><td>' + A.fmtDateTime(p.created_at) + '</td><td class="num">' + p.mean_rt_ms + ' ms</td><td class="num">' + (p.fastest_ms || '—') + '</td><td class="num">' + p.lapses + '</td><td class="num">' + p.false_starts + '</td><td>' + A.badge(lv, lv === 'green' ? 'Alert' : lv === 'yellow' ? 'Fatigued' : 'Severe') + '</td></tr>';
        }).join('');
        q('[data-k="pvt-table"]').innerHTML = '<thead><tr><th>When (EAT)</th><th>Mean</th><th>Fastest</th><th>Lapses</th><th>False starts</th><th>Result</th></tr></thead><tbody>' + (rows || '<tr><td colspan="6" class="dim">No PVT runs yet.</td></tr>') + '</tbody>';
      }).catch(function () {});
    }

    function seedBuffers() {
      return Promise.all(TILES.map(function (t) {
        return Api.getHistory(aid, t[0], 6, 30).then(function (h) {
          var b = buffers[t[0]] = h.readings.map(function (r) { return r.value; }).filter(function (x) { return typeof x === 'number'; });
          b._ts = h.readings.length ? h.readings[h.readings.length - 1].timestamp : null;
        }).catch(function () {});
      }));
    }

    seedBuffers().then(refresh).then(function () { loadCharts(); A.reveal(root); A.setConn(true); }, function (e) { A.reveal(root); throw e; });
    timers.push(setTimeout(function () { timers.push(A.poll(refresh)); }, Api.POLL_MS));
    timers.push(setInterval(loadCharts, 30000));
    var onResize = function () { clearTimeout(onResize._t); onResize._t = setTimeout(loadCharts, 250); };
    window.addEventListener('resize', onResize);

    return {
      refresh: refresh,
      destroy: function () {
        stopped = true;
        timers.forEach(function (t) { clearInterval(t); clearTimeout(t); });
        window.removeEventListener('resize', onResize);
        if (body3d && body3d.dispose) body3d.dispose();
        root.innerHTML = '';
      }
    };
  }

  global.AstraHealthView = { mount: mount, actionButtons: actionButtons, bindAlertActions: bindAlertActions };
})(window);
