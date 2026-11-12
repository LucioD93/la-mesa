// A tile or card thrown from a player's seat to its spot on the table: pulled from
// the hand, spinning face down, flipped over, slammed down.

export const FLIGHT_MS = 1200;
const IMPACT_AT = 0.88; // fraction of the flight where it hits the table
export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const canFly = () => !reduceMotion && !document.hidden;

const flying = new Set(); // seats with something in the air
let afterFlights = [];

export const isFlying = (seat) => flying.has(seat);

const lerp = (a, b, u) => a + (b - a) * u;
const clamp01 = (u) => Math.min(Math.max(u, 0), 1);
const easeInOut = (u) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);

/** Run `fn` right away, or once everything in the air has landed. */
export function whenLanded(fn) {
  if (flying.size) afterFlights.push(fn);
  else fn();
}

/** Count `key` as in the air until it lands, then run what was waiting on it. */
function land(key) {
  flying.delete(key);
  if (flying.size) return;
  const queued = afterFlights;
  afterFlights = [];
  queued.forEach((fn) => fn());
}

/** Hold `whenLanded` back for something other than a throw (the deal). Returns the release. */
export function hold(key) {
  flying.add(key);
  return () => land(key);
}

function flightPose(t) {
  if (t < 0.2) {
    const u = t / 0.2;
    return { along: 0, scale: lerp(0.3, 0.85, 1 - (1 - u) ** 2), spin: Math.sin(u * Math.PI * 2) * 10, flip: 180 };
  }
  if (t < 0.8) {
    const u = (t - 0.2) / 0.6;
    const e = easeInOut(u);
    return {
      along: e,
      scale: lerp(0.85, 1.5, e) + 0.4 * Math.sin(Math.PI * u),
      spin: (1 - e) * 540,
      flip: 180 * (1 - clamp01((u - 0.25) / 0.5)),
    };
  }
  if (t < 0.9) {
    const u = (t - 0.8) / 0.1;
    return { along: 1, scale: lerp(1.5, 0.9, u * u), spin: 0, flip: 0 };
  }
  const u = (t - 0.9) / 0.1;
  return { along: 1, scale: 1 + 0.08 * Math.sin(Math.PI * u) - (1 - u) * 0.1, spin: 0, flip: 0 };
}

/**
 * Throw `flier` (with a `.flier-back` inside) from `avatar` to the element `target()`
 * returns; null means the table moved on. The target is looked up every frame because
 * the table can reflow or rebuild during the flight. `fit(rect)` sizes the flier to the
 * target and returns [width, height].
 */
export function launch({ seat, avatar, flier, target, fit, rotation = 0, onImpact, onDone }) {
  const a = avatar.getBoundingClientRect();
  const x0 = a.left + a.width / 2;
  const y0 = a.top + a.height / 2;
  avatar.classList.add('throw');
  const back = flier.querySelector('.flier-back');
  document.body.append(flier);

  flying.add(seat);
  const start = performance.now();
  let hit = false;

  const finish = () => {
    flier.remove();
    onDone();
    land(seat);
  };

  const frame = (now) => {
    const el = target();
    if (!el) return finish();
    const t = clamp01((now - start) / FLIGHT_MS);
    const r = el.getBoundingClientRect();
    const x1 = r.left + r.width / 2;
    const y1 = r.top + r.height / 2;
    const { along: p, scale, spin, flip } = flightPose(t);
    // A curve bowed upward, so it arcs over the table instead of sliding.
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2 - Math.hypot(x1 - x0, y1 - y0) * 0.35;
    const x = lerp(lerp(x0, cx, p), lerp(cx, x1, p), p);
    const y = lerp(lerp(y0, cy, p), lerp(cy, y1, p), p);
    const [width, height] = fit(r);
    flier.style.transform = `translate(${x - width / 2}px, ${y - height / 2}px) rotate(${spin + rotation * p}deg) perspective(500px) rotateY(${flip}deg) scale(${scale})`;
    back.hidden = flip < 90;
    if (!hit && t >= IMPACT_AT) {
      hit = true;
      onImpact(el);
    }
    if (t < 1) requestAnimationFrame(frame);
    else finish();
  };
  frame(start);
}
