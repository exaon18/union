/* ASTRA HEALTH - shared UI: top bar, session, formatting, icons, 3D space backdrop, animations,
 * toasts/modals, alarm, gauges, alert rows and the organ map used by the 3D body.
 * Visual system adapted from our teammate's "UNION Mission Health" concept. */
(function (global) {
  'use strict';

  var COLORS = { green: '#2fd08a', yellow: '#f5b83d', red: '#ff5468', cyan: '#6fd3ff', violet: '#9085e9', blue: '#3987e5', orange: '#d95926', aqua: '#199e70' };
  var TZ = 'Africa/Addis_Ababa';

  var I = function (p, extra) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (extra || '') + '>' + p + '</svg>'; };
  var ICONS = {
    logo: '<svg viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6fd3ff"/><stop offset="1" stop-color="#b9a8ff"/></linearGradient></defs><circle cx="16" cy="16" r="13" fill="none" stroke="url(#lg)" stroke-width="2"/><ellipse cx="16" cy="16" rx="15" ry="5.5" fill="none" stroke="url(#lg)" stroke-width="1.4" transform="rotate(-25 16 16)" opacity=".8"/><path d="M8 17h4l2-5 3 9 2-6h5" fill="none" stroke="#e6f6ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    heart: I('<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>'),
    pulse: I('<path d="M3 12h4l3-8 4 16 3-8h4"/>'),
    lungs: I('<path d="M12 4v8m0 0-3 3m3-3 3 3"/><path d="M8.5 7C5 7 3 12 3 16c0 2 1 4 3 4s3-1 3-3V9.5"/><path d="M15.5 7C19 7 21 12 21 16c0 2-1 4-3 4s-3-1-3-3V9.5"/>'),
    drop: I('<path d="M12 2.7S6 9.3 6 14a6 6 0 0 0 12 0c0-4.7-6-11.3-6-11.3z"/>'),
    thermo: I('<path d="M14 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0z"/>'),
    gauge: I('<path d="M12 14l4-4"/><path d="M3.3 19a10 10 0 1 1 17.4 0"/>'),
    brain: I('<path d="M9 3a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 1 5 3 3 0 0 0 4 3V3z"/><path d="M15 3a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-1 5 3 3 0 0 1-4 3V3z"/>'),
    bone: I('<path d="M17 10c.7-.7 1.7-.6 2.5-.8a2.5 2.5 0 1 0-3-3c-.2.8-.1 1.8-.8 2.5l-5.7 5.7c-.7.7-1.7.6-2.5.8a2.5 2.5 0 1 0 3 3c.2-.8.1-1.8.8-2.5z"/>'),
    shield: I('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>'),
    radiation: I('<circle cx="12" cy="12" r="2"/><path d="M12 2a10 10 0 0 1 8.7 5L14 11"/><path d="M3.3 7A10 10 0 0 1 12 2v0l-.1 7.9"/><path d="M12 22a10 10 0 0 1-8.7-5L10 13"/><path d="M20.7 17A10 10 0 0 1 12 22l.1-7.9"/>'),
    leaf: I('<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10z"/><path d="M2 21c0-3 1.9-5.4 5.1-6"/>'),
    wind: I('<path d="M17.7 7.7A2.5 2.5 0 1 1 19.5 12H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/>'),
    volume: I('<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>'),
    alert: I('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>'),
    check: I('<path d="M20 6 9 17l-5-5"/>'),
    clock: I('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),
    user: I('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
    users: I('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>'),
    rocket: I('<path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.9A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22.4 22.4 0 0 1-4 2z"/><path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5"/>'),
    clipboard: I('<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>'),
    zap: I('<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>'),
    chart: I('<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>'),
    headset: I('<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>'),
    logout: I('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>'),
    login: I('<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="m10 17 5-5-5-5M15 12H3"/>'),
    globe: I('<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z"/>'),
    flame: I('<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3.3.4 1.2 1.4 2.8 2.5 2.8z"/>'),
    moon: I('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>'),
    candy: I('<circle cx="12" cy="12" r="4"/><path d="M8.5 9.5 4 5l-2 3 3 1M15.5 14.5 20 19l2-3-3-1"/>'),
    arrow: I('<path d="M5 12h14M12 5l7 7-7 7"/>'),
    eye: I('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'),
    menu: I('<path d="M3 6h18M3 12h18M3 18h18"/>'),
    microbe: I('<circle cx="12" cy="12" r="5"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5M4.9 4.9l3.5 3.5M15.6 15.6l3.5 3.5M4.9 19.1l3.5-3.5M15.6 8.4l3.5-3.5"/>')
  };

  // Display metadata for every metric the simulator sends
  var METRICS = {
    heart_rate: { label: 'Heart rate', unit: 'bpm', icon: 'heart', dec: 0, system: 'cardiovascular' },
    resting_heart_rate: { label: 'Resting HR', unit: 'bpm', icon: 'heart', dec: 0, system: 'cardiovascular' },
    hrv: { label: 'HRV', unit: 'ms', icon: 'pulse', dec: 0, system: 'cardiovascular' },
    ecg_rhythm: { label: 'ECG rhythm', unit: '', icon: 'pulse', system: 'cardiovascular' },
    spo2: { label: 'SpO₂', unit: '%', icon: 'lungs', dec: 0, system: 'cardiovascular' },
    systolic_bp: { label: 'Systolic BP', unit: 'mmHg', icon: 'gauge', dec: 0, system: 'cardiovascular' },
    diastolic_bp: { label: 'Diastolic BP', unit: 'mmHg', icon: 'gauge', dec: 0, system: 'cardiovascular' },
    body_temperature: { label: 'Body temp', unit: '°C', icon: 'thermo', dec: 1, system: 'immune' },
    skin_temperature: { label: 'Skin temp', unit: '°C', icon: 'thermo', dec: 1, system: 'immune' },
    respiration_rate: { label: 'Respiration', unit: 'br/min', icon: 'wind', dec: 0, system: 'cardiovascular' },
    blood_glucose: { label: 'Glucose', unit: 'mg/dL', icon: 'drop', dec: 0, system: 'immune' },
    stress_level: { label: 'Stress', unit: '/100', icon: 'brain', dec: 0, system: 'behavioral' },
    radiation_dose: { label: 'Radiation dose', unit: 'mSv/day', icon: 'radiation', dec: 2, system: 'radiation' },
    sleep_total: { label: 'Sleep', unit: 'h', icon: 'moon', dec: 1, system: 'behavioral' },
    sleep_deep: { label: 'Deep sleep', unit: 'h', icon: 'moon', dec: 1, system: 'behavioral' },
    sleep_rem: { label: 'REM sleep', unit: 'h', icon: 'moon', dec: 1, system: 'behavioral' },
    sleep_light: { label: 'Light sleep', unit: 'h', icon: 'moon', dec: 1, system: 'behavioral' },
    recovery_score: { label: 'Recovery', unit: '/100', icon: 'zap', dec: 0, system: 'behavioral' },
    exercise_minutes: { label: 'Exercise', unit: 'min', icon: 'flame', dec: 0, system: 'musculoskeletal' },
    distance: { label: 'Treadmill distance', unit: 'km', icon: 'flame', dec: 1, system: 'musculoskeletal' },
    calories_burned: { label: 'Calories', unit: 'kcal', icon: 'flame', dec: 0, system: 'musculoskeletal' },
    body_mass: { label: 'Body mass', unit: 'kg', icon: 'user', dec: 1, system: 'musculoskeletal' },
    grip_strength: { label: 'Grip strength', unit: 'kg', icon: 'bone', dec: 1, system: 'musculoskeletal' },
    urine_calcium: { label: 'Urine calcium', unit: 'mg/day', icon: 'bone', dec: 0, system: 'musculoskeletal' },
    pvt_reaction_time: { label: 'PVT reaction', unit: 'ms', icon: 'zap', dec: 0, system: 'behavioral' },
    pvt_lapses: { label: 'PVT lapses', unit: '', icon: 'zap', dec: 0, system: 'behavioral' },
    co2: { label: 'CO₂', unit: 'ppm', icon: 'wind', dec: 0, system: 'environment' },
    o2: { label: 'O₂', unit: '%', icon: 'lungs', dec: 1, system: 'environment' },
    cabin_temperature: { label: 'Temperature', unit: '°C', icon: 'thermo', dec: 1, system: 'environment' },
    humidity: { label: 'Humidity', unit: '%', icon: 'drop', dec: 0, system: 'environment' },
    cabin_pressure: { label: 'Pressure', unit: 'kPa', icon: 'gauge', dec: 1, system: 'environment' },
    cabin_radiation: { label: 'Cabin radiation', unit: 'mSv/day', icon: 'radiation', dec: 2, system: 'radiation' },
    noise: { label: 'Noise', unit: 'dB', icon: 'volume', dec: 0, system: 'environment' },
    voc: { label: 'VOC', unit: 'mg/m³', icon: 'leaf', dec: 2, system: 'environment' }
  };

  var SYSTEMS = {
    cardiovascular: { label: 'Cardiovascular', icon: 'heart' },
    musculoskeletal: { label: 'Bone & Muscle', icon: 'bone' },
    immune: { label: 'Immune', icon: 'microbe' },
    behavioral: { label: 'Behavioral', icon: 'brain' },
    radiation: { label: 'Radiation', icon: 'radiation' },
    environment: { label: 'Environment', icon: 'leaf' }
  };

  /* ---------- formatting ---------- */
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtTime(isoStr, withSec) {
    var d = new Date(isoStr); if (isNaN(d)) return '—';
    var o = { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ }; if (withSec) o.second = '2-digit';
    return d.toLocaleTimeString('en-GB', o);
  }
  function fmtDateTime(isoStr) {
    var d = new Date(isoStr); if (isNaN(d)) return '—';
    return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ });
  }
  function fmtDate(isoStr) {
    var d = new Date(isoStr); if (isNaN(d)) return '—';
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', timeZone: TZ });
  }
  function ago(isoStr) {
    var s = Math.round((Date.now() - Date.parse(isoStr)) / 1000);
    if (isNaN(s)) return '—';
    if (s < 5) return 'just now';
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    return Math.floor(s / 86400) + ' d ago';
  }
  function fmtVal(r, metric) {
    if (!r) return '—';
    if (r.value === null || r.value === undefined) return esc(String(r.text_value || '—').replace(/_/g, ' '));
    var m = METRICS[metric || r.metric]; var d = m && m.dec !== undefined ? m.dec : 1;
    return Number(r.value).toFixed(d);
  }
  function byMetric(readings) { var o = {}; (readings || []).forEach(function (r) { o[r.metric] = r; }); return o; }
  function levelOf(r) { if (!r) return 'green'; return AstraRules.levelFor(r.metric, r.value !== null && r.value !== undefined ? r.value : r.text_value); }
  function statusLabel(l) { return { green: 'Nominal', yellow: 'Caution', red: 'Critical' }[l] || l; }
  function initials(name) { return String(name || '?').split(' ').map(function (p) { return p[0]; }).join('').slice(0, 2).toUpperCase(); }
  function missionDay() { return global.MockAPI ? MockAPI.missionDay() : 1; }

  /* ---------- session ----------
   * Real mode: POST /api/auth/login/ returns a token; the session (user + token) is kept in
   * localStorage and the token is sent as "Authorization: Token <key>" on writes.
   * Mock mode (?api=mock): the demo users below, checked in the browser. */
  var SESSION_KEY = 'astra_session';
  var USERS = {
    abebe: { role: 'astronaut', astronaut_id: 1, name: 'Abebe Kebede' },
    sara: { role: 'astronaut', astronaut_id: 2, name: 'Sara Tesfaye' },
    dawit: { role: 'astronaut', astronaut_id: 3, name: 'Dawit Haile' },
    hana: { role: 'astronaut', astronaut_id: 4, name: 'Hana Girma' },
    surgeon: { role: 'surgeon', astronaut_id: null, name: 'Dr. Meron Alemu', title: 'Flight Surgeon' }
  };
  var DEMO_PASSWORD = 'astra2026';
  function getSession() {
    try {
      var s = JSON.parse(localStorage.getItem(SESSION_KEY));
      if (!s) return null;
      if (!Api.USE_MOCK && !s.token) return null;      // old mock session -> log in again for real
      return s;
    } catch (e) { return null; }
  }
  function saveSession(s) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); return s; }
  function clearSession() { localStorage.removeItem(SESSION_KEY); }
  /** Log in. Always returns a Promise resolving to the session, or rejecting with an Error. */
  function login(username, password) {
    var uname = String(username || '').trim().toLowerCase();
    if (Api.USE_MOCK) {
      var u = USERS[uname];
      if (!u || password !== DEMO_PASSWORD) return Promise.reject(new Error('Wrong username or password.'));
      return Promise.resolve(saveSession({ username: uname, role: u.role, astronaut_id: u.astronaut_id, name: u.name, title: u.title || null, at: new Date().toISOString() }));
    }
    return Api.login(uname, password).then(function (res) {
      var u = res.user || {};
      if (u.role !== 'astronaut' && u.role !== 'surgeon') throw new Error('This account has no astronaut or flight-surgeon role.');
      return saveSession({
        username: u.username, role: u.role, astronaut_id: u.astronaut_id, title: u.title || null,
        name: (u.role === 'surgeon' ? 'Dr. ' : '') + (u.name || u.username),
        token: res.token, expires_at: res.expires_at || null, at: new Date().toISOString()
      });
    }, function (e) {
      if (e.status === 401) throw new Error('Wrong username or password.');
      throw e;
    });
  }
  function logout() {
    var done = function () { clearSession(); location.href = 'index.html'; };
    if (Api.USE_MOCK || !getSession()) { done(); return; }
    Api.logout().catch(function () { /* token already gone or offline */ }).then(done);
  }
  function toLogin(denied) {
    location.replace('login.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search) + (denied ? '&denied=1' : '') );
  }
  // Token rejected by the server (expired, logged out elsewhere, DB reset): sign in again.
  Api.onUnauthorized = function () {
    if (!getSession()) return;
    clearSession();
    toast('Your session expired. Please log in again.', 'yellow');
    setTimeout(function () { toLogin(false); }, 900);
  };
  /** Require login; roles = ['astronaut'] etc. Returns session or redirects. */
  function requireLogin(roles) {
    var s = getSession();
    if (!s || (roles && roles.indexOf(s.role) < 0)) {
      toLogin(!!s);
      return null;
    }
    // Real mode: check the token in the background (expired tokens -> login page).
    if (!Api.USE_MOCK) {
      Api.me().catch(function (e) { if (e.status === 401) Api.onUnauthorized(e); });
    }
    return s;
  }
  /** Astronaut id to show: ?astronaut= for surgeons, own id for astronauts. */
  function viewedAstronaut(session) {
    var q = new URLSearchParams(location.search).get('astronaut');
    if (session && session.role === 'surgeon') return Number(q) || 1;
    return session ? session.astronaut_id : Number(q) || 1;
  }


  // URL of this file, so js/3d/*.js resolves the same from every page (captured while it runs).
  var COMMON_SRC = (document.currentScript && document.currentScript.src) || new URL('js/common.js', location.href).href;
  var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // Status icons: colour always travels with an icon and a word.
  var SI = function (d) { return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; };
  var ST_ICON = {
    green: SI('<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.8 2.8L16 9.8"/>'),
    yellow: SI('<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.6v.1"/>'),
    red: SI('<path d="M8 2.8h8L21.2 8v8L16 21.2H8L2.8 16V8z"/><path d="M12 7.5v5.5M12 16.4v.1"/>'),
    none: SI('<circle cx="12" cy="12" r="9"/>')
  };
  ICONS.soundOn = I('<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>', ' class="sound-on"');
  ICONS.soundOff = I('<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="m22 9-6 6M16 9l6 6"/>', ' class="sound-off"');
  ICONS.lungs2 = ICONS.lungs;
  ICONS.immune = ICONS.shield;
  ICONS.bones = ICONS.bone;

  /* ---------- small animation helpers (no animation library needed) ---------- */
  var EASE = {
    out: function (t) { return 1 - Math.pow(1 - t, 3); },
    inOut: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  };
  /** Tween numeric props of obj to `to` over ms. Returns a cancel function. */
  function tween(obj, to, ms, opts) {
    opts = opts || {};
    var from = {}, keys = Object.keys(to), t0 = performance.now(), ease = EASE[opts.ease || 'out'], stop = false;
    keys.forEach(function (k) { from[k] = obj[k]; });
    if (obj.__tw) obj.__tw();
    var cancel = function () { stop = true; };
    obj.__tw = cancel;
    if (reduced || !ms) { keys.forEach(function (k) { obj[k] = to[k]; }); if (opts.update) opts.update(); if (opts.done) opts.done(); return cancel; }
    (function step(now) {
      if (stop) return;
      var p = Math.min(1, (now - t0) / ms), e = ease(p);
      keys.forEach(function (k) { obj[k] = from[k] + (to[k] - from[k]) * e; });
      if (opts.update) opts.update();
      if (p < 1) requestAnimationFrame(step); else { obj.__tw = null; if (opts.done) opts.done(); }
    })(t0);
    return cancel;
  }
  /** Smoothly count a number element to a new value. */
  function countTo(node, value, dec) {
    if (!node) return;
    dec = dec || 0;
    if (value === null || value === undefined || isNaN(value)) { node.textContent = '—'; delete node.dataset.v; return; }
    var to = Number(value), from = node.dataset.v !== undefined ? parseFloat(node.dataset.v) : to;
    node.dataset.v = to;
    if (from === to || reduced) { node.textContent = to.toFixed(dec); return; }
    var o = { v: from };
    node.__o && node.__o.__tw && node.__o.__tw();
    node.__o = o;
    tween(o, { v: to }, 900, { update: function () { node.textContent = o.v.toFixed(dec); } });
  }
  /** Fade/slide in every .reveal element that has not been shown yet (staggered). */
  function reveal(root) {
    var items = Array.prototype.slice.call((root || document).querySelectorAll('.reveal:not(.in)'));
    items.forEach(function (n, i) {
      if (reduced) { n.classList.add('in'); return; }
      n.style.transitionDelay = Math.min(i * 70, 700) + 'ms';
      requestAnimationFrame(function () { requestAnimationFrame(function () { n.classList.add('in'); }); });
      setTimeout(function () { n.style.transitionDelay = ''; }, 1500 + i * 70);
    });
  }
  /** 3D tilt that follows the pointer (crew cards). */
  function tilt(node, max) {
    max = max || 6;
    if (reduced || (window.matchMedia && window.matchMedia('(hover: none)').matches) || node._tilt) return;
    node._tilt = true;
    node.addEventListener('pointermove', function (e) {
      var r = node.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      node.style.transform = 'perspective(700px) rotateX(' + (-y * max) + 'deg) rotateY(' + (x * max) + 'deg) translateY(-3px)';
    });
    node.addEventListener('pointerleave', function () { node.style.transform = ''; });
  }

  /* ---------- status language ---------- */
  function badge(level, text) {
    level = level || 'none';
    return '<span class="badge st-' + level + '">' + (ST_ICON[level] || ST_ICON.none) + esc(text || statusLabel(level)) + '</span>';
  }
  function setStatus(node, s) {
    if (!node) return;
    node.classList.remove('st-green', 'st-yellow', 'st-red', 'st-none');
    node.classList.add('st-' + (s || 'none'));
  }

  /* ---------- toasts + modals ---------- */
  function ensureRoot(id, cls) {
    var n = document.getElementById(id);
    if (!n) { n = document.createElement('div'); n.id = id; if (cls) n.className = cls; document.body.appendChild(n); }
    return n;
  }
  /** toast(message, level, body?) - level: green | yellow | red | info */
  function toast(msg, level, body) {
    var wrap = ensureRoot('toasts', 'toasts');
    var st = level === 'red' || level === 'yellow' || level === 'green' ? level : '';
    var t = document.createElement('div');
    t.className = 'toast' + (st ? ' st-' + st : '');
    t.setAttribute('role', st === 'red' ? 'alert' : 'status');
    t.innerHTML = '<span style="color:var(--st, var(--accent))">' + (ST_ICON[st] || ST_ICON.green) + '</span><div><b>' + esc(msg) + '</b>' + (body ? '<span class="muted">' + esc(body) + '</span>' : '') + '</div>';
    wrap.appendChild(t);
    setTimeout(function () { t.style.transition = 'opacity .4s'; t.style.opacity = 0; setTimeout(function () { t.remove(); }, 400); }, 4600);
  }
  function modal(html, opts) {
    opts = opts || {};
    var last = document.activeElement;
    var back = document.createElement('div');
    back.className = 'modal-backdrop'; back.setAttribute('role', 'dialog'); back.setAttribute('aria-modal', 'true');
    back.innerHTML = '<div class="modal' + (opts.red ? ' red' : '') + '">' + html + '</div>';
    var key = function (e) { if (e.key === 'Escape') close(); };
    function close() { back.remove(); document.removeEventListener('keydown', key); if (last && last.focus) last.focus(); if (opts.onClose) opts.onClose(); }
    back.addEventListener('click', function (e) { if (e.target === back || (e.target.closest && e.target.closest('[data-close]'))) close(); });
    document.addEventListener('keydown', key);
    ensureRoot('modal-root').appendChild(back);
    var f = back.querySelector('[autofocus]') || back.querySelector('button, input, textarea'); if (f) f.focus();
    return { close: close, node: back };
  }

  /* ---------- alarm: red frame + optional beep (off by default; toggle in the top bar) ---------- */
  var audio = null, soundOn = false, alarmTimer = null;
  try { soundOn = localStorage.getItem('astra_sound') === 'on'; } catch (e) { /* ignore */ }
  function beep() {
    if (!soundOn) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      [0, 0.22].forEach(function (d, i) {
        var o = audio.createOscillator(), g = audio.createGain(), at = audio.currentTime + d;
        o.type = 'sine'; o.frequency.value = i ? 660 : 880;
        g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(0.11, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
        o.connect(g).connect(audio.destination); o.start(at); o.stop(at + 0.22);
      });
    } catch (e) { /* audio not available */ }
  }
  var alarm = {
    set: function (on, opts) {
      opts = opts || {};
      on = !!on;
      if (on === document.body.classList.contains('alarm')) return;
      document.body.classList.toggle('alarm', on);
      clearInterval(alarmTimer);
      if (on && opts.sound !== false) { beep(); alarmTimer = setInterval(beep, 2600); }
    }
  };

  /* ---------- top bar ---------- */
  function navLinks(s) {
    var links = [['index.html', 'Mission', 'mission']];
    if (s && s.role === 'astronaut') links.push(['my-health.html', 'My Health', 'health'], ['checkin.html', 'Daily Check-in', 'checkin'], ['pvt.html', 'Reaction Test', 'pvt'], ['history.html', 'History', 'history']);
    if (s && s.role === 'surgeon') links.push(['support.html', 'Support Console', 'support'], ['history.html', 'Crew History', 'history']);
    return links;
  }
  function renderNav(active) {
    var s = getSession();
    var el = document.getElementById('topnav');
    if (!el) return;
    el.className = 'topbar';
    var nav = navLinks(s).map(function (l) { return '<a href="' + l[0] + '"' + (l[2] === active ? ' aria-current="page"' : '') + '>' + l[1] + '</a>'; }).join('') +
      (s ? '<a href="#" class="nav-logout" data-logout>Log out</a>' : '');
    var user = s
      ? '<div class="user-chip"><span class="avatar">' + esc(initials(String(s.name).replace(/^Dr\.\s*/, ''))) + '</span><span class="who"><b>' + esc(s.name) + '</b><small>' + esc(s.role === 'surgeon' ? 'Flight surgeon' : (s.title || 'Astronaut')) + '</small></span><button class="link-btn" data-logout>Log out</button></div>'
      : (active !== 'login' ? '<a class="btn btn-primary btn-sm" href="login.html">Log in</a>' : '');
    el.innerHTML =
      '<a class="brand" href="index.html" aria-label="ASTRA HEALTH home">' + ICONS.logo + '<span class="brand-text"><b>ASTRA</b><small>Health · Crew</small></span></a>' +
      '<nav class="nav" id="nav" aria-label="Main">' + nav + '</nav>' +
      '<div class="topbar-right">' +
        '<span class="chip st-green" id="conn" title="Connection to ' + esc(Api.API_BASE) + '"><span class="dot"></span><span id="conn-text">' + (Api.USE_MOCK ? 'Simulated link' : 'Link nominal') + '</span></span>' +
        '<div class="met"><small>EARTH · EAT</small><span class="mono" data-clock>--:--:--</span></div>' +
        (Api.USE_MOCK ? '<button class="chip demo-chip" id="demo-chip" type="button" title="Mock mode: data generated in your browser"><span class="dot dot-warn"></span><span>Demo data</span></button>' : '') +
        '<button class="icon-btn" id="sound-btn" type="button" aria-label="Alarm sound on/off" title="Alarm sound">' + ICONS.soundOn + ICONS.soundOff + '</button>' +
        '<span id="user-slot">' + user + '</span>' +
        '<button class="icon-btn menu-btn" id="menu-btn" type="button" aria-label="Menu" aria-expanded="false">' + ICONS.menu + '</button>' +
      '</div>';
    el.querySelectorAll('[data-logout]').forEach(function (b) { b.addEventListener('click', function (e) { e.preventDefault(); logout(); }); });
    document.getElementById('menu-btn').addEventListener('click', function (e) {
      var open = document.getElementById('nav').classList.toggle('open');
      e.currentTarget.setAttribute('aria-expanded', open);
    });
    var snd = document.getElementById('sound-btn');
    snd.classList.toggle('muted-snd', !soundOn);
    snd.addEventListener('click', function () {
      soundOn = !soundOn;
      try { localStorage.setItem('astra_sound', soundOn ? 'on' : 'off'); } catch (e) { /* ignore */ }
      snd.classList.toggle('muted-snd', !soundOn);
      if (soundOn) beep();
      toast(soundOn ? 'Alarm sound on' : 'Alarm sound off', 'green');
    });
    var demo = document.getElementById('demo-chip');
    if (demo) demo.addEventListener('click', function () {
      modal('<span class="badge st-yellow">' + ST_ICON.yellow + 'Mock mode</span><h2>Simulated data</h2><p>Values are generated in your browser (same JSON shapes as the real API) and refresh every few seconds. Astronaut 2 runs the emergency scenario.</p>' +
        '<div class="modal-actions"><button class="btn" data-act="reset">Reset demo data</button><a class="btn btn-primary" href="?api=real">Switch to the real API</a></div>').node
        .querySelector('[data-act="reset"]').addEventListener('click', function () { MockAPI.resetDemo(); location.reload(); });
    });
    startClock();
  }
  function renderFooter() {
    var el = document.getElementById('footer'); if (!el) return;
    el.className = 'footer';
    el.innerHTML = '<span class="disclaimer">' + ICONS.shield + '<span><b>Decision-support prototype, not a medical diagnosis.</b> Thresholds are demo values. Always confirm with the flight surgeon.</span></span>' +
      '<span>ASTRA HEALTH · Team Union · NASA Space Apps 2026 · Addis Ababa</span>';
  }
  var clockStarted = false;
  function startClock() {
    if (clockStarted) return; clockStarted = true;
    var upd = function () {
      var t = new Date().toLocaleTimeString('en-GB', { hour12: false, timeZone: TZ });
      document.querySelectorAll('[data-clock]').forEach(function (e) { e.textContent = t; });
    };
    upd(); setInterval(upd, 1000);
  }

  // Alert rows animate in once; re-rendering on the next poll must not replay the animation.
  var animSeen = {};
  function animCls(id) {
    if (id === undefined || id === null) return '';
    if (animSeen[id]) return '';
    var first = !animSeen.__init;
    animSeen[id] = 1;
    return first ? '' : ' enter';
  }
  function animDone() { animSeen.__init = 1; }

  /** Call fn now and every ms while the tab is visible. */
  function poll(fn, ms) {
    var busy = false;
    var run = function () {
      if (document.hidden || busy) return;
      busy = true;
      Promise.resolve().then(fn).then(function () { setConn(true); }, function (e) { console.warn('poll failed', e && e.message); if (!e || e.offline || e.status === 0) setConn(false); }).then(function () { busy = false; });
    };
    run();
    document.addEventListener('visibilitychange', function () { if (!document.hidden) run(); });
    return setInterval(run, ms || Api.POLL_MS);
  }
  function setConn(ok) {
    var c = document.getElementById('conn');
    if (c) {
      c.classList.toggle('conn-bad', !ok); setStatus(c, ok ? 'green' : 'red');
      document.getElementById('conn-text').textContent = ok ? (Api.USE_MOCK ? 'Simulated link' : 'Link nominal') : 'Link lost — retrying';
    }
    var bar = document.getElementById('offlineBar');
    if (!ok && !bar) {
      bar = document.createElement('div'); bar.id = 'offlineBar'; bar.className = 'offline-bar';
      bar.textContent = 'Offline · cannot reach ' + Api.API_BASE + ' · retrying…';
      var nav = document.getElementById('topnav'); if (nav) nav.insertAdjacentElement('afterend', bar);
    } else if (ok && bar) bar.remove();
  }

  /* ---------- 3D: WebGL check + lazy module loading ---------- */
  var webgl = (function () {
    try {
      if (/[?&]no3d=1/.test(location.search)) return false;
      var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
    } catch (e) { return false; }
  })();
  if (!webgl) document.documentElement.classList.add('no-webgl');
  /** Load js/3d/<name>.js as an ES module (three.js is vendored, no CDN). */
  function load3d(name) {
    if (!webgl) return Promise.reject(new Error('WebGL not available'));
    return import(new URL('3d/' + name + '.js', COMMON_SRC).href);
  }

  function backdrop() {
    if (document.getElementById('space')) return;
    var html = '<canvas id="space" aria-hidden="true"></canvas><div class="css-stars" aria-hidden="true"><i></i><i></i></div><div class="vignette" aria-hidden="true"></div><div class="alarm-frame" aria-hidden="true"></div>';
    document.body.insertAdjacentHTML('afterbegin', html);
    ensureRoot('toasts', 'toasts'); ensureRoot('modal-root');
    if (webgl) load3d('space').then(function (m) { m.startSpace(document.getElementById('space')); }).catch(function (err) {
      console.warn('3D background unavailable:', err && err.message);
      document.documentElement.classList.add('no-webgl');
    });
  }

  /* ---------- widgets ---------- */
  // Dial gauge (SVG). Returns update(value, status).
  var GA0 = 150, GSWEEP = 240, GR = 46, GCX = 60, GCY = 58, GLEN = GR * GSWEEP * Math.PI / 180;
  function gpolar(deg) { var a = deg * Math.PI / 180; return [GCX + GR * Math.cos(a), GCY + GR * Math.sin(a)]; }
  function garc(from, to) { var p1 = gpolar(from), p2 = gpolar(to); return 'M' + p1[0].toFixed(2) + ' ' + p1[1].toFixed(2) + 'A' + GR + ' ' + GR + ' 0 ' + (to - from > 180 ? 1 : 0) + ' 1 ' + p2[0].toFixed(2) + ' ' + p2[1].toFixed(2); }
  function gauge(host, cfg) {
    var min = cfg.min, max = cfg.max, dec = cfg.decimals || 0;
    var frac = function (v) { return Math.min(1, Math.max(0, (v - min) / (max - min))); };
    var ticks = (cfg.marks || []).map(function (m) { var a = (GA0 + GSWEEP * frac(m)) * Math.PI / 180; return '<line class="g-tick" x1="' + (GCX + (GR + 6) * Math.cos(a)) + '" y1="' + (GCY + (GR + 6) * Math.sin(a)) + '" x2="' + (GCX + (GR + 11) * Math.cos(a)) + '" y2="' + (GCY + (GR + 11) * Math.sin(a)) + '" stroke-width="2" stroke-linecap="round"/>'; }).join('');
    host.className = 'gauge st-green';
    host.innerHTML = '<svg viewBox="0 0 120 100" role="img"><path class="g-track" d="' + garc(GA0, GA0 + GSWEEP) + '" fill="none" stroke-width="7" stroke-linecap="round"/>' +
      '<path class="g-val" d="' + garc(GA0, GA0 + GSWEEP) + '" fill="none" stroke-width="7" stroke-linecap="round" stroke-dasharray="0 ' + GLEN + '"/>' + ticks +
      '<line class="g-needle" x1="' + (GCX + 30) + '" y1="' + GCY + '" x2="' + (GCX + 41) + '" y2="' + GCY + '" stroke-width="2.2" stroke-linecap="round" transform="rotate(' + GA0 + ' ' + GCX + ' ' + GCY + ')"/>' +
      '<text class="g-num" x="' + GCX + '" y="' + (GCY + 5) + '" text-anchor="middle">—</text><text class="g-unit" x="' + GCX + '" y="' + (GCY + 21) + '" text-anchor="middle">' + esc(cfg.unit) + '</text></svg>' +
      '<div class="gauge-name">' + esc(cfg.name) + '</div><div class="gauge-st"><span class="dot"></span><span class="g-word">—</span></div>';
    var val = host.querySelector('.g-val'), needle = host.querySelector('.g-needle'), num = host.querySelector('.g-num'), word = host.querySelector('.g-word'), svg = host.querySelector('svg');
    var state = { f: 0, v: null };
    var paint = function () { val.setAttribute('stroke-dasharray', (GLEN * state.f).toFixed(2) + ' ' + GLEN); needle.setAttribute('transform', 'rotate(' + (GA0 + GSWEEP * state.f) + ' ' + GCX + ' ' + GCY + ')'); if (state.v !== null) num.textContent = state.v.toFixed(dec); };
    return function (value, status) {
      status = status || 'green';
      if (value === null || value === undefined || isNaN(value)) { num.textContent = '—'; return; }
      host.className = 'gauge st-' + status; word.textContent = statusLabel(status);
      svg.setAttribute('aria-label', cfg.name + ': ' + Number(value).toFixed(dec) + ' ' + cfg.unit + ', ' + statusLabel(status));
      if (state.v === null) { state.v = value; state.f = 0; }
      tween(state, { f: frac(value), v: value }, 1100, { update: paint });
    };
  }

  /** One alert as a feed row. opts: {actions: html, showName: bool, detail: bool} */
  function alertItem(al, opts) {
    opts = opts || {};
    var lvl = al.resolved ? 'none' : al.level;
    var sys = SYSTEMS[al.system] ? SYSTEMS[al.system].label : (al.system || '');
    var tags = '<div class="fi-tags"><span class="tag">' + esc(sys) + '</span>' + (al.source ? '<span class="tag">' + esc(al.source) + '</span>' : '') +
      (al.acknowledged && !al.resolved ? '<span class="tag ack">acknowledged' + (al.acknowledged_by ? ' · ' + esc(al.acknowledged_by) : '') + '</span>' : '') +
      (al.resolved ? '<span class="tag">resolved' + (al.resolved_by ? ' · ' + esc(al.resolved_by) : '') + '</span>' : '') + '</div>';
    return '<li class="feed-item st-' + lvl + (al.resolved ? ' resolved' : '') + (al.acknowledged && !al.resolved ? ' acked' : '') + animCls('a' + al.id + (al.resolved ? 'r' : '')) + '" data-id="' + esc(al.id) + '">' +
      '<span class="fi-ico">' + (ST_ICON[al.level] || ST_ICON.none) + '</span>' +
      '<div><div class="fi-title">' + (opts.showName !== false && al.astronaut ? esc(al.astronaut) + ' · ' : (opts.showName !== false && !al.astronaut_id ? 'Cabin · ' : '')) + esc(al.message) + '</div>' +
      '<div class="fi-meta">' + esc(statusLabel(al.level)) + ' · ' + esc(fmtTime(al.created_at, true)) + ' EAT</div>' +
      (opts.detail !== false && al.recommendation ? '<div class="rec"><b>What to do:</b> ' + esc(al.recommendation) + '</div>' : '') +
      (opts.detail !== false ? tags : '') + (opts.actions || '') + '</div>' +
      '<time datetime="' + esc(al.created_at) + '">' + esc(ago(al.created_at)) + '</time></li>';
  }

  /* ---------- organ map for the 3D body (from latest readings + open alerts) ---------- */
  var ORGANS = {
    heart: { label: 'Heart', icon: 'heart', metrics: ['heart_rate', 'resting_heart_rate', 'hrv', 'ecg_rhythm', 'systolic_bp', 'diastolic_bp'], systems: ['cardiovascular'], match: /heart|ecg|rhythm|blood pressure|bp|hrv|cardi/i,
      ok: 'Heart rate, rhythm and blood pressure are in range.' },
    lungs: { label: 'Lungs', icon: 'lungs', metrics: ['spo2', 'respiration_rate'], systems: [], match: /spo|oxygen|respirat|breath|hypox/i,
      ok: 'Blood oxygen and breathing rate are normal.' },
    brain: { label: 'Brain', icon: 'brain', metrics: ['stress_level', 'pvt_reaction_time', 'pvt_lapses', 'sleep_total'], systems: ['behavioral'],
      ok: 'Alertness, sleep and stress look fine.' },
    bones: { label: 'Bones and muscle', icon: 'bone', metrics: ['urine_calcium', 'grip_strength', 'body_mass', 'exercise_minutes'], systems: ['musculoskeletal'],
      ok: 'Exercise and bone markers on track.' },
    immune: { label: 'Immune system', icon: 'shield', metrics: ['body_temperature', 'blood_glucose', 'radiation_dose'], systems: ['immune', 'radiation'],
      ok: 'Temperature, glucose and radiation dose are in range.' }
  };
  var ORGAN_ORDER = ['heart', 'lungs', 'brain', 'bones', 'immune'];
  /** latest: byMetric map; alerts: open alerts for this astronaut. Returns {organ: {status, note, metrics:{label: value}}}. */
  function organsFrom(latest, alerts) {
    var out = {};
    ORGAN_ORDER.forEach(function (k) {
      var o = ORGANS[k], levels = [], notes = [], metrics = {};
      o.metrics.forEach(function (m) {
        var r = latest[m]; if (!r) return;
        var lv = levelOf(r), meta = METRICS[m];
        levels.push(lv);
        metrics[meta.label] = fmtVal(r) + (meta.unit ? ' ' + meta.unit : '');
        if (lv !== 'green') notes.push(meta.label + ' ' + fmtVal(r) + (meta.unit ? ' ' + meta.unit : ''));
      });
      (alerts || []).forEach(function (al) {
        if (al.resolved) return;
        var hit;
        if (k === 'lungs') hit = o.match.test(al.message);
        else if (k === 'heart') hit = o.systems.indexOf(al.system) >= 0 && !ORGANS.lungs.match.test(al.message);
        else hit = o.systems.indexOf(al.system) >= 0;
        if (hit) { levels.push(al.level); if (notes.indexOf(al.message) < 0 && notes.length < 2) notes.push(al.message); }
      });
      var st = AstraRules.worst(levels);
      out[k] = { status: st, note: notes.length ? notes.slice(0, 2).join(' · ') : o.ok, metrics: metrics };
    });
    return out;
  }

  // A failed API call that a page didn't handle: log it quietly and show the OFFLINE state.
  window.addEventListener('unhandledrejection', function (ev) {
    var e = ev.reason;
    if (e && (e.offline || e.status !== undefined)) {
      ev.preventDefault();
      console.warn('API request failed:', e.message);
      if (e.offline) setConn(false);
    }
  });

  function init(active) {
    document.body.dataset.page = active;
    backdrop();
    renderNav(active);
    renderFooter();
    requestAnimationFrame(function () { reveal(); });
    setTimeout(animDone, 2500);   // after the first renders, new alert rows slide in
  }

  global.Astra = {
    COLORS: COLORS, ICONS: ICONS, ST_ICON: ST_ICON, METRICS: METRICS, SYSTEMS: SYSTEMS, TZ: TZ, USERS: USERS, DEMO_PASSWORD: DEMO_PASSWORD,
    ORGANS: ORGANS, ORGAN_ORDER: ORGAN_ORDER, reduced: reduced, webgl: webgl,
    esc: esc, fmtTime: fmtTime, fmtDateTime: fmtDateTime, fmtDate: fmtDate, ago: ago, fmtVal: fmtVal, byMetric: byMetric,
    levelOf: levelOf, statusLabel: statusLabel, initials: initials, pill: badge, badge: badge, setStatus: setStatus, missionDay: missionDay,
    getSession: getSession, login: login, logout: logout, requireLogin: requireLogin, viewedAstronaut: viewedAstronaut, clearSession: clearSession,
    init: init, toast: toast, modal: modal, alarm: alarm, animCls: animCls, animDone: animDone, poll: poll, setConn: setConn,
    tween: tween, countTo: countTo, reveal: reveal, tilt: tilt, gauge: gauge, alertItem: alertItem, organsFrom: organsFrom, load3d: load3d
  };
})(window);
