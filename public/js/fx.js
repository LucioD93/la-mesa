// Full-screen canvas effects: confetti for winners, rain for losers.
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

let canvas, ctx, raf, particles = [], mode = null, until = 0;

function setup() {
  if (!canvas) {
    canvas = document.getElementById('fx');
    ctx = canvas.getContext('2d');
    addEventListener('resize', size);
  }
  size();
}

function size() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

const COLORS = ['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#fde047', '#ffffff'];

function confettiBurst(n, fromX, fromY) {
  for (let i = 0; i < n; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
    const speed = 7 + Math.random() * 10;
    particles.push({
      kind: 'c',
      x: fromX,
      y: fromY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4,
      tilt: Math.random() * Math.PI,
      color: COLORS[(Math.random() * COLORS.length) | 0],
    });
  }
}

function rainDrop() {
  particles.push({
    kind: 'r',
    x: Math.random() * innerWidth,
    y: -20 - Math.random() * 60,
    vy: 9 + Math.random() * 6,
    len: 10 + Math.random() * 14,
  });
}

function tick() {
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  const now = performance.now();

  if (mode === 'confetti' && now < until && Math.random() < 0.25) {
    confettiBurst(6, Math.random() * innerWidth, innerHeight + 10);
  }
  if (mode === 'rain' && now < until) for (let i = 0; i < 3; i++) rainDrop();

  particles = particles.filter((p) => p.y < innerHeight + 40 && p.x > -40 && p.x < innerWidth + 40);
  for (const p of particles) {
    if (p.kind === 'c') {
      p.vy += 0.28;
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.x += p.vx + Math.sin(p.tilt) * 0.6;
      p.y += p.vy;
      p.rot += p.vr;
      p.tilt += 0.08;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(1, Math.cos(p.tilt));
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    } else {
      p.y += p.vy;
      p.x -= 1.2;
      ctx.strokeStyle = 'rgba(160, 190, 230, 0.55)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - 1.5, p.y + p.len);
      ctx.stroke();
    }
  }

  if (particles.length || now < until) raf = requestAnimationFrame(tick);
  else stop();
}

function start(m, ms) {
  setup();
  cancelAnimationFrame(raf);
  mode = m;
  until = performance.now() + (reduceMotion ? ms / 4 : ms);
  canvas.hidden = false;
  raf = requestAnimationFrame(tick);
}

export function confetti() {
  start('confetti', 4500);
  setup();
  confettiBurst(reduceMotion ? 40 : 140, innerWidth * 0.2, innerHeight);
  confettiBurst(reduceMotion ? 40 : 140, innerWidth * 0.8, innerHeight);
}

export function rain() {
  start('rain', 6000);
}

export function stop() {
  cancelAnimationFrame(raf);
  particles = [];
  mode = null;
  if (canvas) {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    canvas.hidden = true;
  }
}
