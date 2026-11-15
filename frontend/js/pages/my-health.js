/* My Health (astronaut): live vitals, 3D body map, alerts and history for the logged-in astronaut. */
(function () {
  'use strict';
  var A = Astra;
  var session = A.requireLogin(['astronaut', 'surgeon']);
  if (!session) return;
  if (session.role === 'surgeon') {        // surgeons use the console's detail view
    location.replace('support.html?astronaut=' + A.viewedAstronaut(session));
    return;
  }
  A.init('health');
  AstraHealthView.mount(document.getElementById('view'), { aid: session.astronaut_id, isSurgeon: false });
})();
