/* Login: POST /api/auth/login/ (real) or demo users (mock), then a warp transition to the right page. */
(function () {
  'use strict';
  var A = Astra;
  A.init('login');
  var $ = function (id) { return document.getElementById(id); };
  var params = new URLSearchParams(location.search), next = params.get('next');
  if (params.get('denied')) $('denied').hidden = false;

  var dest = function (s) { return s.role === 'surgeon' ? 'support.html' : 'my-health.html'; };
  // Only follow ?next= to a page this role may open (no open redirects).
  var allowed = function (s, n) {
    if (!n || !/^[a-z-]+\.html(\?[\w=&%.-]*)?$/i.test(n)) return false;
    var page = n.split('?')[0];
    var pages = s.role === 'surgeon' ? ['support.html', 'scenarios.html', 'my-health.html', 'history.html', 'index.html', 'science.html'] : ['my-health.html', 'checkin.html', 'pvt.html', 'history.html', 'index.html', 'science.html'];
    return pages.indexOf(page) >= 0;
  };

  var current = A.getSession();
  if (current && !params.get('denied')) { location.replace(dest(current)); return; }

  $('demo-accounts').innerHTML = Object.keys(A.USERS).map(function (u) {
    var x = A.USERS[u];
    return '<button class="demo-acc" type="button" data-user="' + u + '"><b>' + (x.role === 'surgeon' ? 'Flight surgeon' : A.esc(x.name.split(' ')[0])) + '</b><small>' + u + (u === 'sara' ? ' · emergency demo' : '') + '</small></button>';
  }).join('');
  $('demo-accounts').addEventListener('click', function (e) {
    var b = e.target.closest('[data-user]'); if (!b) return;
    $('username').value = b.dataset.user; $('password').value = A.DEMO_PASSWORD;
    submit();
  });

  function go(s) {
    var url = allowed(s, next) ? next : dest(s);
    $('warp-text').textContent = s.role === 'surgeon' ? 'Opening Support Console' : 'Opening My Health';
    if (A.reduced) { location.href = url; return; }
    document.body.classList.add('warping');
    setTimeout(function () { location.href = url; }, 950);
  }

  function submit() {
    var btn = $('login-btn'), err = $('login-error');
    var u = $('username').value.trim(), p = $('password').value;
    err.textContent = '';
    if (!u || !p) { err.textContent = 'Enter your username and password.'; return; }
    btn.disabled = true;
    A.login(u, p).then(go, function (e) {
      err.textContent = e.offline ? 'Cannot reach the server (' + Api.API_BASE + '). Try again, or add ?api=mock for demo data.' : (e.message || 'Could not log in. Try again.');
      btn.disabled = false;
    });
  }
  $('login-form').addEventListener('submit', function (e) { e.preventDefault(); submit(); });
  $('username').focus();
})();
