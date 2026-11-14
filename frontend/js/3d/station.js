// Interactive 3D station for the public dashboard. Crew are shown as status beacons
// in the module they are working in; clicking one flies the camera to it.
// Adapted from our teammate's UNION Mission Health concept. three.js is vendored (no CDN).
import * as THREE from '../../vendor/three/three.module.min.js';
import { OrbitControls } from '../../vendor/three/addons/OrbitControls.js';
import { fly as flyTween } from './tween.js';

const COLORS = { green: 0x2fd08a, yellow: 0xf5b83d, red: 0xff5468 };
const MODULES = {
    command: { pos: [0, 0, 2.55], label: 'Command' },
    node: { pos: [0, 0, 1.0], label: 'Node' },
    lab: { pos: [0, 0, -.55], label: 'Laboratory' },
    habitat: { pos: [0, 0, -2.35], label: 'Habitat' },
    cupola: { pos: [0, -.78, 1.0], label: 'Cupola' },
};

function solarTexture() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = '#0a1a3a'; g.fillRect(0, 0, 256, 512);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 6; x++) {
        const l = 16 + Math.random() * 10;
        g.fillStyle = `hsl(218 70% ${l}%)`; g.fillRect(x * 42.6 + 3, y * 32 + 3, 37, 26);
    }
    g.strokeStyle = 'rgba(214,170,90,.9)'; g.lineWidth = 3; g.strokeRect(1, 1, 254, 510);
    g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 512); g.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return t;
}
function glowTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
}

