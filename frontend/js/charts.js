/* ASTRA HEALTH - tiny dependency-free canvas charts (works offline). */
(function (global) {
  'use strict';

  var FONT = '12px "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  var GRID = 'rgba(140, 180, 255, 0.10)';
  var AXIS = 'rgba(190, 210, 240, 0.65)';

  function setup(canvas) {
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    var w = Math.max(50, rect.width), h = Math.max(30, rect.height || canvas.height);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h };
  }

  function niceRange(min, max) {
    if (min === max) { min -= 1; max += 1; }
    var pad = (max - min) * 0.12;
    return [min - pad, max + pad];
  }

  function hexA(hex, a) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(h, 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  /** Sparkline: values = [numbers] */
  function sparkline(canvas, values, color) {
    var s = setup(canvas), ctx = s.ctx;
    values = (values || []).filter(function (v) { return typeof v === 'number'; });
    if (values.length < 2) return;
    var mn = Math.min.apply(null, values), mx = Math.max.apply(null, values);
    var r = niceRange(mn, mx);
    var x = function (i) { return 2 + i * (s.w - 4) / (values.length - 1); };
    var y = function (v) { return s.h - 2 - (v - r[0]) / (r[1] - r[0]) * (s.h - 4); };
    var g = ctx.createLinearGradient(0, 0, 0, s.h);
    g.addColorStop(0, hexA(color, 0.35)); g.addColorStop(1, hexA(color, 0));
    ctx.beginPath(); ctx.moveTo(x(0), s.h);
    values.forEach(function (v, i) { ctx.lineTo(x(i), y(v)); });
    ctx.lineTo(x(values.length - 1), s.h); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
    ctx.beginPath();
    values.forEach(function (v, i) { if (i) ctx.lineTo(x(i), y(v)); else ctx.moveTo(x(i), y(v)); });
    ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.stroke();
    var lx = x(values.length - 1), ly = y(values[values.length - 1]);
    ctx.beginPath(); ctx.arc(lx, ly, 2.6, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
  }

  /**
   * Line chart.
   * points: [{t: ms, v: number}]
   * opts: {color, thresholds:[{v, color, label}], yMin, yMax, decimals, unit, xFormat(ms), area:true}
   */
  function line(canvas, points, opts) {
    opts = opts || {};
    var s = setup(canvas), ctx = s.ctx, color = opts.color || '#22d3ee';
    var pts = (points || []).filter(function (p) { return typeof p.v === 'number' && !isNaN(p.v); });
    var padL = 46, padR = 14, padT = 14, padB = 26;
    var W = s.w - padL - padR, H = s.h - padT - padB;
    ctx.font = FONT;
    if (!pts.length) {
      ctx.fillStyle = AXIS; ctx.textAlign = 'center'; ctx.fillText('No data in this range', s.w / 2, s.h / 2); canvas._chart = null; return;
    }
    var vals = pts.map(function (p) { return p.v; });
    (opts.thresholds || []).forEach(function (t) { vals.push(t.v); });
    var r = niceRange(opts.yMin !== undefined ? Math.min(opts.yMin, Math.min.apply(null, vals)) : Math.min.apply(null, vals),
      opts.yMax !== undefined ? Math.max(opts.yMax, Math.max.apply(null, vals)) : Math.max.apply(null, vals));
    if (opts.bars && Math.min.apply(null, vals) >= 0) r[0] = 0;
    var t0 = pts[0].t, t1 = pts[pts.length - 1].t; if (t1 === t0) { t0 -= 1000; t1 += 1000; }
    var inset = opts.bars ? Math.max(6, Math.min(48, W / pts.length * 0.6)) / 2 + 6 : 0;
    var X = function (t) { return padL + inset + (t - t0) / (t1 - t0) * (W - 2 * inset); };
    var Y = function (v) { return padT + H - (v - r[0]) / (r[1] - r[0]) * H; };
    // nice tick step (1, 2, 2.5, 5 x 10^n)
    var raw = (r[1] - r[0]) / 4, mag = Math.pow(10, Math.floor(Math.log10(raw))), step = mag;
    [1, 2, 2.5, 5, 10].some(function (m) { step = m * mag; return step >= raw; });
    var tickDec = Math.max(0, -Math.floor(Math.log10(step) + 1e-9) + (step / mag === 2.5 ? 1 : 0));
    var dec = opts.decimals !== undefined ? Math.max(opts.decimals, tickDec) : tickDec;

    // grid + y labels
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (var v = Math.ceil(r[0] / step) * step; v <= r[1] + 1e-9; v += step) {
      var yy = Y(v);
      ctx.strokeStyle = GRID; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(padL + W, yy); ctx.stroke();
      ctx.fillStyle = AXIS; ctx.fillText(v.toFixed(tickDec), padL - 8, yy);
    }
    // x labels
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    var xf = opts.xFormat || function (t) { return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
    var nx = Math.max(2, Math.min(6, Math.floor(W / 110)));
    for (var j = 0; j <= nx; j++) {
      var tt = t0 + (t1 - t0) * j / nx;
      ctx.fillStyle = AXIS; ctx.fillText(xf(tt), X(tt), padT + H + 8);
    }
    // thresholds
    (opts.thresholds || []).forEach(function (th) {
      var y = Y(th.v);
      ctx.save(); ctx.setLineDash([5, 5]); ctx.strokeStyle = hexA(th.color, 0.7); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + W, y); ctx.stroke(); ctx.restore();
      if (th.label) { ctx.fillStyle = hexA(th.color, 0.9); ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(th.label, padL + 6, y - 3); }
    });
    if (opts.bars) {
      var bw = Math.max(6, Math.min(48, W / pts.length * 0.6));
      pts.forEach(function (p) {
        var c = (opts.pointColor && opts.pointColor(p.v)) || color;
        var g2 = ctx.createLinearGradient(0, Y(p.v), 0, padT + H);
        g2.addColorStop(0, c); g2.addColorStop(1, hexA(c, 0.15));
        ctx.fillStyle = g2;
        var x0 = pts.length === 1 ? padL + W / 2 : X(p.t);
        roundRect(ctx, x0 - bw / 2, Y(p.v), bw, padT + H - Y(p.v), 5); ctx.fill();
      });
    } else {
      if (opts.area !== false) {
        var g = ctx.createLinearGradient(0, padT, 0, padT + H);
        g.addColorStop(0, hexA(color, 0.28)); g.addColorStop(1, hexA(color, 0));
        ctx.beginPath(); ctx.moveTo(X(pts[0].t), padT + H);
        pts.forEach(function (p) { ctx.lineTo(X(p.t), Y(p.v)); });
        ctx.lineTo(X(pts[pts.length - 1].t), padT + H); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
      }
      ctx.beginPath();
      pts.forEach(function (p, k) { if (k) ctx.lineTo(X(p.t), Y(p.v)); else ctx.moveTo(X(p.t), Y(p.v)); });
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.shadowColor = hexA(color, 0.6); ctx.shadowBlur = 8; ctx.stroke(); ctx.shadowBlur = 0;
      if (opts.pointColor) {
        pts.forEach(function (p) {
          var c = opts.pointColor(p.v);
          if (c) { ctx.beginPath(); ctx.arc(X(p.t), Y(p.v), 3, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill(); }
        });
      }
      var last = pts[pts.length - 1];
      ctx.beginPath(); ctx.arc(X(last.t), Y(last.v), 4, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
      ctx.beginPath(); ctx.arc(X(last.t), Y(last.v), 8, 0, Math.PI * 2); ctx.fillStyle = hexA(color, 0.25); ctx.fill();
    }
    canvas._chart = { pts: pts, X: X, Y: Y, padL: padL, padT: padT, W: W, H: H, opts: opts, xf: xf, dec: dec, color: color };
    attachHover(canvas);
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, Math.max(0, h) / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }

  function attachHover(canvas) {
    if (canvas._hover) return;
    canvas._hover = true;
    var tip = document.createElement('div');
    tip.className = 'chart-tip';
    canvas.parentNode.style.position = canvas.parentNode.style.position || 'relative';
    canvas.parentNode.appendChild(tip);
    canvas.addEventListener('mousemove', function (e) {
      var c = canvas._chart; if (!c) return;
      var rect = canvas.getBoundingClientRect(), mx = e.clientX - rect.left;
      var best = null, bd = 1e9;
      c.pts.forEach(function (p) { var d = Math.abs(c.X(p.t) - mx); if (d < bd) { bd = d; best = p; } });
      if (!best) return;
      tip.style.display = 'block';
      tip.innerHTML = '<b>' + best.v.toFixed(c.dec === 0 && best.v % 1 ? 1 : c.dec) + ' ' + (c.opts.unit || '') + '</b><span>' + (c.opts.tipFormat ? c.opts.tipFormat(best.t) : c.xf(best.t)) + '</span>';
      var tx = Math.min(rect.width - 120, Math.max(0, c.X(best.t) - 50));
      tip.style.left = tx + 'px'; tip.style.top = Math.max(0, c.Y(best.v) - 52) + 'px';
    });
    canvas.addEventListener('mouseleave', function () { tip.style.display = 'none'; });
  }

  /** Ring gauge: fraction 0..1 */
  function ring(canvas, frac, color) {
    var s = setup(canvas), ctx = s.ctx, cx = s.w / 2, cy = s.h / 2, rr = Math.min(cx, cy) - 6;
    ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(140,180,255,0.12)'; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(cx, cy, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.001, Math.min(1, frac))); ctx.stroke();
    ctx.shadowBlur = 0;
  }

  global.AstraChart = { line: line, sparkline: sparkline, ring: ring, hexA: hexA };
})(window);
