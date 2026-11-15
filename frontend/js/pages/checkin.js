/* Daily check-in wizard: one question per step, vitals prefilled from devices, server rules on submit. */
(function () {
  'use strict';
  var A = Astra, R = AstraRules;
  var session = A.requireLogin(['astronaut']);
  if (!session) return;
  A.init('checkin');
  var $ = function (id) { return document.getElementById(id); };
  var aid = session.astronaut_id, member = null;

  var steps = Array.prototype.slice.call(document.querySelectorAll('.step')).filter(function (s) { return s.dataset.step !== 'done'; });
  var cur = 0;
  $('step-total').textContent = steps.length;
  var data = { mood: 4, stress: 2, symptoms: [] };

  /* mood */
  $('mood').addEventListener('click', function (e) {
    var b = e.target.closest('.face'); if (!b) return;
    data.mood = Number(b.dataset.v);
    this.querySelectorAll('.face').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
    setTimeout(function () { go(1); }, 260);
  });
  /* stress */
  var STRESS = ['Calm', 'Mild', 'Moderate', 'High', 'Severe'];
  function stressUpd() { data.stress = Number($('stress').value); $('stress-out').textContent = data.stress; $('stress-word').textContent = STRESS[data.stress - 1]; }
  $('stress').addEventListener('input', stressUpd); stressUpd();
  /* symptoms */
  var SYM = ['Headache', 'Congestion', 'Nausea', 'Back pain', 'Fatigue', 'Eye strain', 'Insomnia', 'Dizziness'];
  $('symptoms').innerHTML = SYM.map(function (s) { return '<button type="button" class="pick" aria-pressed="false" data-s="' + s + '">' + s + '</button>'; }).join('');
  $('symptoms').addEventListener('click', function (e) {
    var b = e.target.closest('.pick'); if (!b) return;
    var on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on);
    var s = b.dataset.s.toLowerCase();
    data.symptoms = data.symptoms.filter(function (x) { return x !== s; }); if (on) data.symptoms.push(s);
  });
  /* sleep + exercise */
  function routineUpd() {
    var sl = Number($('sleep_hours').value), ex = Number($('exercise_minutes').value);
    $('sleep-out').textContent = sl.toFixed(1); $('sleep-word').textContent = sl < 5 ? 'Short sleep' : sl < 7 ? 'A bit short' : 'Good';
    $('ex-out').textContent = ex; $('ex-word').textContent = ex < 60 ? 'Below 60 min target' : 'Target met';
  }
  $('sleep_hours').addEventListener('input', routineUpd); $('exercise_minutes').addEventListener('input', routineUpd); routineUpd();

  /* prefill from devices */
  Promise.all([Api.getCrewMember(aid), Api.getLatest(aid)]).then(function (res) {
    member = res[0];
    var m = A.byMetric(res[1].readings);
    var set = function (id, r, dec) { if (r && typeof r.value === 'number' && !$(id).value) $(id).value = dec ? r.value.toFixed(dec) : Math.round(r.value); };
    set('heart_rate', m.resting_heart_rate || m.heart_rate); set('temperature', m.body_temperature, 1);
    set('systolic_bp', m.systolic_bp); set('diastolic_bp', m.diastolic_bp); set('radiation_msv', m.radiation_dose, 2);
    if (m.sleep_total) { $('sleep_hours').value = Math.round(m.sleep_total.value * 2) / 2; routineUpd(); }
  }).catch(function (e) { A.toast('Could not load your device values', 'yellow', e.message); });

  /* validation */
  var LIMITS = {
    heart_rate: [30, 220, 'Heart rate must be 30–220 bpm.', true],
    temperature: [34, 43, 'Temperature must be 34–43 °C.'],
    systolic_bp: [70, 250, 'Systolic must be 70–250 mmHg.', true],
    diastolic_bp: [40, 150, 'Diastolic must be 40–150 mmHg.', true],
    radiation_msv: [0, 50, 'Radiation must be 0–50 mSv.'],
    urine_calcium: [0, 1000, 'Urine calcium must be 0–1000 mg/day.', true, true]
  };
  function validate(step) {
    var ok = true;
    Object.keys(LIMITS).forEach(function (k) {
      var el = $(k); if (!step.contains(el)) return;
      var L = LIMITS[k], raw = el.value.trim(), v = Number(raw), msg = '';
      if (raw === '' && L[4]) { delete data[k]; }
      else if (raw === '') msg = 'Required.';
      else if (isNaN(v) || v < L[0] || v > L[1]) msg = L[2];
      else if (L[3] && Math.round(v) !== v) msg = 'Whole numbers only.';
      else data[k] = v;
      el.classList.toggle('invalid', !!msg); step.querySelector('[data-err="' + k + '"]').textContent = msg;
      if (msg) ok = false;
    });
    if (ok && step.dataset.step === 'vitals' && data.diastolic_bp >= data.systolic_bp) {
      ok = false; $('diastolic_bp').classList.add('invalid'); step.querySelector('[data-err="diastolic_bp"]').textContent = 'Must be lower than systolic.';
    }
    if (!ok) { var f = step.querySelector('.invalid'); if (f) f.focus(); }
    return ok;
  }

  function collect() {
    var notes = $('notes').value.trim();
    var out = {
      astronaut_id: aid, mood: data.mood, stress: data.stress,
      heart_rate: data.heart_rate, systolic_bp: data.systolic_bp, diastolic_bp: data.diastolic_bp, temperature: data.temperature,
      sleep_hours: Number($('sleep_hours').value), exercise_minutes: Number($('exercise_minutes').value),
      radiation_msv: data.radiation_msv || 0,
      symptoms: data.symptoms.join(', ') + (notes ? (data.symptoms.length ? '; ' : '') + notes : '')
    };
    if (typeof data.urine_calcium === 'number') out.urine_calcium = data.urine_calcium;
    return out;
  }
  function summary() {
    var c = collect(), MO = ['Very low', 'Low', 'Okay', 'Good', 'Great'];
    var cell = function (k, v, u) { return '<div><small>' + k + '</small><b>' + A.esc(v) + '</b>' + (u ? '<i>' + u + '</i>' : '') + '</div>'; };
    $('summary').innerHTML = cell('Mood', c.mood + ' · ' + MO[c.mood - 1]) + cell('Stress', c.stress + ' · ' + STRESS[c.stress - 1]) +
      cell('Heart rate', c.heart_rate, 'bpm') + cell('Blood pressure', c.systolic_bp + '/' + c.diastolic_bp, 'mmHg') + cell('Temperature', Number(c.temperature).toFixed(1), '°C') +
      cell('Sleep', c.sleep_hours.toFixed(1), 'h') + cell('Exercise', c.exercise_minutes, 'min') + cell('Radiation', Number(c.radiation_msv).toFixed(2), 'mSv') +
      (c.urine_calcium !== undefined ? cell('Urine calcium', c.urine_calcium, 'mg/day') : '') +
      '<div style="grid-column:1/-1"><small>Symptoms / notes</small><span style="font-size:14px">' + A.esc(c.symptoms || 'None') + '</span></div>';
  }

  function show(i) {
    cur = i;
    steps.forEach(function (s, k) { s.classList.toggle('active', k === i); });
    $('done').classList.remove('active');
    $('step-n').textContent = i + 1;
    $('progress').firstElementChild.style.width = ((i + 1) / steps.length * 100) + '%';
    $('back').style.visibility = i ? 'visible' : 'hidden';
    $('next').textContent = steps[i].dataset.step === 'review' ? 'Submit check-in' : 'Continue';
    if (steps[i].dataset.step === 'review') summary();
    var f = steps[i].querySelector('input, button.face[aria-pressed="true"]'); if (f && i) f.focus({ preventScroll: true });
  }
  function go(d) {
    if (d > 0 && !validate(steps[cur])) return;
    if (d > 0 && steps[cur].dataset.step === 'review') { submit(); return; }
    show(Math.max(0, Math.min(steps.length - 1, cur + d)));
  }
  $('next').addEventListener('click', function () { go(1); });
  $('back').addEventListener('click', function () { go(-1); });
  $('wizard').addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); go(1); } });

  function submit() {
    var c = collect(), btn = $('next');
    btn.disabled = true; btn.textContent = 'Saving…'; $('ci-error').textContent = '';
    Api.submitCheckin(c).then(function (res) {
      var found = (res && res.alerts) || [], lv = R.worst(found.map(function (f) { return f.level; }));
      var title = lv === 'red' ? 'Saved · contact mission support' : lv === 'yellow' ? 'Saved · ' + found.length + ' item' + (found.length > 1 ? 's' : '') + ' to watch' : 'Saved · all nominal';
      var body = lv === 'red' ? 'A critical rule fired. Your flight surgeon sees it now on the Support Console.' : lv === 'yellow' ? 'Follow the recommendations below.' : 'No rules fired. Great job keeping your routine.';
      steps.forEach(function (s) { s.classList.remove('active'); });
      $('done').innerHTML = '<div class="st-' + lv + '" style="text-align:center"><div class="done-mark">' + A.ST_ICON[lv] + '</div><h2>' + A.esc(title) + '</h2><p>' + A.esc(body) + '</p></div>' +
        (found.length ? '<ul class="feed" style="max-height:none;margin-top:14px">' + found.map(function (al) { return A.alertItem(al, { showName: false }); }).join('') + '</ul>' : '') +
        '<div class="row" style="justify-content:center;margin-top:20px;flex-wrap:wrap"><a class="btn btn-primary" href="my-health.html">Open My Health</a><a class="btn" href="pvt.html">Take the reaction test</a></div>';
      $('done').classList.add('active');
      $('wizard-nav').hidden = true; $('progress').firstElementChild.style.width = '100%';
      A.toast('Check-in saved', lv === 'green' ? 'green' : lv);
      loadRecent();
    }).catch(function (err) {
      $('ci-error').textContent = 'Not saved: ' + err.message + '. Your answers are still here; try again.';
      A.toast('Could not save check-in', 'red', err.message);
    }).then(function () { btn.disabled = false; if (steps[cur].dataset.step === 'review') btn.textContent = 'Submit check-in'; });
  }

  function loadRecent() {
    Api.getCheckins({ astronaut: aid, limit: 7 }).then(function (res) {
      var rows = res.checkins.map(function (c) {
        var lv = R.worst(R.checkCheckin(c, member ? member.baselines : null).map(function (f) { return f.level; }));
        return '<tr><td>' + A.fmtDate(c.created_at) + '</td><td class="num">' + Number(c.sleep_hours).toFixed(1) + ' h</td><td class="num">' + c.mood + '/5</td><td class="num">' + c.stress + '/5</td><td class="num">' + c.exercise_minutes + ' min</td><td class="num">' + c.heart_rate + '</td><td>' + A.badge(lv) + '</td></tr>';
      }).join('');
      $('recentTable').innerHTML = '<thead><tr><th>Date</th><th>Sleep</th><th>Mood</th><th>Stress</th><th>Exercise</th><th>HR</th><th>Result</th></tr></thead><tbody>' + (rows || '<tr><td colspan="7" class="dim">No check-ins yet.</td></tr>') + '</tbody>';
      if (res.checkins[0]) {
        var today = A.fmtDate(res.checkins[0].created_at) === A.fmtDate(new Date().toISOString());
        $('lastCheckin').innerHTML = today ? A.badge('green', 'Done today') : A.badge('yellow', 'Due today');
      }
    }).catch(function (e) { console.warn('recent check-ins', e.message); });
  }

  show(0);
  loadRecent();
})();
