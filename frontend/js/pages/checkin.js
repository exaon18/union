/* Daily check-in form with client-side validation and instant rule feedback. */
(function () {
  'use strict';
  var A = Astra, R = AstraRules;
  var session = A.requireLogin(['astronaut']);
  if (!session) return;
  A.init('checkin');
  var aid = session.astronaut_id, member = null;
  document.getElementById('resultTitle').insertAdjacentHTML('afterbegin', A.ICONS.shield);
  document.getElementById('recentTitle').insertAdjacentHTML('afterbegin', A.ICONS.clipboard);

  var MOODS = ['😞', '🙁', '😐', '🙂', '😄'], MOOD_L = ['Very low', 'Low', 'Okay', 'Good', 'Great'];
  var STRESS = ['😌', '🙂', '😐', '😟', '😫'], STRESS_L = ['Calm', 'Mild', 'Moderate', 'High', 'Severe'];
  function scale(id, name, icons, labels, def) {
    document.getElementById(id).innerHTML = icons.map(function (ic, i) {
      var v = i + 1;
      return '<input type="radio" name="' + name + '" id="' + name + v + '" value="' + v + '"' + (v === def ? ' checked' : '') + '><label for="' + name + v + '">' + ic + '<small>' + v + ' · ' + labels[i] + '</small></label>';
    }).join('');
  }
  scale('moodScale', 'mood', MOODS, MOOD_L, 4);
  scale('stressScale', 'stress', STRESS, STRESS_L, 2);

  var CHIPS = ['Headache', 'Congestion', 'Nausea', 'Back pain', 'Fatigue', 'Eye strain', 'Insomnia'];
  document.getElementById('symptomChips').innerHTML = CHIPS.map(function (c) { return '<button type="button" data-chip="' + c + '">+ ' + c + '</button>'; }).join('');
  document.getElementById('symptomChips').addEventListener('click', function (e) {
    var c = e.target.getAttribute('data-chip'); if (!c) return;
    var t = document.getElementById('symptoms');
    if (t.value.toLowerCase().indexOf(c.toLowerCase()) < 0) t.value = (t.value ? t.value.replace(/[,\s]+$/, '') + ', ' : '') + c.toLowerCase();
  });

  function link(rangeId, inputId, outId, fmt) {
    var r = document.getElementById(rangeId), i = document.getElementById(inputId), o = document.getElementById(outId);
    r.addEventListener('input', function () { i.value = fmt === 'h' ? Number(r.value).toFixed(1) : r.value; o.textContent = i.value + (fmt === 'h' ? ' h' : ' min'); });
    i.addEventListener('input', function () { if (i.value !== '') { r.value = i.value; o.textContent = i.value + (fmt === 'h' ? ' h' : ' min'); } });
  }
  link('sleepRange', 'sleep_hours', 'sleepOut', 'h');
  link('exRange', 'exercise_minutes', 'exOut', 'm');

  // Prefill device values from the latest readings
  function prefill() {
    return Promise.all([Api.getCrewMember(aid), Api.getLatest(aid)]).then(function (res) {
      member = res[0];
      var m = A.byMetric(res[1].readings);
      var set = function (id, r, dec) { if (r && typeof r.value === 'number') document.getElementById(id).value = dec ? r.value.toFixed(dec) : Math.round(r.value); };
      set('heart_rate', m.resting_heart_rate || m.heart_rate);
      set('temperature', m.body_temperature, 1);
      set('systolic_bp', m.systolic_bp); set('diastolic_bp', m.diastolic_bp);
      set('radiation_msv', m.radiation_dose, 2);
      if (m.sleep_total) { document.getElementById('sleep_hours').value = m.sleep_total.value.toFixed(1); document.getElementById('sleep_hours').dispatchEvent(new Event('input')); }
    });
  }

  var LIMITS = {
    sleep_hours: [0, 16, 'Sleep must be between 0 and 16 hours.'],
    exercise_minutes: [0, 300, 'Exercise must be between 0 and 300 minutes.', true],
    heart_rate: [30, 220, 'Heart rate must be between 30 and 220 bpm.', true],
    temperature: [34, 43, 'Temperature must be between 34 and 43 °C.'],
    systolic_bp: [70, 250, 'Systolic must be 70–250 and diastolic 40–150 mmHg.', true],
    diastolic_bp: [40, 150, 'Systolic must be 70–250 and diastolic 40–150 mmHg.', true],
    radiation_msv: [0, 50, 'Radiation must be between 0 and 50 mSv.'],
    urine_calcium: [0, 1000, 'Urine calcium must be between 0 and 1000 mg/day.', true]
  };

  function validate() {
    var data = { astronaut_id: aid }, ok = true;
    document.querySelectorAll('[data-err]').forEach(function (e) { e.textContent = ''; });
    document.querySelectorAll('.input').forEach(function (e) { e.classList.remove('invalid'); });
    Object.keys(LIMITS).forEach(function (k) {
      var el = document.getElementById(k), L = LIMITS[k], raw = el.value.trim();
      if (k === 'urine_calcium' && raw === '') return;           // optional
      var v = Number(raw);
      var bad = raw === '' || isNaN(v) || v < L[0] || v > L[1] || (L[3] && Math.round(v) !== v);
      if (bad) {
        ok = false; el.classList.add('invalid');
        var errEl = document.querySelector('[data-err="' + (k === 'diastolic_bp' ? 'systolic_bp' : k) + '"]');
        errEl.textContent = raw === '' ? 'Required.' : L[2] + (L[3] && Math.round(v) !== v ? ' Whole numbers only.' : '');
      } else data[k] = v;
    });
    if (ok && data.diastolic_bp >= data.systolic_bp) {
      ok = false; document.getElementById('diastolic_bp').classList.add('invalid');
      document.querySelector('[data-err="systolic_bp"]').textContent = 'Diastolic must be lower than systolic.';
    }
    ['mood', 'stress'].forEach(function (k) {
      var c = document.querySelector('input[name="' + k + '"]:checked');
      if (!c) { ok = false; document.querySelector('[data-err="' + k + '"]').textContent = 'Pick a value.'; } else data[k] = Number(c.value);
    });
    var sym = document.getElementById('symptoms').value.trim();
    if (sym.length > 500) { ok = false; document.querySelector('[data-err="symptoms"]').textContent = 'Max 500 characters.'; }
    data.symptoms = sym;
    if (!ok) { var first = document.querySelector('.invalid'); if (first) first.focus(); }
    return ok ? data : null;
  }

  function showResult(found, opts) {
    opts = opts || {};
    var lv = R.worst(found.map(function (f) { return f.level; }));
    document.getElementById('resultPill').innerHTML = opts.pending ? A.pill('yellow', 'Saving…') : A.pill(lv);
    var saved = opts.pending ? 'Preview' : 'Check-in saved';
    var head = opts.error
      ? '<div class="callout red" style="margin-bottom:14px">' + A.ICONS.alert + '<div><h3>Not saved</h3><p>' + A.esc(opts.error) + ' Your answers are still in the form. Try again.</p></div></div>'
      : lv === 'red'
      ? '<div class="callout red" style="margin-bottom:14px">' + A.ICONS.alert + '<div><h3>' + (opts.pending ? '' : 'Check-in saved · ') + 'Contact mission support</h3><p>A critical rule fired.' + (opts.pending ? '' : ' The flight surgeon has been notified.') + '</p></div></div>'
      : lv === 'yellow' ? '<div class="callout yellow" style="margin-bottom:14px">' + A.ICONS.alert + '<div><h3>' + saved + ' · ' + found.length + ' item' + (found.length > 1 ? 's' : '') + ' to watch</h3><p>Follow the recommendations below.</p></div></div>'
        : '<div class="callout green" style="margin-bottom:14px">' + A.ICONS.check + '<div><h3>' + saved + ' · all nominal</h3><p>No rules fired. Great job keeping your routine.</p></div></div>';
    document.getElementById('result').innerHTML = head + '<div class="alert-list">' + found.map(function (f) {
      var sys = A.SYSTEMS[f.system] ? A.SYSTEMS[f.system].label : f.system;
      return '<div class="alert-item l-' + f.level + '"><div class="alert-ico">' + A.ICONS.alert + '</div><div><h4>' + A.esc(f.message) + '</h4><p>' + A.esc(f.recommendation) + '</p><div class="meta"><span>' + A.esc(sys) + '</span>' + (f.id ? '<span>alert #' + f.id + '</span>' : '') + '</div></div>' + A.pill(f.level) + '</div>';
    }).join('') + '</div>';
    document.getElementById('resultPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  document.getElementById('checkinForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var data = validate(); if (!data) { A.toast('Please fix the highlighted fields.', 'yellow'); return; }
    var preview = R.checkCheckin(data, member ? member.baselines : null);
    showResult(preview, { pending: true });
    var btn = document.getElementById('submitBtn'); btn.disabled = true;
    Api.submitCheckin(data).then(function (res) {
      // The server ran health/rules.py: show exactly the alerts it created.
      showResult(res && res.alerts ? res.alerts : preview);
      A.toast('Check-in saved', 'green'); loadRecent();
    }).catch(function (err) {
      showResult(preview, { error: 'Could not save to the server: ' + err.message + '.' });
      A.toast('Could not save to server: ' + err.message, 'red');
    }).then(function () { btn.disabled = false; });
  });
  document.getElementById('checkinForm').addEventListener('reset', function () {
    setTimeout(function () { document.getElementById('sleepOut').textContent = document.getElementById('sleep_hours').value + ' h'; document.getElementById('exOut').textContent = document.getElementById('exercise_minutes').value + ' min'; prefill(); }, 0);
  });

  function loadRecent() {
    Api.getCheckins({ astronaut: aid, limit: 7 }).then(function (res) {
      var rows = res.checkins.map(function (c) {
        var lv = R.worst(R.checkCheckin(c, member ? member.baselines : null).map(function (f) { return f.level; }));
        return '<tr class="row-' + lv + '"><td>' + A.fmtDate(c.created_at) + '</td><td class="num">' + c.sleep_hours.toFixed(1) + ' h</td><td class="num">' + c.mood + '/5</td><td class="num">' + c.stress + '/5</td><td class="num">' + c.exercise_minutes + '</td></tr>';
      }).join('');
      document.getElementById('recentTable').innerHTML = '<thead><tr><th>Date</th><th class="num">Sleep</th><th class="num">Mood</th><th class="num">Stress</th><th class="num">Exercise</th></tr></thead><tbody>' + rows + '</tbody>';
      if (res.checkins[0]) {
        var today = A.fmtDate(res.checkins[0].created_at) === A.fmtDate(new Date().toISOString());
        document.getElementById('lastCheckin').innerHTML = today ? A.pill('green', 'Done today') : A.pill('yellow', 'Due today');
      }
    }).catch(function (e) { console.warn('recent check-ins', e); });
  }

  prefill().catch(function (e) { A.toast('Could not load your latest device values: ' + e.message, 'yellow'); }).then(loadRecent);
})();
