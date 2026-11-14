/* ASTRA HEALTH - API client.
 * Flip USE_MOCK to false to read from the real Django backend.
 * Every function returns a Promise that resolves to the same JSON the
 * backend returns (documented in API.md).
 */
(function (global) {
  'use strict';

  var USE_MOCK = true;                               // <- the one switch
  var API_BASE = 'http://2.24.53.231:8000/api';      // no trailing slash

  // Allow overriding from the URL for quick tests: ?api=real or ?api=mock
  try {
    var q = new URLSearchParams(location.search).get('api');
    if (q === 'real') USE_MOCK = false;
    if (q === 'mock') USE_MOCK = true;
  } catch (e) { /* ignore */ }

  function qs(params) {
    var parts = [];
    Object.keys(params || {}).forEach(function (k) {
      var v = params[k];
      if (v !== undefined && v !== null && v !== '') parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
    });
    return parts.length ? '?' + parts.join('&') : '';
  }

  var TIMEOUT_MS = 8000;
  function withTimeout(url, init) {
    if (typeof AbortController === 'undefined') return fetch(url, init);
    var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, TIMEOUT_MS);
    init.signal = ctl.signal;
    return fetch(url, init).then(function (r) { clearTimeout(t); return r; }, function (e) {
      clearTimeout(t);
      throw e && e.name === 'AbortError' ? new Error('API timed out after ' + TIMEOUT_MS / 1000 + ' s') : e;
    });
  }

  function get(path, params) {
    return withTimeout(API_BASE + path + qs(params), { headers: { Accept: 'application/json' } }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok) { var e = new Error(body.error || ('HTTP ' + res.status)); e.status = res.status; e.body = body; throw e; }
        return body;
      });
    });
  }
  function post(path, data) {
    return withTimeout(API_BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data || {}) })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          if (!res.ok) { var e = new Error(body.error || ('HTTP ' + res.status)); e.status = res.status; e.body = body; throw e; }
          return body;
        });
      });
  }
  // Run a mock call asynchronously so callers behave the same in both modes.
  function mock(fn) {
    return new Promise(function (resolve, reject) {
      setTimeout(function () { try { resolve(fn()); } catch (e) { reject(e); } }, 40);
    });
  }

  var Api = {
    USE_MOCK: USE_MOCK,
    API_BASE: API_BASE,

    /* ---- read endpoints (exist on the backend today) ---- */
    // GET /api/crew/
    getCrew: function () { return USE_MOCK ? mock(MockAPI.getCrew) : get('/crew/'); },
    // GET /api/crew/<id>/
    getCrewMember: function (id) { return USE_MOCK ? mock(function () { return MockAPI.getCrewMember(id); }) : get('/crew/' + encodeURIComponent(id) + '/'); },
    // GET /api/readings/latest/?astronaut=<id>
    getLatest: function (id) { return USE_MOCK ? mock(function () { return MockAPI.getLatest(id); }) : get('/readings/latest/', { astronaut: id }); },
    // GET /api/cabin/latest/
    getCabin: function () { return USE_MOCK ? mock(MockAPI.getCabin) : get('/cabin/latest/'); },
    // GET /api/readings/history/?astronaut=&metric=&hours=&limit=
    getHistory: function (id, metric, hours, limit) {
      return USE_MOCK ? mock(function () { return MockAPI.getHistory(id, metric, hours, limit); })
        : get('/readings/history/', { astronaut: id, metric: metric, hours: hours, limit: limit });
    },
    // GET /api/alerts/?astronaut=&level=&resolved=&limit=
    getAlerts: function (opts) { return USE_MOCK ? mock(function () { return MockAPI.getAlerts(opts); }) : get('/alerts/', opts); },
    // GET /api/checkins/?astronaut=&limit=
    getCheckins: function (opts) { return USE_MOCK ? mock(function () { return MockAPI.getCheckins(opts); }) : get('/checkins/', opts); },

    /* ---- write endpoints: NOT built on the backend yet (proposed paths) ---- */
    // POST /api/checkins/   body = DailyCheckIn fields + astronaut_id
    submitCheckin: function (data) { return USE_MOCK ? mock(function () { return MockAPI.submitCheckin(data); }) : post('/checkins/', data); },
    // POST /api/pvt/        body = {astronaut_id, mean_rt, lapses, false_starts, trials}
    submitPvt: function (aid, result) {
      return USE_MOCK ? mock(function () { return MockAPI.submitPvt(aid, result); })
        : post('/pvt/', Object.assign({ astronaut_id: aid }, result));
    },
    // POST /api/alerts/<id>/resolve/
    resolveAlert: function (id) { return USE_MOCK ? mock(function () { return MockAPI.resolveAlert(id); }) : post('/alerts/' + id + '/resolve/'); },
    // POST /api/alerts/<id>/acknowledge/
    acknowledgeAlert: function (id) { return USE_MOCK ? mock(function () { return MockAPI.acknowledgeAlert(id); }) : post('/alerts/' + id + '/acknowledge/'); },

    POLL_MS: 3000
  };

  global.Api = Api;
})(window);
