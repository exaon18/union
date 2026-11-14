// Camera fly-to without an animation library: tween position + orbit target together (ease in-out cubic).
const ease = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const running = new WeakMap();

export function fly(position, target, toPos, toTarget, ms) {
    running.get(position)?.();
    if (!ms) { position.copy(toPos); target.copy(toTarget); return; }
    const p0 = position.clone(), t0 = target.clone(), start = performance.now();
    let stop = false;
    running.set(position, () => { stop = true; });
    (function step(now) {
        if (stop) return;
        const k = Math.min(1, (now - start) / ms), e = ease(k);
        position.lerpVectors(p0, toPos, e);
        target.lerpVectors(t0, toTarget, e);
        if (k < 1) requestAnimationFrame(step);
    })(start);
}
