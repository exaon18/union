// Full-page backdrop: Earth seen from orbit (day / night-lights imagery) and a star field.
// Adapted from our teammate's UNION Mission Health concept. three.js is vendored (no CDN).
import * as THREE from '../../vendor/three/three.module.min.js';

const IMG = new URL('../../img/', import.meta.url).href;

export function startSpace(canvas) {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x04060c);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, .1, 400);
    camera.position.set(0, 0, 5);

    // stars
    const N = 2600, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), c = new THREE.Color();
    for (let i = 0; i < N; i++) {
        const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = 120, s = Math.sqrt(1 - u * u);
        pos.set([r * s * Math.cos(a), r * u, r * s * Math.sin(a)], i * 3);
        c.setHSL(.55 + Math.random() * .12, .5 * Math.random(), .45 + Math.random() * .55);
        const dim = Math.pow(Math.random(), 2.2) * .9 + .1;
        col.set([c.r * dim, c.g * dim, c.b * dim], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.7, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false }));
    scene.add(stars);

    // earth
    const loader = new THREE.TextureLoader();
    const tex = (f, srgb = true) => { const t = loader.load(IMG + f, () => draw()); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
    const sun = new THREE.Vector3(-.75, .5, .55).normalize();
    const earthMat = new THREE.ShaderMaterial({
        uniforms: { dayMap: { value: tex('earth-day.jpg') }, nightMap: { value: tex('earth-night.jpg') }, waterMap: { value: tex('earth-water.jpg', false) }, sunDir: { value: sun } },
        vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vP;
            void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.); vP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: `uniform sampler2D dayMap, nightMap, waterMap; uniform vec3 sunDir; varying vec2 vUv; varying vec3 vN; varying vec3 vP;
            void main(){
                vec3 n = normalize(vN), v = normalize(cameraPosition - vP);
                float d = dot(n, sunDir), lit = smoothstep(-.18, .3, d);
                vec3 day = texture2D(dayMap, vUv).rgb * (.25 + .95 * max(d, 0.));
                vec3 night = texture2D(nightMap, vUv).rgb * vec3(1.25, 1.05, .8) * 1.6;
                float water = texture2D(waterMap, vUv).r;
                float spec = pow(max(dot(reflect(-sunDir, n), v), 0.), 26.) * water * .55;
                vec3 col = mix(night, day, lit) + spec * vec3(1., .95, .85);
                float rim = pow(1. - max(dot(n, v), 0.), 3.2);
                col += vec3(.25, .55, 1.) * rim * (.25 + .9 * lit);
                col = mix(col, vec3(1., .5, .25) * .5, smoothstep(.18, 0., abs(d)) * rim * .6);
                gl_FragColor = vec4(col, 1.);
                #include <colorspace_fragment>
            }`,
    });
    const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), earthMat);
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.045, 64, 48), new THREE.ShaderMaterial({
        uniforms: { sunDir: { value: sun } }, side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
        vertexShader: `varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.); vP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: `uniform vec3 sunDir; varying vec3 vN; varying vec3 vP;
            void main(){ vec3 v = normalize(cameraPosition - vP); float f = pow(max(dot(-normalize(vN), v), 0.), 2.4);
                float lit = smoothstep(-.5, .5, dot(normalize(vN), sunDir));
                gl_FragColor = vec4(vec3(.3, .6, 1.) * f * (.2 + lit) * 1.5, f); }`,
    }));
    const globe = new THREE.Group();
    globe.add(earth, atmo);
    globe.rotation.z = .41;
    earth.rotation.y = 3.4;
    scene.add(globe);

    function layout() {
        const w = innerWidth, h = innerHeight, portrait = w / h < .9;
        renderer.setSize(w, h, false);
        camera.aspect = w / h; camera.updateProjectionMatrix();
        const s = portrait ? 2.4 : 3.3;
        globe.scale.setScalar(s);
        globe.position.set(portrait ? .9 : 2.5, portrait ? -3.4 : -3.25, -2);
        draw();
    }
    let px = 0, py = 0, tx = 0, ty = 0;
    function draw() { renderer.render(scene, camera); }
    let last = 0;
    function frame(now) {
        requestAnimationFrame(frame);
        if (document.hidden || now - last < 33) return;
        const dt = Math.min((now - last) / 1000, .1); last = now;
        earth.rotation.y += dt * .012;
        stars.rotation.y += dt * .0025;
        px += (tx - px) * .04; py += (ty - py) * .04;
        camera.position.x = px * .12; camera.position.y = -py * .08;
        camera.lookAt(0, 0, -2);
        draw();
    }
    addEventListener('resize', layout);
    addEventListener('pointermove', e => { tx = e.clientX / innerWidth - .5; ty = e.clientY / innerHeight - .5; }, { passive: true });
    layout();
    if (!reduced) requestAnimationFrame(frame);
}
