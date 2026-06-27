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
  { x: 0.15, y: 0.2,  r: 380, rgba: [168, 85, 247], a: 0.07, dx:  0.00014, dy:  0.00009 },
  { x: 0.8,  y: 0.3,  r: 300, rgba: [236, 72, 153], a: 0.06, dx: -0.00011, dy:  0.00008 },
  { x: 0.5,  y: 0.8,  r: 340, rgba: [6, 182, 212],  a: 0.05, dx:  0.00009, dy: -0.00013 },
  { x: 0.9,  y: 0.85, r: 220, rgba: [168, 85, 247], a: 0.04, dx: -0.00010, dy: -0.00008 },
];

// Small particles
const PARTICLE_COUNT = 80;
const particles = Array.from({ length: PARTICLE_COUNT }, () => ({
  x: Math.random(), y: Math.random(),
  r: Math.random() * 1.4 + 0.3,
  alpha: Math.random() * 0.45 + 0.1,
  dx: (Math.random() - 0.5) * 0.00007,
  dy: (Math.random() - 0.5) * 0.00007,
  pulse: Math.random() * Math.PI * 2,
  pulseSpeed: Math.random() * 0.014 + 0.004,
  color: ['#a855f7', '#ec4899', '#06b6d4'][Math.floor(Math.random() * 3)],
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
  drawOrb(glowX, glowY, 200, [168, 85, 247], 0.10);
  drawOrb(glowX, glowY, 90,  [236, 72, 153], 0.07);

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
        ctx.strokeStyle = `rgba(168,85,247,${opacity})`;
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
