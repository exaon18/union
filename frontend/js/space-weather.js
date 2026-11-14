/* ASTRA HEALTH - "Space weather (NASA DONKI)" panel, shared by the Mission dashboard, the Support
 * Console and Scenario Control. Data: GET /api/space-weather/ (real DONKI events stored by
 * `manage.py fetch_donki`, or the bundled cached snapshot), or js/donki-snapshot.js in mock mode.
 * Same mapping as health/donki.py: SEP / X-class flare = critical (storm shelter), M-class = caution. */
(function (global) {
  'use strict';
  var WIN_H = { SEP: 48, X: 24, M: 6, CME: 24 };
  var DONKI_URL = 'https://kauai.ccmc.gsfc.nasa.gov/DONKI/';

  function state(events, now) {
    now = now || Date.now();
    var best = null;
    events.forEach(function (e) {
      var t = Date.parse(e.time); if (!t || t > now + 300000 || (e.level !== 'critical' && e.level !== 'caution')) return;
      var key = e.type === 'SEP' ? 'SEP' : e.type === 'CME' ? 'CME' : String(e['class'] || '?').charAt(0).toUpperCase();
      if (!WIN_H[key] || now - t > WIN_H[key] * 3600000) return;
      var rank = e.level === 'critical' ? 2 : 1;
      if (!best || rank > best[0] || (rank === best[0] && t > best[1])) best = [rank, t, e];
    });
    if (best) return { level: best[2].level, event: best[2], reason: 'NASA DONKI ' + best[2].type + ' ' + best[2].id + ': ' + best[2].label + '. ' + (best[2].impact || '') };
    return { level: 'quiet', event: null, reason: 'No solar particle event, X-class or recent M-class flare in DONKI right now.' };
  }

  /** Same JSON as GET /api/space-weather/, built from the bundled snapshot (mock mode). */
  function fromSnapshot() {
    var snap = global.ASTRA_DONKI || { events: [] }, ev = snap.events.slice();
    var notable = ev.filter(function (e) { return e.level !== 'info' || e.type === 'GST'; });
    var seen = {}, replay = [];
    ev.forEach(function (e) {
      if (!(e.type === 'SEP' || (e.type === 'FLR' && e.level === 'critical'))) return;
      var k = e.type + (e.type === 'SEP' ? e.time.slice(0, 10) : e.id); if (seen[k]) return; seen[k] = 1; replay.push(e);
    });
    var mf = ev.filter(function (e) { return e.type === 'FLR' && e.level === 'caution'; }).slice(0, 10);
    var counts = {}; ['FLR', 'SEP', 'CME', 'GST'].forEach(function (t) { counts[t] = ev.filter(function (e) { return e.type === t; }).length; });
    return { source: 'snapshot', fetched_at: snap.fetched_at, snapshot_fetched_at: snap.fetched_at, provider: 'NASA DONKI', provider_url: DONKI_URL,
      state: state(ev), latest: notable.slice(0, 12).map(function (e) { return Object.assign({ source: 'snapshot' }, e); }),
      replay: replay.slice(0, 30).concat(mf).map(function (e) { return Object.assign({ source: 'snapshot' }, e); }), counts: counts,
      note: 'DONKI gives event times and classes, not the crew\'s dose; dose values are simulated.' };
  }

  var COL = { critical: 'red', caution: 'yellow', quiet: 'green', info: 'none' };
  function utc(t) { return t ? t.replace('T', ' ').replace('Z', '') + ' UTC' : ''; }
  function eat(t) { var A = global.Astra; return A && t ? A.fmtDateTime(new Date(Date.parse(t)).toISOString()) + ' EAT' : utc(t); }

  /** Render the panel body into `el`. opts.compact: fewer rows. */
  function render(el, d, opts) {
    var A = global.Astra; opts = opts || {};
    var st = d.state || { level: 'quiet' }, lvl = COL[st.level] || 'green';
    var srcTag = d.source === 'live'
      ? '<span class="tag ack">live · fetched ' + A.esc(A.ago(d.fetched_at)) + '</span>'
      : '<span class="tag">cached snapshot · ' + A.esc((d.fetched_at || '').slice(0, 10)) + '</span>';
    var head = '<div class="sw-state st-' + lvl + '"><span class="b-ico">' + A.ST_ICON[lvl === 'none' ? 'green' : lvl] + '</span><div>' +
      '<b>' + (st.level === 'critical' ? 'Radiation storm: crew to the storm shelter' : st.level === 'caution' ? 'Solar activity: caution' : 'Live DONKI: quiet, no crew action') + '</b>' +
      '<small>' + A.esc(st.reason || '') + '</small>' +
      (st.event && st.event.link ? '<a href="' + A.esc(st.event.link) + '" target="_blank" rel="noopener">DONKI ' + A.esc(st.event.id) + ' ↗</a>' : '') + '</div></div>';
    var rp = d.active_replay;
    if (rp) head += '<div class="sw-state st-' + (rp.level === 'critical' ? 'red' : 'yellow') + '"><span class="b-ico">' + A.ICONS.radiation + '</span><div>' +
      '<b>Simulation replaying: ' + A.esc(rp.label) + '</b><small>Scenario Control is replaying this real event (' + A.esc(utc(rp.time)) + '). Crew radiation follows it' +
      (rp.level === 'critical' ? ': storm shelter.' : '.') + '</small>' + (rp.link ? '<a href="' + A.esc(rp.link) + '" target="_blank" rel="noopener">DONKI ' + A.esc(rp.id) + ' ↗</a>' : '') + '</div></div>';
    var rows = (d.latest || []).slice(0, opts.compact ? 5 : 8).map(function (e) {
      return '<li class="sw-ev st-' + (COL[e.level] || 'none') + '"><span class="sw-type">' + A.esc(e.type) + '</span><div><b>' + A.esc(e.label) + '</b>' +
        '<small>' + A.esc(eat(e.time)) + ' · <a href="' + A.esc(e.link) + '" target="_blank" rel="noopener" title="' + A.esc(e.id) + '">' + A.esc(e.id) + ' ↗</a>' +
        (e.source === 'snapshot' && d.source === 'live' ? ' · cached' : '') + '</small></div>' +
        '<span class="sw-lvl">' + (e.level === 'critical' ? 'shelter' : e.level === 'caution' ? 'caution' : 'info') + '</span></li>';
    }).join('');
    el.innerHTML = head + '<ul class="sw-list">' + (rows || '<li class="empty">No events.</li>') + '</ul>' +
      '<p class="sw-foot">' + srcTag + ' Real events from <a href="' + DONKI_URL + '" target="_blank" rel="noopener">NASA DONKI</a>. ' +
      'SEP or X-class flare = storm shelter, M-class = caution. DONKI gives timing and class, not our crew\'s dose: dose values are simulated. ' +
      '<a href="science.html#donki">How this works</a></p>';
  }

  /** Mount: fetch now and every `every` ms. Returns a stop function. */
  function mount(el, opts) {
    opts = opts || {};
    var stop = false;
    function load() {
      if (stop) return;
      Api.getSpaceWeather().then(function (d) { if (!stop) render(el, d, opts); })
        .catch(function (e) { el.innerHTML = '<p class="empty">Space weather unavailable (' + global.Astra.esc(e.message) + ').</p>'; });
    }
    load();
    var t = setInterval(load, opts.every || 60000);
    return function () { stop = true; clearInterval(t); };
  }

  global.AstraSpaceWeather = { state: state, fromSnapshot: fromSnapshot, render: render, mount: mount, DONKI_URL: DONKI_URL };
})(window);
