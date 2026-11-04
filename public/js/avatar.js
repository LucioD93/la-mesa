// The player's photo: a small square JPEG kept on this device, like the name.
// The server never saves it, it only passes it on to the others in the match.
import { t } from './i18n.js';

const KEY = 'domino.avatar';
const SIZE = 120; // px; avatars show at 40 CSS px, so this stays sharp on a 3x screen
const MAX_CHARS = 11000; // has to fit in one socket message (see AVATAR_MAX_BYTES in hub.js)

export const load = () => localStorage.getItem(KEY);

/** Center-crop an image or video frame and shrink it to a data URL. */
function toPhoto(source, w, h, mirror = false) {
  const side = Math.min(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (mirror) {
    ctx.translate(SIZE, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source, (w - side) / 2, (h - side) / 2, side, side, 0, 0, SIZE, SIZE);
  let data;
  for (let q = 0.8; q >= 0.3; q -= 0.1) {
    data = canvas.toDataURL('image/jpeg', q);
    if (data.length <= MAX_CHARS) break;
  }
  return data;
}

/** Rejects if the file can't be decoded. */
async function shrink(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return toPhoto(img, img.naturalWidth, img.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Live camera view. The shot only exists here, so it never reaches the phone's gallery. */
function openCamera({ onPhoto, onChoose }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'camera';
  dialog.innerHTML = `
    <video class="camera-view" autoplay muted playsinline></video>
    <p class="camera-note" hidden>${t('photoNoCamera')}</p>
    <button type="button" class="btn primary block" data-take disabled>${t('photoTake')}</button>
    <div class="camera-actions">
      <button type="button" class="btn" data-choose>${t('photoChoose')}</button>
      <button type="button" class="btn" data-cancel>${t('photoCancel')}</button>
    </div>`;
  const video = dialog.querySelector('video');
  const note = dialog.querySelector('.camera-note');
  const take = dialog.querySelector('[data-take]');
  let stream;
  let closed = false;
  const stop = (s) => s?.getTracks().forEach((track) => track.stop());

  dialog.addEventListener('close', () => {
    closed = true;
    stop(stream);
    dialog.remove();
  });
  video.addEventListener('loadedmetadata', () => (take.disabled = false));
  take.addEventListener('click', () => {
    const photo = toPhoto(video, video.videoWidth, video.videoHeight, true); // as seen in the preview
    dialog.close();
    onPhoto(photo);
  });
  dialog.querySelector('[data-choose]').addEventListener('click', () => {
    dialog.close();
    onChoose();
  });
  dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.close());

  document.body.append(dialog);
  dialog.showModal();
  navigator.mediaDevices
    .getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } }, audio: false })
    .then((s) => {
      if (closed) return stop(s);
      stream = s;
      video.srcObject = s;
    })
    .catch(() => {
      video.hidden = true;
      note.hidden = false;
    });
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

  btn.addEventListener('click', () => {
    // The camera API needs a secure context; a plain LAN http:// page goes straight to the file picker.
    if (!navigator.mediaDevices?.getUserMedia) return input.click();
    openCamera({ onPhoto: set, onChoose: () => input.click() });
  });
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
