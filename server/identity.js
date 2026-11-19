// A device's player token, kept in a cookie as well as in localStorage. Safari clears a
// site's localStorage after a week without a visit, and a player who comes back then would
// get a new token: a new player to the stats, and no seat in a match they were in. A cookie
// the server sets outlives that, so /play hands the page its token back from the cookie.
// The cookie is HttpOnly: the page never reads it, only the <meta> /play writes from it.

export const ID_COOKIE = 'la_mesa_id';
/** Tokens are 32 hex characters from play.js; anything token-like is accepted. */
export const ID = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_AGE_S = 400 * 24 * 3600; // the longest a browser keeps a cookie

const hostOf = (origin) => {
  try {
    return new URL(origin).host;
  } catch {
    return null; // "null", from a sandboxed frame or a file
  }
};

/** The token in a Cookie header, or null. */
export function idFromCookie(header) {
  for (const part of String(header || '').split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === ID_COOKIE) return ID.test(value.join('=')) ? value.join('=') : null;
  }
  return null;
}

/** The Set-Cookie value that keeps `id` for another 400 days. `Secure` except on plain http (a LAN address). */
export const idCookie = (id, secure) =>
  `${ID_COOKIE}=${id}; Max-Age=${MAX_AGE_S}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;

/** play.html with the token from the cookie, for play.js to fall back on. */
export const withId = (html, id) => html.replace('</head>', `  <meta name="la-mesa-id" content="${id}" />\n  </head>`);

/**
 * POST /api/id: the page saves its token in the cookie, when the cookie is missing or has
 * another one. Only the page itself may: another site's request is refused, so it can't
 * sign a browser into a token of its choosing.
 * @returns {{ status: number, cookie?: string }}
 */
export function saveId({ method, fetchSite, origin, host, secure, body }) {
  if (method !== 'POST') return { status: 405 };
  // Browsers send Sec-Fetch-Site; older ones only an Origin, and a test or curl neither.
  if (fetchSite ? fetchSite !== 'same-origin' : origin && hostOf(origin) !== host) return { status: 403 };
  const id = String(body || '').trim();
  if (!ID.test(id)) return { status: 400 };
  return { status: 204, cookie: idCookie(id, secure) };
}
