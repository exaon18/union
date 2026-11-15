/* ASTRA HEALTH - API client.
 * Talks to the real Django backend by default. Every function returns a Promise
 * that resolves to the JSON documented in API.md.
 *
 * Where the API is:
 *   1. ?api_base=http://127.0.0.1:8000/api   (saved in localStorage; ?api_base=reset clears it)
 *   2. localStorage "astra_api_base"
 *   3. same origin "/api" when this page is served by Django at /app/ (or the lab at /lab/)
 *   4. DEFAULT_API_BASE (the VPS)
 * Mock data (no backend): add ?api=mock (saved; ?api=real switches back).
 */
(function (global) {
  'use strict';

  var DEFAULT_API_BASE = 'http://2.24.53.231:8000/api';   // no trailing slash
  var BASE_KEY = 'astra_api_base', MODE_KEY = 'astra_api_mode', SESSION_KEY = global.ASTRA_SESSION_KEY || 'astra_session';   // the Simulation Lab uses its own key

  function store(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  var params; try { params = new URLSearchParams(location.search); } catch (e) { params = { get: function () { return null; } }; }

  // ---- mode: real (default) or mock ----
  var qMode = params.get('api');
  if (qMode === 'mock' || qMode === 'real') store(MODE_KEY, qMode === 'mock' ? 'mock' : null);
  var USE_MOCK = read(MODE_KEY) === 'mock';

  // ---- base URL ----
  var qBase = params.get('api_base');
  if (qBase) {
    if (qBase === 'reset') store(BASE_KEY, null);
    else store(BASE_KEY, qBase.replace(/\/+$/, ''));
  }
  var servedByDjango = /^https?:$/.test(location.protocol) && /^\/(app|lab)(\/|$)/.test(location.pathname);
  var API_BASE = read(BASE_KEY) || (servedByDjango ? location.origin + '/api' : DEFAULT_API_BASE);

  function qs(p) {
    var parts = [];
    Object.keys(p || {}).forEach(function (k) {
      var v = p[k];
      if (v !== undefined && v !== null && v !== '') parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
    });
    return parts.length ? '?' + parts.join('&') : '';
  }

  function token() {
    try { var s = JSON.parse(read(SESSION_KEY)); return s && s.token; } catch (e) { return null; }
  }

  var TIMEOUT_MS = 10000;
  function request(method, path, params, data) {
    var url = API_BASE + path + (method === 'GET' ? qs(params) : '');
    var headers = { Accept: 'application/json' };
    var init = { method: method, headers: headers };
    if (method !== 'GET') { headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(data || {}); }
    var t = token(); if (t && method !== 'GET') headers.Authorization = 'Token ' + t;
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, timer;
    if (ctl) { init.signal = ctl.signal; timer = setTimeout(function () { ctl.abort(); }, TIMEOUT_MS); }
    return fetch(url, init).then(function (res) {
      clearTimeout(timer);
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok) {
          var e = new Error(body.error || ('HTTP ' + res.status)); e.status = res.status; e.body = body;
          if (res.status === 401 && t) Api.onUnauthorized(e);
          throw e;
        }
        return body;
      });
    }, function (err) {
      clearTimeout(timer);
      var e = new Error(err && err.name === 'AbortError'
        ? 'server did not answer within ' + TIMEOUT_MS / 1000 + ' s'
        : 'cannot reach the server (' + API_BASE + ')');
      e.status = 0; e.offline = true;
      throw e;
    });
  }
  function get(path, params) { return request('GET', path, params); }
  function post(path, data) { return request('POST', path, null, data); }
  function postAudio(path, data) {
    var headers = { Accept: 'audio/wav, application/json', 'Content-Type': 'application/json' };
    var t = token(); if (t) headers.Authorization = 'Token ' + t;
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, timer;
    var init = { method: 'POST', headers: headers, body: JSON.stringify(data || {}) };
    if (ctl) { init.signal = ctl.signal; timer = setTimeout(function () { ctl.abort(); }, 45000); }
    return fetch(API_BASE + path, init).then(function (res) {
      clearTimeout(timer);
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          var e = new Error(body.error || ('HTTP ' + res.status)); e.status = res.status; e.body = body;
          if (res.status === 401 && t) Api.onUnauthorized(e);
          throw e;
        });
      }
      return res.blob();
    }, function (err) {
      clearTimeout(timer);
      var e = new Error(err && err.name === 'AbortError'
        ? 'voice service did not answer within 45 s'
        : 'cannot reach the voice service (' + API_BASE + ')');
      e.status = 0; e.offline = true;
      throw e;
    });
  }

  // Run a mock call asynchronously so callers behave the same in both modes.
  function mock(fn) {
    if (global.MockAPI && MockAPI._start) MockAPI._start();
    return new Promise(function (resolve, reject) {
      setTimeout(function () { try { resolve(fn()); } catch (e) { reject(e); } }, 40);
    });
  }

  var Api = {
    USE_MOCK: USE_MOCK,
    API_BASE: API_BASE,
    POLL_MS: 3000,
    /** Called when the server rejects our token (expired / logged out elsewhere). Set by common.js. */
    onUnauthorized: function () {},

    /* ---- auth (token) ---- */
    // POST /api/auth/login/ -> {token, user:{username, name, role, astronaut_id, title}}
    login: function (username, password) { return post('/auth/login/', { username: username, password: password }); },
    // GET /api/auth/me/  (needs the token, so it is sent as an authenticated request)
    me: function () {
      var t = token();
      return fetch(API_BASE + '/auth/me/', { headers: { Accept: 'application/json', Authorization: 'Token ' + t } })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { if (!r.ok) { var e = new Error(b.error || 'HTTP ' + r.status); e.status = r.status; throw e; } return b; }); });
    },
    // POST /api/auth/logout/
    logout: function () { return post('/auth/logout/'); },

    /* ---- read endpoints (public) ---- */
    getCrew: function () { return USE_MOCK ? mock(MockAPI.getCrew) : get('/crew/'); },
    getCrewMember: function (id) { return USE_MOCK ? mock(function () { return MockAPI.getCrewMember(id); }) : get('/crew/' + encodeURIComponent(id) + '/'); },
    getLatest: function (id) { return USE_MOCK ? mock(function () { return MockAPI.getLatest(id); }) : get('/readings/latest/', { astronaut: id }); },
    getCabin: function () { return USE_MOCK ? mock(MockAPI.getCabin) : get('/cabin/latest/'); },
    getHistory: function (id, metric, hours, limit) {
      return USE_MOCK ? mock(function () { return MockAPI.getHistory(id, metric, hours, limit); })
        : get('/readings/history/', { astronaut: id, metric: metric, hours: hours, limit: limit });
    },
    getAlerts: function (opts) { return USE_MOCK ? mock(function () { return MockAPI.getAlerts(opts); }) : get('/alerts/', opts); },
    getCheckins: function (opts) { return USE_MOCK ? mock(function () { return MockAPI.getCheckins(opts); }) : get('/checkins/', opts); },
    getPvt: function (opts) { return USE_MOCK ? mock(function () { return MockAPI.getPvt(opts); }) : get('/pvt/', opts); },
    // POST /api/voice-alert/ {astronaut_id} -> WAV audio (requires a login token)
    voiceAlert: function (astronautId) { return postAudio('/voice-alert/', { astronaut_id: astronautId }); },

    /* ---- write endpoints (Authorization: Token <key>) ---- */
    // POST /api/checkins/ -> {checkin, alerts, status}
    submitCheckin: function (data) { return USE_MOCK ? mock(function () { return MockAPI.submitCheckin(data); }) : post('/checkins/', data); },
    // POST /api/pvt/ {astronaut_id, mean_rt_ms, fastest_ms, lapses, false_starts, trials} -> {pvt, alerts, status}
    submitPvt: function (aid, result) {
      return USE_MOCK ? mock(function () { return MockAPI.submitPvt(aid, result); })
        : post('/pvt/', Object.assign({ astronaut_id: aid }, result));
    },
    // POST /api/alerts/<id>/acknowledge/ and /resolve/ (flight surgeon) -> {alert}
    resolveAlert: function (id) { return USE_MOCK ? mock(function () { return MockAPI.resolveAlert(id); }) : post('/alerts/' + id + '/resolve/'); },
    acknowledgeAlert: function (id) { return USE_MOCK ? mock(function () { return MockAPI.acknowledgeAlert(id); }) : post('/alerts/' + id + '/acknowledge/'); },

    /* ---- simulation lab (used by the Simulation Lab at /lab/, not by the crew app) ---- */
    // GET /api/sim/scenario/ (public) -> {preset, label, config, resolved, expected_status, version, presets, ...}
    getScenario: function () { return USE_MOCK ? mock(MockAPI.getScenario) : get('/sim/scenario/'); },
    // POST /api/sim/scenario/ (surgeon) {preset, target, system, custom, cabin, reset, apply_now} -> {scenario, reset?, batch?}
    setScenario: function (data) { return USE_MOCK ? mock(function () { return MockAPI.setScenario(data); }) : post('/sim/scenario/', data); },
    // POST /api/sim/reset/ (surgeon) -> {resolved: n}
    resetSim: function () { return USE_MOCK ? mock(MockAPI.resetSim) : post('/sim/reset/'); },
    // POST /api/sim/tick/ (surgeon) -> {saved, alerts, errors}
    simTick: function () { return USE_MOCK ? mock(MockAPI.simTick) : post('/sim/tick/'); },

    /* ---- NASA data ---- */
    // GET /api/space-weather/ (public) -> {source, fetched_at, state, latest, replay, ...} (real NASA DONKI events)
    getSpaceWeather: function () { return USE_MOCK ? mock(MockAPI.getSpaceWeather) : get('/space-weather/'); }
  };

  global.Api = Api;
})(window);
