/* Psychomotor Vigilance Task - working reaction-time test. */
(function () {
  'use strict';
  var A = Astra, C = A.COLORS, R = AstraRules;
  var session = A.requireLogin(['astronaut']);
  if (!session) return;
  A.init('pvt');
  var aid = session.astronaut_id;
  document.getElementById('resTitle').insertAdjacentHTML('afterbegin', A.ICONS.zap);
  document.getElementById('histTitle').insertAdjacentHTML('afterbegin', A.ICONS.chart);

  var LAPSE_MS = 500, MIN_RT = 100, TIMEOUT_MS = 3000, MIN_WAIT = 2000, MAX_WAIT = 10000;
  var stage = document.getElementById('stage'), msg = document.getElementById('stageMsg');
  var st = { phase: 'idle', trials: 10, rts: [], falseStarts: 0, timer: null, raf: null, shownAt: 0 };

  function progress() {
    var html = '';
    for (var i = 0; i < st.trials; i++) {
      var cls = i < st.rts.length ? (st.rts[i] > LAPSE_MS ? 'lapse' : 'done') : '';
      html += '<i class="' + cls + '"></i>';
    }
    document.getElementById('progress').innerHTML = html;
  }

  function setStage(html, cls) { stage.className = 'pvt-stage' + (cls ? ' ' + cls : ''); stage.innerHTML = html; }

  function waitPhase() {
    st.phase = 'wait';
    setStage('<div><div class="pvt-wait"></div><div class="muted" style="margin-top:22px;font-size:14px">Trial ' + (st.rts.length + 1) + ' of ' + st.trials + ' · wait for it…</div></div>');
    var delay = MIN_WAIT + Math.random() * (MAX_WAIT - MIN_WAIT);
    st.timer = setTimeout(showStimulus, delay);
  }

  function showStimulus() {
    st.phase = 'go';
    setStage('<div class="pvt-target" id="target">0</div>');
    st.shownAt = performance.now();
    var t = document.getElementById('target');
    var loop = function () {
      if (st.phase !== 'go') return;
      var el = Math.round(performance.now() - st.shownAt);
      t.textContent = el;
      if (el >= TIMEOUT_MS) { record(TIMEOUT_MS); return; }
      st.raf = requestAnimationFrame(loop);
    };
    st.raf = requestAnimationFrame(loop);
  }

  function record(rt) {
    cancelAnimationFrame(st.raf);
    st.rts.push(rt);
    progress();
    var lapse = rt > LAPSE_MS;
    setStage('<div class="msg"><b style="font-family:var(--mono);font-size:54px;color:' + (lapse ? C.yellow : C.cyan) + '">' + rt + ' ms</b>' + (lapse ? 'Lapse (slower than 500 ms)' : 'Nice!') + '</div>');
    st.phase = 'feedback';
    st.timer = setTimeout(function () { if (st.rts.length >= st.trials) finish(); else waitPhase(); }, 900);
  }

  function falseStart() {
    clearTimeout(st.timer);
    st.falseStarts++;
    st.phase = 'feedback';
    setStage('<div class="msg"><b style="color:' + C.red + '">Too early!</b>False start · wait for the yellow circle.</div>', 'false');
    st.timer = setTimeout(waitPhase, 1100);
  }

  function respond() {
    if (st.phase === 'idle' || st.phase === 'done') { start(); return; }
    if (st.phase === 'wait') { falseStart(); return; }
    if (st.phase === 'go') {
      var rt = Math.round(performance.now() - st.shownAt);
      if (rt < MIN_RT) { st.phase = 'wait'; falseStart(); return; }   // anticipation
      st.phase = 'feedback';
      record(rt);
    }
  }

  function start() {
    st.trials = Number(document.getElementById('trials').value) || 10;
    st.rts = []; st.falseStarts = 0;
    progress();
    document.getElementById('startBtn').classList.add('hidden');
    document.getElementById('abortBtn').classList.remove('hidden');
    document.getElementById('trials').disabled = true;
    stage.focus();
    st.phase = 'feedback';
    setStage('<div class="msg"><b>Get ready</b>Starting…</div>');
    st.timer = setTimeout(waitPhase, 800);
  }

  function stop(message) {
    clearTimeout(st.timer); cancelAnimationFrame(st.raf);
    st.phase = 'idle';
    document.getElementById('startBtn').classList.remove('hidden');
    document.getElementById('abortBtn').classList.add('hidden');
    document.getElementById('trials').disabled = false;
    if (message) setStage('<div class="msg">' + message + '</div>');
  }

  function finish() {
    stop();
    st.phase = 'done';
    var rts = st.rts.slice(), n = rts.length;
    var mean = Math.round(rts.reduce(function (s, v) { return s + v; }, 0) / n);
    var lapses = rts.filter(function (v) { return v > LAPSE_MS; }).length;
    var fastest = Math.min.apply(null, rts);
    var lv = A.levelOf({ metric: 'pvt_lapses', value: lapses, text_value: '' });
    if (lv === 'green' && mean > 350) lv = 'yellow';
    var col = C[lv];
    document.getElementById('rMean').innerHTML = mean + '<small style="font-size:14px;color:var(--muted)"> ms</small>';
    document.getElementById('rLapses').textContent = lapses;
    document.getElementById('rFalse').textContent = st.falseStarts;
    document.getElementById('rFast').innerHTML = fastest + '<small style="font-size:14px;color:var(--muted)"> ms</small>';
    document.getElementById('rMean').style.color = col; document.getElementById('rLapses').style.color = lapses >= 3 ? col : '';
    document.getElementById('resPill').innerHTML = A.pill(lv, lv === 'green' ? 'Alert' : lv === 'yellow' ? 'Fatigued' : 'Severe fatigue');
    var mx = Math.max(LAPSE_MS * 1.2, Math.max.apply(null, rts));
    document.getElementById('rtBars').innerHTML = rts.map(function (v) {
      return '<div style="height:' + (v / mx * 100).toFixed(0) + '%;--c:' + (v > LAPSE_MS ? C.yellow : C.cyan) + '"><span>' + v + '</span></div>';
    }).join('');
    var advice = lv === 'red' ? 'Avoid critical tasks (EVA, docking) and rest. Mission support will be notified.' : lv === 'yellow' ? 'Signs of fatigue. Rest before critical tasks.' : 'Alertness looks good for critical tasks.';
    setStage('<div class="msg"><b style="color:' + col + '">' + mean + ' ms mean · ' + lapses + ' lapse' + (lapses === 1 ? '' : 's') + '</b>' + advice + '<br><span class="dim" style="font-size:13px">Press Start to try again.</span></div>');
    Api.submitPvt(aid, { mean_rt_ms: mean, mean_rt: mean, fastest_ms: fastest, lapses: lapses, false_starts: st.falseStarts, trials: n }).then(function (res) {
      var fired = (res && res.alerts) || [];
      A.toast('PVT result saved' + (fired.length ? ' · ' + fired[0].message : ''), fired.length ? R.worst(fired.map(function (a) { return a.level; })) : 'green');
      loadHistory();
    }).catch(function (e) { A.toast('Could not save result: ' + e.message, 'red'); });
  }

  stage.addEventListener('mousedown', function (e) { e.preventDefault(); respond(); });
  stage.addEventListener('touchstart', function (e) { e.preventDefault(); respond(); }, { passive: false });
  document.addEventListener('keydown', function (e) {
    if (e.code === 'Space' || e.key === ' ') {
      if (document.activeElement && /INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)) return;
      e.preventDefault(); if (!e.repeat) respond();
    }
  });
  document.getElementById('startBtn').addEventListener('click', start);
  document.getElementById('abortBtn').addEventListener('click', function () { stop('<b>Stopped</b>Press Start to run the test again.'); });

  function loadHistory() {
    Api.getHistory(aid, 'pvt_reaction_time', 168).then(function (h) {
      var pts = h.readings.map(function (r) { return { t: Date.parse(r.timestamp), v: r.value }; });
      AstraChart.line(document.getElementById('pvtChart'), pts, {
        color: C.violet, unit: 'ms', decimals: 0, thresholds: [{ v: 350, color: C.yellow, label: 'slow > 350 ms' }],
        xFormat: function (t) { return new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: A.TZ }); },
        tipFormat: function (t) { return A.fmtDateTime(new Date(t).toISOString()) + ' EAT'; }
      });
    }).catch(function (e) { console.warn('PVT history', e); });
  }
  st.trials = 10; progress(); loadHistory();
  document.getElementById('trials').addEventListener('change', function () { st.trials = Number(this.value); progress(); });
})();
