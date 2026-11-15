/* Psychomotor Vigilance Task: working reaction-time test; the result is saved with POST /api/pvt/. */
(function () {
  'use strict';
  var A = Astra, C = A.COLORS, R = AstraRules;
  var session = A.requireLogin(['astronaut']);
  if (!session) return;
  A.init('pvt');
  var $ = function (id) { return document.getElementById(id); };
  var aid = session.astronaut_id;

  var LAPSE_MS = 500, MIN_RT = 100, TIMEOUT_MS = 3000, MIN_WAIT = 2000, MAX_WAIT = 8000;
  var stage = $('stage'), body = $('stage-body');
  var st = { phase: 'idle', trials: 10, rts: [], falseStarts: 0, timer: null, raf: null, shownAt: 0 };

  function dots() {
    var html = '';
    for (var i = 0; i < st.trials; i++) {
      var v = st.rts[i];
      html += '<i class="' + (v === undefined ? '' : v > LAPSE_MS ? 'lapse' : v > 350 ? 'slow' : 'ok') + '"></i>';
    }
    $('pvt-dots').innerHTML = html;
    $('pvt-progress').textContent = st.phase === 'idle' || st.phase === 'done' ? st.trials + ' trials' : 'trial ' + Math.min(st.rts.length + 1, st.trials) + ' of ' + st.trials;
  }
  function setStage(cls, count, msg) {
    stage.className = 'pvt-stage ' + cls;
    body.innerHTML = '<div class="pvt-count">' + count + '</div><div class="pvt-msg">' + msg + '</div>';
  }

  function waitPhase() {
    st.phase = 'wait'; dots();
    setStage('wait', '<span class="dim">···</span>', 'Wait for the yellow light…');
    st.timer = setTimeout(showStimulus, MIN_WAIT + Math.random() * (MAX_WAIT - MIN_WAIT));
  }
  function showStimulus() {
    st.phase = 'go';
    stage.className = 'pvt-stage go';
    body.innerHTML = '<div class="pvt-target" id="target">0</div>';
    st.shownAt = performance.now();
    var t = $('target');
    (function loop() {
      if (st.phase !== 'go') return;
      var ms = Math.round(performance.now() - st.shownAt);
      t.textContent = ms;
      if (ms >= TIMEOUT_MS) { record(TIMEOUT_MS); return; }
      st.raf = requestAnimationFrame(loop);
    })();
  }
  function record(rt) {
    cancelAnimationFrame(st.raf);
    st.rts.push(rt); st.phase = 'feedback'; dots();
    var lapse = rt > LAPSE_MS;
    setStage('wait', '<span style="color:' + (lapse ? C.yellow : C.cyan) + '">' + rt + '</span><small style="font-size:.3em;color:var(--text-3)"> ms</small>', lapse ? 'Lapse: slower than 500 ms' : rt > 350 ? 'A little slow' : 'Nice!');
    st.timer = setTimeout(function () { if (st.rts.length >= st.trials) finish(); else waitPhase(); }, 900);
  }
  function falseStart() {
    clearTimeout(st.timer); st.falseStarts++; st.phase = 'feedback';
    setStage('early', '<span style="color:' + C.yellow + '">Too early</span>', 'False start. Wait for the yellow light.');
    st.timer = setTimeout(waitPhase, 1100);
  }
  function respond() {
    if (st.phase === 'idle' || st.phase === 'done') { start(); return; }
    if (st.phase === 'wait') { falseStart(); return; }
    if (st.phase === 'go') {
      var rt = Math.round(performance.now() - st.shownAt);
      if (rt < MIN_RT) { st.phase = 'wait'; falseStart(); return; }
      record(rt);
    }
  }
  function start() {
    st.rts = []; st.falseStarts = 0; st.phase = 'feedback';
    $('abortBtn').hidden = false; $('result').hidden = true;
    document.querySelectorAll('#trials button').forEach(function (b) { b.disabled = true; });
    stage.focus(); dots();
    setStage('wait', '3', 'Get ready…');
    var n = 3;
    var tick = function () { n--; if (n > 0) { setStage('wait', String(n), 'Get ready…'); st.timer = setTimeout(tick, 600); } else waitPhase(); };
    st.timer = setTimeout(tick, 600);
  }
  function stop(msg) {
    clearTimeout(st.timer); cancelAnimationFrame(st.raf);
    st.phase = 'idle'; $('abortBtn').hidden = true;
    document.querySelectorAll('#trials button').forEach(function (b) { b.disabled = false; });
    if (msg) setStage('wait', 'PVT', msg);
    dots();
  }
  function finish() {
    stop(); st.phase = 'done';
    var rts = st.rts.slice(), n = rts.length;
    var mean = Math.round(rts.reduce(function (s, v) { return s + v; }, 0) / n), fastest = Math.min.apply(null, rts);
    var lapses = rts.filter(function (v) { return v > LAPSE_MS; }).length;
    var lv = A.levelOf({ metric: 'pvt_lapses', value: lapses, text_value: '' });
    if (lv === 'green' && mean > 350) lv = 'yellow';
    $('result').hidden = false; A.reveal($('result').parentNode);
    A.countTo($('rMean'), mean); A.countTo($('rFast'), fastest); A.countTo($('rLapses'), lapses); A.countTo($('rFalse'), st.falseStarts);
    $('resBadge').innerHTML = A.badge(lv, lv === 'green' ? 'Alert' : lv === 'yellow' ? 'Fatigued' : 'Severe fatigue');
    var mx = Math.max(LAPSE_MS * 1.2, Math.max.apply(null, rts));
    $('rtBars').innerHTML = rts.map(function (v) { return '<div style="height:' + (v / mx * 100).toFixed(0) + '%;--c:' + (v > LAPSE_MS ? C.yellow : C.cyan) + '"><span>' + v + '</span></div>'; }).join('');
    $('rAdvice').innerHTML = '<b>What to do:</b> ' + (lv === 'red' ? 'Avoid critical tasks (EVA, docking) and rest. Your flight surgeon will see this result.' : lv === 'yellow' ? 'Signs of fatigue. Rest before critical tasks.' : 'Alertness looks good for critical tasks.');
    setStage('wait', '<span style="color:' + C[lv] + '">' + mean + '</span><small style="font-size:.3em;color:var(--text-3)"> ms</small>', lapses + ' lapse' + (lapses === 1 ? '' : 's') + ' · tap to run again');
    Api.submitPvt(aid, { mean_rt_ms: mean, fastest_ms: fastest, lapses: lapses, false_starts: st.falseStarts, trials: n }).then(function (res) {
      var fired = (res && res.alerts) || [];
      A.toast('Result saved', fired.length ? R.worst(fired.map(function (a) { return a.level; })) : 'green', fired.length ? fired[0].message : 'Sent to your flight surgeon.');
      loadHistory(); loadLeaderboard(true);
    }).catch(function (e) { A.toast('Could not save result', 'red', e.message); });
  }

  stage.addEventListener('pointerdown', function (e) { e.preventDefault(); respond(); });
  document.addEventListener('keydown', function (e) {
    if (e.code !== 'Space' && e.key !== ' ') return;
    if (document.activeElement && /INPUT|SELECT|TEXTAREA|BUTTON|A/.test(document.activeElement.tagName)) return;
    e.preventDefault(); if (!e.repeat) respond();
  });
  $('abortBtn').addEventListener('click', function () { stop('Stopped. Tap to run the test again.'); });
  $('trials').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b || st.phase !== 'idle' && st.phase !== 'done') return;
    st.trials = Number(b.dataset.n);
    this.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
    dots();
  });

  function loadHistory() {
    Api.getHistory(aid, 'pvt_reaction_time', 168).then(function (h) {
      var pts = h.readings.map(function (r) { return { t: Date.parse(r.timestamp), v: r.value }; });
      AstraChart.line($('pvtChart'), pts, {
        color: C.orange, unit: 'ms', decimals: 0, thresholds: [{ v: 350, color: C.yellow, label: 'slow > 350 ms' }],
        xFormat: function (t) { return new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: A.TZ }); },
        tipFormat: function (t) { return A.fmtDateTime(new Date(t).toISOString()) + ' EAT'; }
      });
    }).catch(function (e) { console.warn('PVT history', e.message); });
  }

  /* ---- Crew leaderboard (GET /api/leaderboard/) ---- */
  var TIER_C = { 'Ace': C.cyan, 'Sharp': C.green, 'Steady': C.yellow, 'Needs rest': C.red };
  var lastRank = null;
  function medal(r) { return r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : '#' + r; }
  function loadLeaderboard(afterRun) {
    Api.getLeaderboard().then(function (d) {
      var rows = d.leaderboard || [];
      $('lbMeta').textContent = rows.length + ' of 4 crew ranked';
      if (!rows.length) { $('lbPodium').innerHTML = ''; $('lbList').innerHTML = '<li class="dim">No runs yet. Be the first on the board!</li>'; return; }
      var podium = [rows[1], rows[0], rows[2]].filter(Boolean);
      $('lbPodium').innerHTML = podium.map(function (r) {
        return '<div class="lb-step lb-r' + r.rank + (r.astronaut_id === aid ? ' me' : '') + '">' +
          '<div class="lb-medal">' + medal(r.rank) + '</div><div class="lb-av">' + A.esc(A.initials(r.astronaut)) + '</div>' +
          '<b>' + A.esc(r.astronaut.split(' ')[0]) + '</b><span class="lb-score" data-v="' + r.score + '">0</span>' +
          '<div class="lb-block"><span>' + r.rank + '</span></div></div>';
      }).join('');
      $('lbPodium').querySelectorAll('.lb-score').forEach(function (el) { A.countTo(el, Number(el.dataset.v)); });
      $('lbList').innerHTML = rows.map(function (r) {
        var me = r.astronaut_id === aid, ch = r.change;
        var chg = ch === null || ch === undefined ? '<span class="dim">new</span>' : ch > 0 ? '<span class="up">▲ ' + ch + '</span>' : ch < 0 ? '<span class="down">▼ ' + (-ch) + '</span>' : '<span class="dim">=</span>';
        return '<li class="' + (me ? 'me' : '') + '" style="--d:' + (r.rank * 60) + 'ms">' +
          '<span class="lb-rank">' + medal(r.rank) + '</span>' +
          '<span class="lb-name"><b>' + A.esc(r.astronaut) + (me ? ' <em>you</em>' : '') + '</b><small>' + A.esc(r.role || '') + ' · ' + r.mean_rt_ms + ' ms · ' + r.lapses + ' lapse' + (r.lapses === 1 ? '' : 's') + '</small></span>' +
          '<span class="lb-tier" style="--c:' + (TIER_C[r.tier] || C.cyan) + '">' + A.esc(r.tier) + '</span>' +
          '<span class="lb-bar"><i style="width:' + (r.score / 10) + '%;background:' + (TIER_C[r.tier] || C.cyan) + '"></i></span>' +
          '<span class="lb-pts"><b>' + r.score + '</b>' + chg + '</span>' +
          '<span class="lb-extra" title="Daily streak · best score · runs">' + (r.streak_days > 1 ? '🔥' + r.streak_days + ' · ' : '') + 'best ' + r.best_score + ' · ' + r.attempts + ' run' + (r.attempts === 1 ? '' : 's') + '</span></li>';
      }).join('');
      var mine = rows.filter(function (r) { return r.astronaut_id === aid; })[0];
      if (afterRun && mine) {
        var msg = 'You scored <b>' + mine.score + '</b> (' + A.esc(mine.tier) + ') and rank <b>' + medal(mine.rank) + '</b> of ' + rows.length + '.';
        if (mine.personal_best && mine.attempts > 1) msg = '🎉 New personal best! ' + msg;
        if (lastRank && mine.rank < lastRank) msg += ' You climbed ' + (lastRank - mine.rank) + ' place' + (lastRank - mine.rank === 1 ? '' : 's') + '!';
        var above = rows[mine.rank - 2];
        if (above) msg += ' ' + (above.score - mine.score + 1) + ' points to pass ' + A.esc(above.astronaut.split(' ')[0]) + '.';
        else msg += ' You lead the crew. Keep it up!';
        $('rRank').innerHTML = msg; $('rRank').hidden = false;
        $('rRank').classList.remove('pop'); void $('rRank').offsetWidth; $('rRank').classList.add('pop');
        if (mine.personal_best && mine.attempts > 1) A.toast('New personal best!', 'green', 'Score ' + mine.score + ' · rank ' + mine.rank);
      }
      if (mine) lastRank = mine.rank;
    }).catch(function (e) { $('lbList').innerHTML = '<li class="dim">Leaderboard unavailable (' + A.esc(e.message) + ')</li>'; });
  }

  dots(); loadHistory(); loadLeaderboard(false);
  setInterval(function () { if (st.phase === 'idle' || st.phase === 'done') loadLeaderboard(false); }, 20000);
})();
