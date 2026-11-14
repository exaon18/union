/* Login: POST /api/auth/login/ (real) or demo users (mock); stores the session in localStorage. */
(function () {
  'use strict';
  var A = Astra;
  A.init('login');
  var params = new URLSearchParams(location.search);
  if (params.get('denied')) { document.getElementById('deniedMsg').classList.remove('hidden'); document.getElementById('deniedIcon').innerHTML = A.ICONS.alert; }

  var demo = document.getElementById('demoUsers');
  demo.innerHTML = Object.keys(A.USERS).map(function (u) { return '<button type="button" data-u="' + u + '">' + u + '</button>'; }).join('');
  demo.addEventListener('click', function (e) {
    var u = e.target.getAttribute('data-u'); if (!u) return;
    document.getElementById('username').value = u;
    document.getElementById('password').value = A.DEMO_PASSWORD;
    document.getElementById('password').focus();
  });

  document.getElementById('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var u = document.getElementById('username'), p = document.getElementById('password'), err = document.getElementById('loginErr');
    u.classList.remove('invalid'); p.classList.remove('invalid'); err.textContent = '';
    if (!u.value.trim()) { u.classList.add('invalid'); err.textContent = 'Enter your username.'; return; }
    if (!p.value) { p.classList.add('invalid'); err.textContent = 'Enter your password.'; return; }
    var btn = this.querySelector('button[type="submit"]'); if (btn) btn.disabled = true;
    err.textContent = Api.USE_MOCK ? '' : 'Signing in…';
    A.login(u.value, p.value).then(function (s) {
      err.textContent = '';
      var next = params.get('next');
      var home = s.role === 'surgeon' ? 'support.html' : 'my-health.html';
      if (next && /^[\w-]+\.html/.test(next)) {
        var needSurgeon = /^support\.html/.test(next);
        if (needSurgeon === (s.role === 'surgeon') || /^(my-health|history)\.html/.test(next)) home = next;
      }
      A.toast('Welcome, ' + s.name, 'green');
      setTimeout(function () { location.href = home; }, 350);
    }).catch(function (e) {
      if (btn) btn.disabled = false;
      if (e.offline) { err.textContent = 'Cannot reach the server. Check your connection and try again.'; return; }
      p.classList.add('invalid'); err.textContent = e.message || 'Login failed.';
    });
  });
})();
