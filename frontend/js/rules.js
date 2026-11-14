/* ASTRA HEALTH - rule tables shared by the UI and the mock data.
 * Ported 1:1 from health/sensor_rules.py (RULES) and health/rules.py (check()).
 * Prototype thresholds for a demo, NOT clinical guidance.
 */
(function (global) {
  'use strict';

  var RED = 'red', YELLOW = 'yellow', GREEN = 'green';

  // metric: [system, [[level, test(value), message, recommendation], ...]]  (first match wins)
  var SENSOR_RULES = {
    heart_rate: ['cardiovascular', [
      [RED, function (v) { return v > 110; }, 'Very high heart rate', 'Stop activity, rest 15 min and re-measure. Contact mission support if it persists.'],
      [YELLOW, function (v) { return v > 100; }, 'High heart rate', 'Rest and monitor.']]],
    hrv: ['cardiovascular', [
      [YELLOW, function (v) { return v < 30; }, 'Low heart rate variability (fatigue/stress)', 'Prioritise rest and recovery today.']]],
    ecg_rhythm: ['cardiovascular', [
      [RED, function (v) { return v === 'irregular'; }, 'Irregular heart rhythm detected', 'Record a full ECG and contact the flight surgeon.']]],
    spo2: ['cardiovascular', [
      [RED, function (v) { return v < 92; }, 'Low blood oxygen', 'Check cabin O2 and breathe supplemental oxygen; contact mission support.'],
      [YELLOW, function (v) { return v < 95; }, 'Blood oxygen slightly low', 'Re-measure in 10 minutes.']]],
    systolic_bp: ['cardiovascular', [
      [RED, function (v) { return v > 160; }, 'Very high blood pressure', 'Rest and contact the flight surgeon.'],
      [YELLOW, function (v) { return v > 140; }, 'Elevated blood pressure', 'Reduce sodium and re-check later.']]],
    body_temperature: ['immune', [
      [RED, function (v) { return v > 38; }, 'Fever', 'Possible infection: isolate if possible and contact mission support.'],
      [YELLOW, function (v) { return v > 37.5; }, 'Raised body temperature', 'Rest, drink water and re-measure in an hour.']]],
    respiration_rate: ['cardiovascular', [
      [RED, function (v) { return v > 28; }, 'Very fast breathing', 'Check SpO2 and cabin CO2 now; contact mission support.'],
      [YELLOW, function (v) { return v > 22; }, 'Fast breathing', 'Rest and check cabin CO2 levels.']]],
    blood_glucose: ['immune', [
      [RED, function (v) { return v > 180 || v < 60; }, 'Blood glucose out of safe range', 'Re-test; eat or adjust meal plan; contact the flight surgeon.'],
      [YELLOW, function (v) { return v > 140; }, 'Blood glucose high', 'Review recent meals and re-test in 2 hours.']]],
    stress_level: ['behavioral', [
      [RED, function (v) { return v > 90; }, 'Very high stress level', 'Stop critical tasks; contact the flight surgeon and psychologist.'],
      [YELLOW, function (v) { return v > 75; }, 'High stress level', 'Take a break; schedule a call with the flight psychologist.']]],
    radiation_dose: ['radiation', [
      [RED, function (v) { return v > 1; }, 'High personal radiation dose', 'Move to the shielded area and contact mission support.'],
      [YELLOW, function (v) { return v > 0.8; }, 'Elevated personal radiation dose', 'Limit time in unshielded modules today.']]],
    sleep_total: ['behavioral', [
      [YELLOW, function (v) { return v < 5; }, 'Short sleep', 'Adjust the schedule to allow a full sleep period.']]],
    urine_calcium: ['musculoskeletal', [
      [RED, function (v) { return v > 300; }, 'High urine calcium (bone loss / kidney stone risk)', 'Increase water intake and resistance exercise; inform the flight surgeon.'],
      [YELLOW, function (v) { return v > 250; }, 'Rising urine calcium', 'Check exercise minutes and hydration.']]],
    exercise_minutes: ['musculoskeletal', [
      [YELLOW, function (v) { return v < 60; }, 'Not enough exercise (bone and muscle loss risk)', 'Complete today\'s exercise session.']]],
    pvt_lapses: ['behavioral', [
      [RED, function (v) { return v >= 6; }, 'Many attention lapses (severe fatigue)', 'Avoid critical tasks (EVA, docking) and rest.'],
      [YELLOW, function (v) { return v >= 3; }, 'Attention lapses (fatigue)', 'Rest before critical tasks.']]],
    co2: ['environment', [
      [RED, function (v) { return v > 5000; }, 'Cabin CO2 dangerously high', 'Check CO2 scrubbers immediately; alert mission control.'],
      [YELLOW, function (v) { return v > 4000; }, 'Cabin CO2 elevated', 'Check ventilation; may cause headaches.']]],
    o2: ['environment', [
      [RED, function (v) { return v < 19.5; }, 'Cabin O2 low', 'Check life support and alert mission control.'],
      [YELLOW, function (v) { return v < 20; }, 'Cabin O2 slightly low', 'Check the oxygen generator.']]],
    cabin_radiation: ['radiation', [
      [RED, function (v) { return v > 1; }, 'Cabin radiation spike (possible solar event)', 'All crew to the shielded area.'],
      [YELLOW, function (v) { return v > 0.8; }, 'Cabin radiation elevated', 'Watch space-weather reports; prepare the shielded area.']]],
    noise: ['environment', [
      [RED, function (v) { return v > 85; }, 'Cabin noise dangerously high', 'Hearing protection on now; find the source (fan or pump fault).'],
      [YELLOW, function (v) { return v > 70; }, 'Cabin noise high', 'Use hearing protection; affects sleep and stress.']]]
  };

  function fmtNum(v) {
    if (typeof v !== 'number') return String(v);
    return (Math.round(v * 100) / 100).toString();
  }

  /** Same logic as evaluate_reading(): returns {system, level, message, recommendation} or null. */
  function evaluateReading(reading) {
    var rule = SENSOR_RULES[reading.metric];
    if (!rule) return null;
    var value = reading.value !== null && reading.value !== undefined ? reading.value : reading.text_value;
    var checks = rule[1];
    for (var i = 0; i < checks.length; i++) {
      var c = checks[i];
      if (c[1](value)) {
        var text = typeof value === 'number' ? (c[2] + ': ' + fmtNum(value) + ' ' + (reading.unit || '')).trim() : c[2];
        return { system: rule[0], level: c[0], message: text, recommendation: c[3] };
      }
    }
    return null;
  }

  /** Status colour for a single value (green if no rule fires). */
  function levelFor(metric, value) {
    var a = evaluateReading({ metric: metric, value: typeof value === 'number' ? value : null, text_value: typeof value === 'string' ? value : '', unit: '' });
    return a ? a.level : GREEN;
  }

  /** Port of health/rules.py check(checkin). baseline = astronaut baselines {heart_rate}. */
  function checkCheckin(c, baseline) {
    var found = [];
    var bhr = (baseline && baseline.heart_rate) || 70;
    if (c.heart_rate > 100) {
      found.push(['cardiovascular', RED, 'High heart rate: ' + c.heart_rate + ' bpm (baseline ' + bhr + ')', 'Rest and re-measure in 15 min; contact mission support if it stays high.']);
    } else if (c.heart_rate > bhr * 1.2) {
      found.push(['cardiovascular', YELLOW, 'Heart rate ' + c.heart_rate + ' bpm is 20%+ above baseline', 'Monitor at the next check-in.']);
    }
    if (c.systolic_bp > 140) found.push(['cardiovascular', YELLOW, 'Elevated blood pressure: ' + c.systolic_bp + '/' + c.diastolic_bp + ' mmHg', 'Reduce sodium and re-check tomorrow.']);
    if (c.temperature > 38) found.push(['immune', RED, 'Fever: ' + c.temperature.toFixed(1) + ' °C', 'Possible infection; isolate if possible and contact mission support.']);
    if (c.sleep_hours < 5) found.push(['behavioral', YELLOW, 'Short sleep: ' + c.sleep_hours.toFixed(1) + ' h', 'Adjust the schedule to allow a full sleep period.']);
    if (c.mood <= 2 || c.stress >= 4) found.push(['behavioral', YELLOW, 'Low mood / high stress (mood ' + c.mood + ', stress ' + c.stress + ')', 'Schedule a private conference with the flight psychologist.']);
    if (c.exercise_minutes < 60) found.push(['musculoskeletal', YELLOW, 'Only ' + c.exercise_minutes + ' min exercise (target ≥ 60)', 'Bone and muscle loss risk in microgravity; complete the exercise session.']);
    if (c.radiation_msv > 1) found.push(['radiation', RED, 'High radiation dose: ' + c.radiation_msv.toFixed(2) + ' mSv today', 'Move to the shielded area and contact mission support.']);
    // Optional lab value: uses the sensor rule table (health/sensor_rules.py urine_calcium)
    if (typeof c.urine_calcium === 'number' && !isNaN(c.urine_calcium)) {
      var uc = evaluateReading({ metric: 'urine_calcium', value: c.urine_calcium, unit: 'mg/day' });
      if (uc) found.push([uc.system, uc.level, uc.message, uc.recommendation]);
    }
    return found.map(function (f) { return { system: f[0], level: f[1], message: f[2], recommendation: f[3] }; });
  }

  global.AstraRules = {
    RED: RED, YELLOW: YELLOW, GREEN: GREEN,
    SENSOR_RULES: SENSOR_RULES,
    evaluateReading: evaluateReading,
    levelFor: levelFor,
    checkCheckin: checkCheckin,
    worst: function (levels) {
      if (levels.indexOf(RED) >= 0) return RED;
      if (levels.indexOf(YELLOW) >= 0) return YELLOW;
      return GREEN;
    }
  };
})(window);
