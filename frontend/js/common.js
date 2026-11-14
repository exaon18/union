/* ASTRA HEALTH - shared UI: nav, session, formatting, icons, starfield. */
(function (global) {
  'use strict';

  var COLORS = { green: '#22c55e', yellow: '#facc15', red: '#ef4444', cyan: '#22d3ee', violet: '#a78bfa', blue: '#60a5fa' };
  var TZ = 'Africa/Addis_Ababa';

  var I = function (p, extra) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (extra || '') + '>' + p + '</svg>'; };
  var ICONS = {
    logo: '<svg viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#a78bfa"/></linearGradient></defs><circle cx="16" cy="16" r="13" fill="none" stroke="url(#lg)" stroke-width="2"/><ellipse cx="16" cy="16" rx="15" ry="5.5" fill="none" stroke="url(#lg)" stroke-width="1.4" transform="rotate(-25 16 16)" opacity=".8"/><path d="M8 17h4l2-5 3 9 2-6h5" fill="none" stroke="#e6f6ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
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
  function pill(level, text) { return '<span class="pill pill-' + level + '"><i></i>' + esc(text || statusLabel(level)) + '</span>'; }
  function missionDay() { return global.MockAPI ? MockAPI.missionDay() : 1; }

  /* ---------- session (mock login) ---------- */
  var SESSION_KEY = 'astra_session';
  var USERS = {
    abebe: { role: 'astronaut', astronaut_id: 1, name: 'Abebe Kebede' },
    sara: { role: 'astronaut', astronaut_id: 2, name: 'Sara Tesfaye' },
    dawit: { role: 'astronaut', astronaut_id: 3, name: 'Dawit Haile' },
    hana: { role: 'astronaut', astronaut_id: 4, name: 'Hana Girma' },
    surgeon: { role: 'surgeon', astronaut_id: null, name: 'Dr. Meron Alemu', title: 'Flight Surgeon' }
  };
  var DEMO_PASSWORD = 'astra2026';
  function getSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (e) { return null; } }
  function login(username, password) {
    var u = USERS[String(username || '').trim().toLowerCase()];
    if (!u || password !== DEMO_PASSWORD) return null;
    var s = { username: String(username).trim().toLowerCase(), role: u.role, astronaut_id: u.astronaut_id, name: u.name, title: u.title || null, at: new Date().toISOString() };
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    return s;
  }
  function logout() { localStorage.removeItem(SESSION_KEY); location.href = 'index.html'; }
  /** Require login; roles = ['astronaut'] etc. Returns session or redirects. */
  function requireLogin(roles) {
    var s = getSession();
    if (!s || (roles && roles.indexOf(s.role) < 0)) {
      location.replace('login.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search) + (s ? '&denied=1' : ''));
      return null;
    }
    return s;
  }
  /** Astronaut id to show: ?astronaut= for surgeons, own id for astronauts. */
  function viewedAstronaut(session) {
    var q = new URLSearchParams(location.search).get('astronaut');
    if (session && session.role === 'surgeon') return Number(q) || 1;
    return session ? session.astronaut_id : Number(q) || 1;
  }

  /* ---------- layout ---------- */
  function renderNav(active) {
    var s = getSession();
    var links = [['index.html', 'Mission', 'globe', 'mission']];
    if (s && s.role === 'astronaut') {
      links.push(['my-health.html', 'My Health', 'heart', 'health'], ['checkin.html', 'Check-in', 'clipboard', 'checkin'], ['pvt.html', 'PVT', 'zap', 'pvt'], ['history.html', 'History', 'chart', 'history']);
    }
    if (s && s.role === 'surgeon') {
      links.push(['support.html', 'Mission Support', 'headset', 'support'], ['my-health.html?astronaut=2', 'Crew Health', 'heart', 'health'], ['history.html?astronaut=2', 'History', 'chart', 'history']);
    }
    var nav = links.map(function (l) {
      return '<a href="' + l[0] + '" class="' + (l[3] === active ? 'active' : '') + '">' + ICONS[l[2]] + '<span>' + l[1] + '</span></a>';
    }).join('');
    var right = s
      ? '<div class="nav-user"><div class="avatar sm">' + initials(s.name) + '</div><div class="nav-user-text"><b>' + esc(s.name) + '</b><small>' + (s.role === 'surgeon' ? 'Flight Surgeon' : 'Astronaut') + '</small></div><button class="btn btn-ghost btn-sm" id="logoutBtn" title="Log out">' + ICONS.logout + '<span>Logout</span></button></div>'
      : '<a class="btn btn-primary btn-sm" href="login.html">' + ICONS.login + '<span>Login</span></a>';
    var el = document.getElementById('topnav');
    if (!el) return;
    el.className = 'topnav';
    el.innerHTML = '<div class="topnav-inner"><a class="brand" href="index.html">' + ICONS.logo + '<div><b>ASTRA</b><span>HEALTH</span></div></a>' +
      '<nav class="nav-links" id="navLinks">' + nav + '</nav>' +
      '<div class="nav-right"><div class="nav-clock"><small>EARTH · EAT</small><b data-clock>--:--:--</b></div>' + right +
      '<button class="btn btn-ghost btn-sm nav-toggle" id="navToggle" aria-label="Menu">' + ICONS.menu + '</button></div></div>' +
      (Api.USE_MOCK ? '<div class="mock-banner">SIMULATED DATA · mock mode</div>' : '');
    var lb = document.getElementById('logoutBtn'); if (lb) lb.addEventListener('click', logout);
    document.getElementById('navToggle').addEventListener('click', function () { document.getElementById('navLinks').classList.toggle('open'); });
    startClock();
  }
  function renderFooter() {
    var el = document.getElementById('footer'); if (!el) return;
    el.className = 'footer';
    el.innerHTML = '<div>' + ICONS.shield + '<span><b>Decision-support prototype, not a medical diagnosis.</b> Thresholds are demo values. Always confirm with the flight surgeon.</span></div>' +
      '<div class="footer-meta">ASTRA HEALTH · NASA Space Apps Challenge 2026 · Addis Ababa</div>';
  }
  var clockStarted = false;
  function startClock() {
    if (clockStarted) return; clockStarted = true;
    var upd = function () {
      var t = new Date().toLocaleTimeString('en-GB', { hour12: false, timeZone: TZ });
      document.querySelectorAll('[data-clock]').forEach(function (e) { e.textContent = t; });
      document.querySelectorAll('[data-utc]').forEach(function (e) { e.textContent = new Date().toISOString().slice(11, 19); });
    };
    upd(); setInterval(upd, 1000);
  }

  function toast(msg, level) {
    var wrap = document.getElementById('toasts');
    if (!wrap) { wrap = document.createElement('div'); wrap.id = 'toasts'; document.body.appendChild(wrap); }
    var t = document.createElement('div');
    t.className = 'toast toast-' + (level || 'info');
    t.innerHTML = (level === 'red' || level === 'yellow' ? ICONS.alert : ICONS.check) + '<span>' + esc(msg) + '</span>';
    wrap.appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 400); }, 4200);
  }

  /** Call fn now and every ms while the tab is visible. */
  function poll(fn, ms) {
    var busy = false;
    var run = function () {
      if (document.hidden || busy) return;          // skip if the previous refresh is still running
      busy = true;
      Promise.resolve().then(fn).catch(function (e) { console.warn('poll failed', e); setConn(false); }).then(function () { busy = false; });
    };
    run();
    return setInterval(run, ms || Api.POLL_MS);
  }
  function setConn(ok) {
    document.querySelectorAll('[data-conn]').forEach(function (e) {
      e.classList.toggle('bad', !ok);
      e.querySelector('span') && (e.querySelector('span').textContent = ok ? (Api.USE_MOCK ? 'LIVE · SIMULATED' : 'LIVE') : 'OFFLINE');
    });
  }

  /* ---------- starfield ---------- */
  function starfield() {
    var c = document.createElement('canvas'); c.id = 'stars'; c.setAttribute('aria-hidden', 'true');
    document.body.prepend(c);
    var ctx = c.getContext('2d'), stars = [], w, h, dpr = Math.min(2, window.devicePixelRatio || 1);
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function resize() {
      w = window.innerWidth; h = window.innerHeight; c.width = w * dpr; c.height = h * dpr; c.style.width = w + 'px'; c.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = Math.round(w * h / 5200); stars = [];
      for (var i = 0; i < n; i++) stars.push({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.2 + 0.2, a: Math.random(), s: 0.004 + Math.random() * 0.012, v: 0.02 + Math.random() * 0.08 });
    }
    function frame() {
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < stars.length; i++) {
        var st = stars[i]; st.a += st.s; st.x -= st.v; if (st.x < 0) st.x = w;
        var al = 0.35 + Math.abs(Math.sin(st.a)) * 0.65;
        ctx.globalAlpha = al; ctx.fillStyle = st.r > 1.1 ? '#cdeaff' : '#ffffff';
        ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!reduce) requestAnimationFrame(frame);
    }
    resize(); window.addEventListener('resize', resize); frame();
  }

  function init(active) {
    starfield();
    renderNav(active);
    renderFooter();
  }

  global.Astra = {
    COLORS: COLORS, ICONS: ICONS, METRICS: METRICS, SYSTEMS: SYSTEMS, TZ: TZ, USERS: USERS, DEMO_PASSWORD: DEMO_PASSWORD,
    esc: esc, fmtTime: fmtTime, fmtDateTime: fmtDateTime, fmtDate: fmtDate, ago: ago, fmtVal: fmtVal, byMetric: byMetric,
    levelOf: levelOf, statusLabel: statusLabel, initials: initials, pill: pill, missionDay: missionDay,
    getSession: getSession, login: login, logout: logout, requireLogin: requireLogin, viewedAstronaut: viewedAstronaut,
    init: init, toast: toast, poll: poll, setConn: setConn
  };
})(window);
