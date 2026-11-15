/* ASTRA Simulation Lab shell (served at /lab/): its own header, its own flight-surgeon login
 * (same POST /api/auth/login/, token kept under "astra_lab_session", separate from the crew app)
 * and the Scenario Control page (lab/scenarios.js). Reuses the crew app's CSS and JS from /app/.
 * Mock mode: /lab/?api=mock (demo password astra2026); /lab/?api=real switches back. */
(function (global) {
  'use strict';
  var A = global.Astra, ready = [], started = false;
  var $ = function (id) { return document.getElementById(id); };

  function session() {
    var s = A.getSession();
    return s && s.role === 'surgeon' ? s : null;
  }

  function renderBar() {
    var s = session();
    var mode = Api.USE_MOCK
      ? '<a class="chip st-yellow" href="?api=real" title="Data generated in this browser. Click to use the real API."><span class="dot"></span>Mock mode</a>'
      : '<a class="chip st-green" href="?api=mock" title="Talking to ' + A.esc(Api.API_BASE) + '. Click for mock mode."><span class="dot"></span>Real API</a>';
    $('lab-bar').innerHTML =
      '<a class="lab-brand" href="/lab/"><span class="lab-logo" aria-hidden="true">' + A.ICONS.gauge + '</span>' +
        '<span><b>ASTRA Simulation Lab</b><small>testing tool, not part of the crew system</small></span></a>' +
      '<div class="lab-bar-right">' + mode +
        '<span class="chip"><span class="mono" data-clock>--:--:--</span>&nbsp;EAT</span>' +
        (s ? '<span class="chip lab-who">' + A.esc(s.name) + '</span><button class="btn btn-sm" type="button" id="lab-logout">Sign out</button>' : '') +
        '<a class="btn btn-sm" href="/app/" title="The astronaut health system">Crew app ↗</a></div>';
    var lo = $('lab-logout');
    if (lo) lo.addEventListener('click', logout);
    var tick = function () {
      var t = new Date().toLocaleTimeString('en-GB', { hour12: false, timeZone: A.TZ });
      document.querySelectorAll('[data-clock]').forEach(function (e) { e.textContent = t; });
    };
    tick(); if (!renderBar._t) renderBar._t = setInterval(tick, 1000);
  }

  function showLogin(msg) {
    $('lab-app').hidden = true; $('lab-login').hidden = false;
    $('lab-mode-note').innerHTML = Api.USE_MOCK
      ? 'Mock mode: data is generated in this browser. Demo login <b>surgeon / astra2026</b>. <a href="?api=real">Use the real API</a>'
      : 'Real API: ' + A.esc(Api.API_BASE) + ' · <a href="?api=mock">Try mock mode</a>';
    if (msg) { $('lab-err').textContent = msg; $('lab-err').hidden = false; }
    setTimeout(function () { $('lab-pass').focus(); }, 50);
    renderBar();
  }

  function showApp() {
    $('lab-login').hidden = true; $('lab-app').hidden = false;
    renderBar();
    if (!started) { started = true; ready.forEach(function (fn) { fn(); }); }
    A.reveal();
  }

  function logout() {
    var done = function () { A.clearSession(); location.reload(); };
    if (Api.USE_MOCK) { done(); return; }
    Api.logout().catch(function () { /* token already gone */ }).then(done);
  }

  $('lab-login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = $('lab-login-btn'); btn.disabled = true; btn.textContent = 'Signing in…'; $('lab-err').hidden = true;
    A.login($('lab-user').value, $('lab-pass').value).then(function (s) {
      if (s.role !== 'surgeon') {          // sign the token out again, then refuse
        return (Api.USE_MOCK ? Promise.resolve() : Api.logout().catch(function () {})).then(function () {
          A.clearSession(); throw new Error('The Simulation Lab is for the flight surgeon account only.');
        });
      }
      showApp();
    }).catch(function (err) {
      $('lab-err').textContent = err.message || 'Sign-in failed.'; $('lab-err').hidden = false;
    }).then(function () { btn.disabled = false; btn.textContent = 'Sign in'; });
  });

  // Expired or revoked token: back to the lab's own login form (not the crew app's login page).
  Api.onUnauthorized = function () {
    if (!A.getSession()) return;
    A.clearSession();
    A.toast('Your lab session expired. Please sign in again.', 'yellow');
    setTimeout(function () { location.reload(); }, 900);
  };

  global.AstraLab = {
    session: session,
    onReady: function (fn) { if (started) fn(); else ready.push(fn); }
  };

  document.addEventListener('DOMContentLoaded', function () {
    var s = session();
    if (!s) {
      if (A.getSession()) A.clearSession();            // a non-surgeon session cannot use the lab
      showLogin();
      return;
    }
    if (!Api.USE_MOCK) Api.me().catch(function (e) { if (e.status === 401) Api.onUnauthorized(e); });
    showApp();
  });
})(window);
