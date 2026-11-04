// The player's photo: a small square JPEG kept on this device, like the name.
// The server never saves it, it only passes it on to the others in the match.

const KEY = 'domino.avatar';
const SIZE = 120; // px; avatars show at 40 CSS px, so this stays sharp on a 3x screen
const MAX_CHARS = 11000; // has to fit in one socket message (see AVATAR_MAX_BYTES in hub.js)

export const load = () => localStorage.getItem(KEY);

/** Center-crop a picture and shrink it to a data URL. Rejects if it can't be decoded. */
async function shrink(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const side = Math.min(w, h);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    canvas.getContext('2d').drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, SIZE, SIZE);
    let data;
    for (let q = 0.8; q >= 0.3; q -= 0.1) {
      data = canvas.toDataURL('image/jpeg', q);
      if (data.length <= MAX_CHARS) break;
    }
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Wire up the #photoBtn / #photoClear / #photoInput controls of a page. */
export function bindPicker({ onChange, onError }) {
  const btn = document.getElementById('photoBtn');
  const clear = document.getElementById('photoClear');
  const input = document.getElementById('photoInput');

  const paint = () => {
    const photo = load();
    btn.style.backgroundImage = photo ? `url("${photo}")` : '';
    btn.classList.toggle('has-photo', !!photo);
    clear.hidden = !photo;
  };
  const set = (photo) => {
    if (photo) localStorage.setItem(KEY, photo);
    else localStorage.removeItem(KEY);
    paint();
    onChange?.(photo);
  };

  btn.addEventListener('click', () => input.click());
  clear.addEventListener('click', () => set(null));
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.value = ''; // so the same file can be picked again
    if (!file) return;
    try {
      set(await shrink(file));
    } catch {
      onError?.();
    }
  });
  paint();
}
