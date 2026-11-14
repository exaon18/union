// Interactive 3D body hologram. Organs glow in their status colour, the heart beats at
// the live heart rate and the lungs move at the live respiration rate.
// Adapted from our teammate's UNION Mission Health concept. three.js is vendored (no CDN).
import * as THREE from '../../vendor/three/three.module.min.js';
import { OrbitControls } from '../../vendor/three/addons/OrbitControls.js';
import { MeshSurfaceSampler } from '../../vendor/three/addons/MeshSurfaceSampler.js';
import { fly as flyTween } from './tween.js';

const COLORS = { green: 0x2fd08a, yellow: 0xf5b83d, red: 0xff5468 };
const HOLO = 0x6fd3ff;
export const ORGANS = ['brain', 'heart', 'lungs', 'bones', 'immune'];
const ANCHOR = { brain: [0, 1.655, .02], heart: [.035, 1.265, .05], lungs: [-.085, 1.3, .03], bones: [.105, .47, 0], immune: [-.085, .86, .04] };
const SIDE = { brain: 'r', heart: 'r', lungs: 'l', bones: 'r', immune: 'l' };
const PRIORITY = ['heart', 'brain', 'lungs', 'immune', 'bones'];

const fresnel = (color, opacity, power = 2.2) => new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, opacity: { value: opacity }, power: { value: power } },
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 color; uniform float opacity; uniform float power; varying vec3 vN; varying vec3 vV;
        void main(){ float f = pow(1. - abs(dot(normalize(vN), normalize(vV))), power); gl_FragColor = vec4(color, f * opacity + .025); }`,
});

function glowTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(.3, 'rgba(255,255,255,.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
}

export function createBody(container, { onSelect, labels = {} } = {}) {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', 'Interactive 3D body map. Drag to rotate, select an organ to see its status.');
    container.prepend(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, .1, 50);
    const HOME = new THREE.Vector3(0, .12, 3.95), CENTER = new THREE.Vector3(0, 0, 0);
    camera.position.copy(HOME);
    const controls = new OrbitControls(camera, canvas);
    Object.assign(controls, { enablePan: false, enableZoom: false, enableDamping: true, dampingFactor: .08, autoRotate: !reduced, autoRotateSpeed: 1.1, minPolarAngle: Math.PI / 2 - .45, maxPolarAngle: Math.PI / 2 + .3 });

    const body = new THREE.Group(); body.position.y = -.9; scene.add(body);
    const shellMat = fresnel(HOLO, .75);
    const shell = [];
    const part = (geo, [x, y, z] = [0, 0, 0], scale) => { const m = new THREE.Mesh(geo, shellMat); m.position.set(x, y, z); if (scale) m.scale.set(...scale); body.add(m); shell.push(m); return m; };
    const UP = new THREE.Vector3(0, 1, 0);
    const between = (a, b, r, mat, group = body, list = shell) => {
        const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
        const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 18), mat);
        m.position.copy(A).addScaledVector(d, .5); m.quaternion.setFromUnitVectors(UP, d.normalize());
        group.add(m); list?.push(m); return m;
    };

    // ── body shell ──
    part(new THREE.SphereGeometry(.108, 36, 28), [0, 1.64, 0], [.92, 1.16, 1]);
    part(new THREE.CylinderGeometry(.046, .056, .1, 20), [0, 1.48, 0]);
    const profile = [[0, 1.445], [.07, 1.44], [.168, 1.415], [.2, 1.36], [.196, 1.27], [.178, 1.15], [.156, 1.03], [.162, .94], [.184, .86], [.176, .8], [.11, .76], [0, .75]].map(([r, y]) => new THREE.Vector2(r, y));
    part(new THREE.LatheGeometry(profile, 44), [0, 0, 0], [1, 1, .62]);
    for (const s of [-1, 1]) {
        part(new THREE.SphereGeometry(.058, 20, 16), [s * .215, 1.385, 0]);
        between([s * .228, 1.37, 0], [s * .262, 1.1, 0], .043, shellMat);
        between([s * .264, 1.08, 0], [s * .29, .84, .03], .035, shellMat);
        part(new THREE.SphereGeometry(.043, 16, 12), [s * .296, .765, .04], [.7, 1.25, .5]);
        between([s * .092, .8, 0], [s * .1, .47, 0], .068, shellMat);
        between([s * .1, .44, 0], [s * .1, .1, -.01], .048, shellMat);
        part(new THREE.SphereGeometry(.05, 16, 12), [s * .1, .03, .045], [.85, .55, 1.9]);
    }
    body.updateMatrixWorld(true);

    // point cloud sampled from the shell for the hologram look
    const pts = [];
    const v = new THREE.Vector3();
    for (const m of shell) {
        m.geometry.computeBoundingSphere(); m.updateMatrix();
        const sampler = new MeshSurfaceSampler(m).build();
        const n = Math.round(900 * Math.max(.25, m.geometry.boundingSphere.radius * 3.4 * Math.max(m.scale.x, m.scale.y)));
        for (let i = 0; i < n; i++) { sampler.sample(v); v.applyMatrix4(m.matrix); pts.push(v.x, v.y, v.z); }
    }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const cloudMat = new THREE.PointsMaterial({ color: HOLO, size: .0085, transparent: true, opacity: .42, blending: THREE.AdditiveBlending, depthWrite: false });
    body.add(new THREE.Points(pg, cloudMat));

    // ── organs ──
    const glowMap = glowTexture();
    const organs = {};
    for (const name of ORGANS) {
        const group = new THREE.Group(); body.add(group);
        organs[name] = { group, status: 'green', mats: [], hits: [], halos: [], mat: null };
    }
    const organMat = (name, opacity) => { const m = new THREE.MeshBasicMaterial({ color: COLORS.green, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }); organs[name].mats.push(m); m.userData.base = opacity; return m; };
    const oMesh = (name, geo, mat, [x, y, z], scale, rot) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (scale) m.scale.set(...scale); if (rot) m.rotation.set(...rot); m.userData.organ = name; organs[name].group.add(m); organs[name].hits.push(m); return m; };
    const halo = (name, [x, y, z], size) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, color: COLORS.green, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false })); s.position.set(x, y, z); s.scale.setScalar(size); s.userData.size = size; organs[name].group.add(s); organs[name].halos.push(s); return s; };

    const brainM = organMat('brain', .7);
    oMesh('brain', new THREE.SphereGeometry(.072, 24, 18), brainM, [0, 1.675, -.005], [.95, .8, 1.15]);
    oMesh('brain', new THREE.SphereGeometry(.073, 14, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: .16 }), [0, 1.675, -.005], [.95, .8, 1.15]);
    halo('brain', [0, 1.675, 0], .34);

    const heartM = organMat('heart', .95);
    const heart = new THREE.Group(); heart.position.set(.035, 1.262, .05); organs.heart.group.add(heart);
    const hm = (geo, p, s, r) => { const m = new THREE.Mesh(geo, heartM); m.position.set(...p); if (s) m.scale.set(...s); if (r) m.rotation.set(...r); m.userData.organ = 'heart'; heart.add(m); organs.heart.hits.push(m); };
    hm(new THREE.SphereGeometry(.034, 20, 16), [-.014, .012, 0], [1, 1.1, .95]);
    hm(new THREE.SphereGeometry(.03, 20, 16), [.018, .014, 0], [1, 1.1, .95]);
    hm(new THREE.ConeGeometry(.045, .07, 20), [.002, -.03, 0], [1, 1, .8], [Math.PI, 0, .15]);
    const heartHalo = halo('heart', [.035, 1.262, .06], .3);

    const lungM = organMat('lungs', .5);
    const lungs = [];
    for (const s of [-1, 1]) lungs.push(oMesh('lungs', new THREE.SphereGeometry(.05, 24, 18), lungM, [s * .083 + .004, 1.275, .012], [.98, 2.15, 1.05], [0, 0, s * -.1]));
    halo('lungs', [-.085, 1.28, .03], .26); halo('lungs', [.09, 1.28, .03], .26);

    const boneM = organMat('bones', .62);
    for (let i = 0; i < 15; i++) oMesh('bones', new THREE.BoxGeometry(.03, .026, .03), boneM, [0, .84 + i * .042, -.055 - Math.sin(i / 14 * Math.PI) * .012]);
    for (let i = 0; i < 6; i++) oMesh('bones', new THREE.TorusGeometry(.118 + Math.sin((i + 1) / 7 * Math.PI) * .042, .0075, 6, 40, Math.PI * 1.72), boneM, [0, 1.385 - i * .048, 0], [1, 1, .6], [Math.PI / 2, 0, Math.PI / 2 + Math.PI * .14]);
    oMesh('bones', new THREE.TorusGeometry(.125, .016, 8, 36), boneM, [0, .86, 0], [1, 1, .6], [Math.PI / 2 - .25, 0, 0]);
    for (const s of [-1, 1]) {
        between([s * .215, 1.385, 0], [s * .262, 1.1, 0], .011, boneM, organs.bones.group, organs.bones.hits);
        between([s * .264, 1.08, 0], [s * .29, .85, .03], .009, boneM, organs.bones.group, organs.bones.hits);
        between([s * .092, .84, 0], [s * .1, .47, 0], .015, boneM, organs.bones.group, organs.bones.hits);
        between([s * .1, .44, 0], [s * .1, .1, -.01], .012, boneM, organs.bones.group, organs.bones.hits);
        oMesh('bones', new THREE.SphereGeometry(.022, 12, 10), boneM, [s * .1, .455, .01]);
    }
    organs.bones.hits.forEach(m => { m.userData.organ = 'bones'; });

    const immM = organMat('immune', 1);
    const nodes = [[-.04, 1.47, .02], [.04, 1.47, .02], [-.165, 1.345, .02], [.165, 1.345, .02], [0, 1.37, .06], [-.095, 1.12, .04], [-.085, .86, .05], [.085, .86, .05]];
    nodes.forEach((p, i) => { oMesh('immune', new THREE.SphereGeometry(i === 5 ? .026 : .014, 12, 10), immM, p); halo('immune', p, i === 5 ? .16 : .11); });
    for (const h of organs.immune.hits.slice()) { const proxy = new THREE.Mesh(new THREE.SphereGeometry(.04, 8, 6), new THREE.MeshBasicMaterial({ visible: false })); proxy.position.copy(h.position); proxy.userData.organ = 'immune'; organs.immune.group.add(proxy); organs.immune.hits.push(proxy); }

    // ── platform + scan ring ──
    const ringMat = new THREE.MeshBasicMaterial({ color: HOLO, transparent: true, opacity: .35, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    const rings = [.34, .46, .6].map((r, i) => { const m = new THREE.Mesh(new THREE.RingGeometry(r, r + (i === 1 ? .012 : .004), 96, 1, 0, i === 1 ? Math.PI * 1.6 : Math.PI * 2), ringMat); m.rotation.x = -Math.PI / 2; m.position.y = -.02; body.add(m); return m; });
    const scan = new THREE.Mesh(new THREE.RingGeometry(.3, .315, 64), new THREE.MeshBasicMaterial({ color: HOLO, transparent: true, opacity: .5, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    scan.rotation.x = -Math.PI / 2; body.add(scan);

    // ── HTML pins ──
    const pins = {};
    for (const name of ORGANS) {
        const pin = document.createElement('button');
        pin.type = 'button'; pin.className = 'pin st-green';
        pin.innerHTML = `<span class="dot"></span><span>${labels[name] || name}</span>`;
        pin.addEventListener('click', () => select(name));
        container.append(pin); pins[name] = pin;
    }

    // ── state ──
    let hr = 68, resp = 15, selected = null, alert = 0;
    function setOrgans(map) {
        let worst = 0;
        for (const name of ORGANS) {
            const st = map[name]?.status || map[name] || 'green', o = organs[name], col = COLORS[st] ?? COLORS.green;
            o.status = st;
            o.mats.forEach(m => m.color.setHex(col)); o.halos.forEach(h => h.material.color.setHex(col));
            pins[name].className = `pin st-${st}` + (selected === name ? ' active' : '');
            worst = Math.max(worst, st === 'red' ? 2 : st === 'yellow' ? 1 : 0);
        }
        alert = worst === 2 ? 1 : 0;
    }
    function setRates(r) { if (r.hr) hr = r.hr; if (r.resp) resp = r.resp; }
    function fly(pos, target) {
        flyTween(camera.position, controls.target, pos, target, reduced ? 0 : 1100);
    }
    function select(name, silent) {
        if (!organs[name]) return;
        selected = name; controls.autoRotate = false;
        for (const k of ORGANS) { pins[k].classList.toggle('active', k === name); organs[k].mats.forEach(m => { m.opacity = k === name ? Math.min(1, m.userData.base * 1.25) : m.userData.base * .28; }); }
        const a = new THREE.Vector3(...ANCHOR[name]); a.y -= .9; a.x *= .4;
        const dist = name === 'bones' ? 3.3 : 2.1;
        fly(new THREE.Vector3(Math.sin(.35) * dist, a.y + .08, Math.cos(.35) * dist), name === 'bones' ? new THREE.Vector3(0, -.1, 0) : a);
        if (!silent) onSelect?.(name);
    }
    function reset() {
        selected = null;
        for (const k of ORGANS) { pins[k].classList.remove('active'); organs[k].mats.forEach(m => { m.opacity = m.userData.base; }); }
        fly(HOME, CENTER);
        setTimeout(() => { if (!selected) controls.autoRotate = !reduced; }, 1400);
    }

    // ── picking ──
    const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
    const allHits = ORGANS.flatMap(n => organs[n].hits);
    function pick(e) {
        const r = canvas.getBoundingClientRect();
        mouse.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(mouse, camera);
        const found = new Set(ray.intersectObjects(allHits, false).map(h => h.object.userData.organ));
        return PRIORITY.find(n => found.has(n)) || null;
    }
    let down = null;
    canvas.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; controls.autoRotate = false; });
    canvas.addEventListener('pointerup', e => { if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 6) { const n = pick(e); if (n) select(n); } down = null; });
    canvas.addEventListener('pointermove', e => { if (!down) canvas.style.cursor = pick(e) ? 'pointer' : 'grab'; });

    let visible = true, w = 0, h = 0;
    function size() {
        w = container.clientWidth; h = container.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false); camera.aspect = w / h;
        camera.fov = w / h < .7 ? 34 : 30; camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(size); ro.observe(container); size();
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }); io.observe(container);
    let alive = true;

    let prev = performance.now(), tt = 0; const tmp = new THREE.Vector3(), cHolo = new THREE.Color(HOLO), cRed = new THREE.Color(COLORS.red);
    let beatPhase = 0, breathPhase = 0;
    function frame() {
        if (!alive) return;
        requestAnimationFrame(frame);
        if (!visible || document.hidden) return;
        const nowT = performance.now(), dt = Math.min((nowT - prev) / 1000, .1); prev = nowT; tt += dt;
        beatPhase = (beatPhase + dt * hr / 60) % 1; breathPhase += dt * resp / 60 * Math.PI * 2;
        const beat = Math.exp(-beatPhase * 9) + .55 * Math.exp(-Math.pow((beatPhase - .28) * 9, 2));
        heart.scale.setScalar(1 + .2 * beat); heartHalo.scale.setScalar(.3 * (1 + .6 * beat));
        const br = Math.sin(breathPhase);
        lungs.forEach(l => l.scale.set(.98 * (1 + .09 * br), 2.15 * (1 + .03 * br), 1.05 * (1 + .12 * br)));
        for (const n of ORGANS) {
            const o = organs[n], k = o.status === 'red' ? 1 + .5 * Math.abs(Math.sin(tt * 5)) : o.status === 'yellow' ? 1 + .2 * Math.sin(tt * 2.5) : 1;
            if (n !== 'heart') o.halos.forEach(hl => hl.scale.setScalar(hl.userData.size * k));
        }
        scan.position.y = .9 + Math.sin(tt * .7) * .88; scan.scale.setScalar(.75 + .25 * Math.cos(tt * .7) ** 2);
        rings[1].rotation.z = tt * .4; rings[2].rotation.z = -tt * .15;
        const mix = alert * (.35 + .35 * Math.sin(tt * 5));
        shellMat.uniforms.color.value.copy(cHolo).lerp(cRed, mix); cloudMat.color.copy(shellMat.uniforms.color.value);
        for (const n of ORGANS) {
            tmp.set(...ANCHOR[n]); tmp.y -= .9; tmp.project(camera);
            const x = (tmp.x * .5 + .5) * w, y = (-tmp.y * .5 + .5) * h, p = pins[n], pw = p.offsetWidth;
            const left = SIDE[n] === 'l' ? x - pw - 34 : x + 34;
            p.style.transform = `translate(${Math.round(Math.min(Math.max(left, 2), w - pw - 2))}px, ${Math.round(Math.min(Math.max(y - 14, 2), h - 32))}px)`;
        }
        controls.update();
        renderer.render(scene, camera);
    }
    frame();
    // Free the WebGL context when the view is closed (the Support Console opens and closes detail views).
    function dispose() {
        alive = false; ro.disconnect(); io.disconnect(); controls.dispose();
        scene.traverse(o => { o.geometry?.dispose?.(); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m?.dispose?.()); });
        renderer.dispose(); renderer.forceContextLoss?.();
        Object.values(pins).forEach(p => p.remove()); canvas.remove();
    }
    return { setOrgans, setRates, select, reset, dispose };
}