export function createStation(container, { onSelect } = {}) {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', 'Interactive 3D model of the station. Drag to rotate.');
    canvas.tabIndex = 0;
    container.prepend(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, .1, 200);
    const HOME = new THREE.Vector3(7.8, 4.6, 9.2);
    camera.position.copy(HOME);
    const controls = new OrbitControls(camera, canvas);
    Object.assign(controls, { enablePan: false, enableZoom: false, enableDamping: true, dampingFactor: .08, autoRotate: !reduced, autoRotateSpeed: .55, minPolarAngle: .5, maxPolarAngle: 2.3 });

    scene.add(new THREE.HemisphereLight(0x9cc4ff, 0x0b1226, .9));
    const sun = new THREE.DirectionalLight(0xfff3e0, 3.2); sun.position.set(-6, 5, 5); scene.add(sun);
    const earthshine = new THREE.PointLight(0x4f9dff, 28, 30); earthshine.position.set(3, -7, 0); scene.add(earthshine);

    const station = new THREE.Group(); scene.add(station);
    const hull = new THREE.MeshStandardMaterial({ color: 0xdfe5ee, metalness: .55, roughness: .38 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a3142, metalness: .7, roughness: .45 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: .9, roughness: .3 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x7fd4ff, emissive: 0x2a89c7, emissiveIntensity: .9, metalness: .2, roughness: .1 });
    const add = (geo, mat, [x, y, z] = [0, 0, 0], rot) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (rot) m.rotation.set(...rot); station.add(m); return m; };
    const HX = [Math.PI / 2, 0, 0];

    // pressurised modules along Z
    const module = (z, len, r) => {
        add(new THREE.CylinderGeometry(r, r, len, 40), hull, [0, 0, z], HX);
        for (const s of [-1, 1]) {
            add(new THREE.CylinderGeometry(r * .72, r, .16, 40), hull, [0, 0, z + s * (len / 2 + .08)], [s * Math.PI / 2 * -1 + Math.PI, 0, 0]);
            add(new THREE.TorusGeometry(r + .012, .022, 8, 48), dark, [0, 0, z + s * len * .3]);
        }
        for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; add(new THREE.CircleGeometry(.07, 20), glass, [Math.cos(a) * (r + .004), Math.sin(a) * (r + .004), z], [0, 0, 0]).lookAt(Math.cos(a) * 9, Math.sin(a) * 9, z); }
    };
    module(2.55, 1.5, .44); module(-.55, 1.5, .46); module(-2.35, 1.55, .5);
    add(new THREE.SphereGeometry(.56, 40, 28), hull, [0, 0, 1.0]);
    add(new THREE.CylinderGeometry(.3, .3, .5, 28), dark, [0, 0, 1.72], HX);
    add(new THREE.CylinderGeometry(.3, .3, .5, 28), dark, [0, 0, .28], HX);
    add(new THREE.CylinderGeometry(.3, .3, .3, 28), dark, [0, 0, -1.44], HX);
    // docked capsule at the bow
    add(new THREE.CylinderGeometry(.14, .4, .7, 32), hull, [0, 0, 3.75], HX);
    add(new THREE.CylinderGeometry(.4, .4, .2, 32), gold, [0, 0, 3.4], HX);
    // cupola under the node
    add(new THREE.CylinderGeometry(.3, .3, .3, 6), dark, [0, -.62, 1.0]);
    add(new THREE.CylinderGeometry(.16, .3, .24, 6), glass, [0, -.86, 1.0]);
    // truss + arrays along X
    add(new THREE.BoxGeometry(9.4, .26, .26), dark, [0, .7, 1.0]);
    const lattice = add(new THREE.BoxGeometry(9.4, .34, .34, 26, 1, 1), new THREE.MeshBasicMaterial({ color: 0x8fa3c4, wireframe: true, transparent: true, opacity: .35 }), [0, .7, 1.0]);
    add(new THREE.CylinderGeometry(.18, .18, .32, 16), dark, [0, .45, 1.0]);
    const solarMat = new THREE.MeshStandardMaterial({ map: solarTexture(), metalness: .6, roughness: .35, side: THREE.DoubleSide, emissive: 0x0b1f4d, emissiveIntensity: .5 });
    const wings = [];
    for (const x of [-4.35, -3.2, 3.2, 4.35]) {
        const wing = new THREE.Group(); wing.position.set(x, .7, 1.0);
        for (const s of [-1, 1]) {
            const p = new THREE.Mesh(new THREE.PlaneGeometry(.86, 2.7), solarMat); p.rotation.x = -Math.PI / 2; p.position.z = s * 1.62; wing.add(p);
            const mast = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, 2.9, 6), gold); mast.rotation.x = Math.PI / 2; mast.position.z = s * 1.55; wing.add(mast);
        }
        wing.rotation.x = .35; station.add(wing); wings.push(wing);
    }
    const radMat = new THREE.MeshStandardMaterial({ color: 0xf2f5fa, metalness: .2, roughness: .6, side: THREE.DoubleSide });
    for (const x of [-1.5, 1.5]) add(new THREE.PlaneGeometry(.7, 1.9), radMat, [x, .7, -.1], [-Math.PI / 2, 0, 0]);
    station.rotation.set(.08, -.5, .06);
    lattice.renderOrder = 1;

    // crew beacons + HTML pins
    const glowMap = glowTexture(), beacons = new Map();
    const slots = {};
    function ensure(c) {
        if (beacons.has(c.id)) return beacons.get(c.id);
        const mod = MODULES[c.location] || MODULES.node, n = (slots[c.location] = (slots[c.location] || 0) + 1) - 1;
        const g = new THREE.Group();
        const up = c.location === 'cupola' ? -1 : 1;
        g.position.set(mod.pos[0] + (n % 2 ? .5 : 0) * (n > 0 ? 1 : 0), mod.pos[1] + up * (c.location === 'cupola' ? .5 : .95), mod.pos[2] + n * .35);
        const mat = new THREE.MeshBasicMaterial({ color: COLORS.green });
        const core = new THREE.Mesh(new THREE.SphereGeometry(.09, 20, 16), mat);
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, color: COLORS.green, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        halo.scale.setScalar(.9);
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(.008, .008, .5, 6), new THREE.MeshBasicMaterial({ color: COLORS.green, transparent: true, opacity: .6 }));
        stem.position.y = -up * .28;
        g.add(core, halo, stem); station.add(g);
        const pin = document.createElement('button');
        pin.className = 'pin st-green'; pin.type = 'button';
        pin.innerHTML = `<span class="dot"></span><span></span><small></small>`;
        pin.addEventListener('click', () => select(c.id));
        container.append(pin);
        const b = { g, mat, halo, stem, pin, status: 'green', data: c };
        beacons.set(c.id, b);
        return b;
    }
    function setCrew(crew) {
        for (const c of crew) {
            const b = ensure(c);
            b.data = c; b.status = c.status;
            const col = COLORS[c.status] ?? COLORS.green;
            b.mat.color.setHex(col); b.halo.material.color.setHex(col); b.stem.material.color.setHex(col);
            b.pin.className = `pin st-${c.status}` + (selected === c.id ? ' active' : '');
            b.pin.children[1].textContent = c.name.split(' ')[0];
            b.pin.children[2].textContent = (MODULES[c.location] || MODULES.node).label;
            b.pin.setAttribute('aria-label', `${c.name}, ${c.status}`);
        }
    }

    let selected = null;
    const tmp = new THREE.Vector3();
    function flyTo(pos, target) {
        controls.autoRotate = false;
        flyTween(camera.position, controls.target, pos, target, reduced ? 0 : 1300);
    }
    function select(id, silent) {
        const b = beacons.get(id); if (!b) return;
        selected = id;
        beacons.forEach((x, k) => x.pin.classList.toggle('active', k === id));
        const target = b.g.getWorldPosition(new THREE.Vector3());
        const dir = camera.position.clone().sub(controls.target).setY(1.6).normalize();
        flyTo(target.clone().add(dir.multiplyScalar(5.2)), target);
        if (!silent) onSelect?.(id);
    }
    function reset() {
        selected = null;
        beacons.forEach(x => x.pin.classList.remove('active'));
        flyTo(HOME, new THREE.Vector3(0, 0, 0));
        setTimeout(() => { if (selected === null) controls.autoRotate = !reduced; }, 1500);
    }
    controls.addEventListener('start', () => { controls.autoRotate = false; });

    let visible = true, w = 0, h = 0;
    function size() {
        w = container.clientWidth; h = container.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.fov = w / h < 1 ? 46 : 34;
        camera.updateProjectionMatrix();
    }
    new ResizeObserver(size).observe(container); size();
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(container);

    const t0 = performance.now();
    function frame() {
        requestAnimationFrame(frame);
        if (!visible || document.hidden) return;
        const tt = (performance.now() - t0) / 1000;
        wings.forEach((wg, i) => { wg.rotation.x = .35 + Math.sin(tt * .15 + i) * .12; });
        beacons.forEach(b => {
            const pulse = b.status === 'red' ? 1 + .45 * Math.abs(Math.sin(tt * 5)) : b.status === 'yellow' ? 1 + .18 * Math.sin(tt * 2.4) : 1 + .08 * Math.sin(tt * 1.6);
            b.halo.scale.setScalar(.9 * pulse * (b.status === 'red' ? 1.5 : 1));
            b.g.getWorldPosition(tmp).project(camera);
            const x = (tmp.x * .5 + .5) * w, y = (-tmp.y * .5 + .5) * h;
            b.pin.style.transform = `translate(${Math.round(Math.min(Math.max(x + 12, 4), w - 150))}px, ${Math.round(Math.min(Math.max(y - 15, 4), h - 34))}px)`;
            b.pin.style.opacity = tmp.z < 1 ? 1 : 0;
        });
        controls.update();
        renderer.render(scene, camera);
    }
    frame();
    return { setCrew, select, reset };
}
