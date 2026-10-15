/* ---------- CURSOR DOT ---------- */
const dot = document.getElementById('cursor-dot');
document.addEventListener('mousemove', e => {
  dot.style.left = e.clientX + 'px';
  dot.style.top  = e.clientY + 'px';
});

/* ---------- NAV SCROLL ---------- */
const nav = document.querySelector('nav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 40);
});

/* ---------- HAMBURGER MENU ---------- */
const hamburger = document.getElementById('nav-hamburger');
const navLinks  = document.getElementById('nav-links');
if (hamburger && navLinks) {
  hamburger.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('open');
    hamburger.classList.toggle('open', isOpen);
    hamburger.setAttribute('aria-expanded', isOpen);
  });
  // Close menu when a link is clicked
  navLinks.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      navLinks.classList.remove('open');
      hamburger.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
    });
  });
}

/* ---------- SCROLL FADE ---------- */
const observer = new IntersectionObserver(
  entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); }),
  { threshold: 0.1 }
);
document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));

/* ---------- BACKGROUND CANVAS ---------- */
const canvas = document.getElementById('bg-canvas');
const ctx = canvas.getContext('2d');

function resize() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);

// Mouse position (normalised 0–1), starts at centre
let mouseX = 0.5, mouseY = 0.5;
// Smoothed position the cursor-glow actually renders at
let glowX = 0.5, glowY = 0.5;

document.addEventListener('mousemove', e => {
  mouseX = e.clientX / window.innerWidth;
  mouseY = e.clientY / window.innerHeight;
});

// Autonomous drifting orbs
const orbs = [
  { x: 0.15, y: 0.2,  r: 380, rgba: [255, 130, 169], a: 0.07, dx:  0.00014, dy:  0.00009 },
  { x: 0.8,  y: 0.3,  r: 300, rgba: [127, 149, 209], a: 0.06, dx: -0.00011, dy:  0.00008 },
  { x: 0.5,  y: 0.8,  r: 340, rgba: [0, 0, 0],  a: 0.05, dx:  0.00009, dy: -0.00013 },
  { x: 0.9,  y: 0.85, r: 220, rgba: [255, 130, 169], a: 0.04, dx: -0.00010, dy: -0.00008 },
];

// Small particles
const PARTICLE_COUNT = 0; // replaced by the 3D graph below
const particles = Array.from({ length: PARTICLE_COUNT }, () => ({
  x: Math.random(), y: Math.random(),
  r: Math.random() * 1.4 + 0.3,
  alpha: Math.random() * 0.45 + 0.1,
  dx: (Math.random() - 0.5) * 0.00007,
  dy: (Math.random() - 0.5) * 0.00007,
  pulse: Math.random() * Math.PI * 2,
  pulseSpeed: Math.random() * 0.014 + 0.004,
  color: ['#FF82A9', '#7F95D1', '#FFEBE7'][Math.floor(Math.random() * 3)],
}));

const CONNECTION_DIST = 0.11;

function drawOrb(cx, cy, r, [R, G, B], alpha) {
  const W = canvas.width, H = canvas.height;
  const grd = ctx.createRadialGradient(cx*W, cy*H, 0, cx*W, cy*H, r);
  grd.addColorStop(0,   `rgba(${R},${G},${B},${alpha})`);
  grd.addColorStop(0.4, `rgba(${R},${G},${B},${alpha * 0.5})`);
  grd.addColorStop(1,   `rgba(${R},${G},${B},0)`);
  ctx.beginPath();
  ctx.arc(cx*W, cy*H, r, 0, Math.PI * 2);
  ctx.fillStyle = grd;
  ctx.fill();
}

