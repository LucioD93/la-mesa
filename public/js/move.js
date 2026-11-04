// The app moved from domino-ten-theta.vercel.app. Browser storage belongs to one
// domain, so the old address hands over what's saved here (token, name, photo,
// language, sound) in the URL fragment, which never reaches a server. This is a
// plain script in <head> so it runs before anything reads the storage.
(() => {
  const OLD_HOST = 'domino-ten-theta.vercel.app';
  const NEW_HOST = 'la-mesa-app.vercel.app';
  const VALID = {
    token: (v) => /^[0-9a-f]{32}$/.test(v),
    name: (v) => v.length <= 16,
    avatar: (v) => v.length <= 12000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(v),
    lang: (v) => v === 'en' || v === 'es',
    muted: (v) => v === '0' || v === '1',
  };

  if (location.hostname === OLD_HOST) {
    const saved = {};
    try {
      for (const key of Object.keys(VALID)) {
        const value = localStorage.getItem(`domino.${key}`);
        if (value) saved[key] = value;
      }
    } catch {}
    const carry = Object.keys(saved).length ? `#carry=${encodeURIComponent(JSON.stringify(saved))}` : '';
    location.replace(`https://${NEW_HOST}${location.pathname}${location.search}${carry}`);
    return;
  }

  const { hash } = location;
  if (!hash.startsWith('#carry=')) return;
  history.replaceState(null, '', location.pathname + location.search);
  try {
    const saved = JSON.parse(decodeURIComponent(hash.slice(7)));
    for (const key of Object.keys(VALID)) {
      const value = saved[key];
      // What this browser already has here wins, so a link can't replace anyone's identity.
      if (typeof value === 'string' && VALID[key](value) && !localStorage.getItem(`domino.${key}`)) {
        localStorage.setItem(`domino.${key}`, value);
      }
    }
  } catch {}
})();