function draw() {
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // Smoothly interpolate glow toward real mouse position
  glowX += (mouseX - glowX) * 0.04;
  glowY += (mouseY - glowY) * 0.04;

  // Cursor-following glow
  drawOrb(glowX, glowY, 200, [255, 130, 169], 0.10);
  drawOrb(glowX, glowY, 90,  [127, 149, 209], 0.07);

  // Autonomous ambient orbs
  orbs.forEach(o => {
    o.x += o.dx; o.y += o.dy;
    if (o.x < -0.1 || o.x > 1.1) o.dx *= -1;
    if (o.y < -0.1 || o.y > 1.1) o.dy *= -1;
    drawOrb(o.x, o.y, o.r, o.rgba, o.a);
  });

  // Connection lines between nearby particles
  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const a = particles[i], b = particles[j];
      const ddx = a.x - b.x, ddy = a.y - b.y;
      const dist = Math.sqrt(ddx*ddx + ddy*ddy);
      if (dist < CONNECTION_DIST) {
        const opacity = (1 - dist / CONNECTION_DIST) * 0.10;
        ctx.beginPath();
        ctx.moveTo(a.x*W, a.y*H);
        ctx.lineTo(b.x*W, b.y*H);
        ctx.strokeStyle = `rgba(255, 130, 169,${opacity})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }
  }

  // Particles
  particles.forEach(p => {
    p.x += p.dx; p.y += p.dy;
    if (p.x < 0) p.x = 1; if (p.x > 1) p.x = 0;
    if (p.y < 0) p.y = 1; if (p.y > 1) p.y = 0;
    p.pulse += p.pulseSpeed;
    const pulse = Math.sin(p.pulse) * 0.3 + 0.7;
    ctx.beginPath();
    ctx.arc(p.x*W, p.y*H, p.r * pulse, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.globalAlpha = p.alpha * pulse;
    ctx.fill();
    ctx.globalAlpha = 1;
  });

  requestAnimationFrame(draw);
}
draw();

/* ---------- 3D KNOWLEDGE GRAPH (background) ----------
   A large, slowly turning graph behind the whole page. Nodes sit on a
   sphere, edges join near neighbours, and everything is drawn with a soft
   glow. It leans toward the mouse and turns a little as you scroll.
   Perspective projection + depth sorting, plain canvas, no library. */
(function bgGraph() {
  const cv = document.getElementById('bg-graph');
  if (!cv) return;
  const c = cv.getContext('2d');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COLORS = ['#FF82A9', '#FFEBE7', '#7F95D1', '#FF82A9', '#7F95D1'];
  const GLOW = { '#FF82A9': 'rgba(255,130,169,0.9)', '#FFEBE7': 'rgba(0,0,0,0.7)', '#7F95D1': 'rgba(127,149,209,0.95)' };
  const N = 70;

  const nodes = Array.from({ length: N }, (_, i) => {
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = i * Math.PI * (3 - Math.sqrt(5));
    const k = 0.8 + Math.random() * 0.25;
    return { x: Math.cos(th) * r * k, y: y * k, z: Math.sin(th) * r * k,
             col: COLORS[i % COLORS.length], big: Math.random() < 0.15,
             phase: Math.random() * Math.PI * 2 };
  });
  const edges = [];
  nodes.forEach((a, i) => {
    nodes.map((b, j) => [j, (a.x-b.x)**2 + (a.y-b.y)**2 + (a.z-b.z)**2])
      .filter(([j]) => j !== i).sort((p, q) => p[1] - q[1]).slice(0, 3)
      .forEach(([j]) => { if (i < j) edges.push([i, j]); });
  });

  let W = 0, H = 0, dpr = 1;
  function size() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  size();
  window.addEventListener('resize', size);

  let tiltX = 0, tiltY = 0, tx = 0, ty = 0, angle = 0.6, scrollSpin = 0;
  document.addEventListener('mousemove', e => {
    tx = (e.clientY / window.innerHeight - 0.5) * 0.5;
    ty = (e.clientX / window.innerWidth - 0.5) * 0.7;
  });

  function project(p) {
    const ay = angle + tiltY + scrollSpin, ax = 0.35 + tiltX;
    let x = p.x * Math.cos(ay) - p.z * Math.sin(ay);
    let z = p.x * Math.sin(ay) + p.z * Math.cos(ay);
    let y = p.y * Math.cos(ax) - z * Math.sin(ax);
    z = p.y * Math.sin(ax) + z * Math.cos(ax);
    const R = Math.max(Math.min(W, H) * 0.36, 220), f = 2.6 / (2.6 + z);
    return { sx: W / 2 + x * R * f, sy: H / 2 + y * R * f, z, f };
  }

  let t = 0;
  function frame() {
    c.clearRect(0, 0, W, H);
    tiltX += (tx - tiltX) * 0.03;
    tiltY += (ty - tiltY) * 0.03;
    scrollSpin += (window.scrollY * 0.0012 - scrollSpin) * 0.06;
    if (!reduce) { angle += 0.0018; t += 0.02; }

    const P = nodes.map(project);
    c.shadowBlur = 0;
    edges.forEach(([i, j]) => {
      const a = P[i], b = P[j];
      const depth = ((a.z + b.z) / 2 + 1) / 2;
      c.strokeStyle = `rgba(255, 235, 231, ${0.32 - depth * 0.2})`;
      c.lineWidth = 1.2 - depth * 0.6;
      c.beginPath(); c.moveTo(a.sx, a.sy); c.lineTo(b.sx, b.sy); c.stroke();
    });
    nodes.map((n, i) => [n, P[i]]).sort((a, b) => b[1].z - a[1].z).forEach(([n, p]) => {
      const depth = (p.z + 1) / 2;
      const pulse = 0.85 + Math.sin(t + n.phase) * 0.15;
      const r = (n.big ? 7 : 4) * p.f * pulse;
      c.globalAlpha = (1 - depth * 0.55) * 0.9;
      c.shadowColor = GLOW[n.col];
      c.shadowBlur = (n.big ? 38 : 22) * p.f;
      c.fillStyle = n.col;
      c.beginPath(); c.arc(p.sx, p.sy, r, 0, Math.PI * 2); c.fill();
    });
    c.globalAlpha = 1; c.shadowBlur = 0;
    requestAnimationFrame(frame);
  }
  frame();
})();

/* ---------- 3D TILT (project tiles) ---------- */
(function tilt() {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const MAX = 5; // degrees
  document.querySelectorAll('.tile-rag, .tile-lette, .tile-llm').forEach(el => {
    el.addEventListener('mousemove', e => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      el.classList.add('tilting');
      el.style.transform =
        `perspective(1000px) rotateX(${(-py * MAX).toFixed(2)}deg) rotateY(${(px * MAX).toFixed(2)}deg) translateY(-3px)`;
    });
    el.addEventListener('mouseleave', () => {
      el.classList.remove('tilting');
      el.style.transform = '';
    });
  });
})();
