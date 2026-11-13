// The reactions players throw at the table, by tab of the picker. An emoji is its own id;
// a picture has a word id and an entry in IMAGES. The server accepts the same ids
// (REACTIONS in server/match.js), and a test keeps the two lists in step.
export const REACTION_TABS = [
  { id: 'faces', icon: '😀', items: ['😂', '🤣', '😭', '🥲', '😮', '😱', '😡', '🤬', '🤔', '😏', '🙄', '😴', '🤡', '🥵', '😎', '🤯'] },
  { id: 'hands', icon: '👍', items: ['👏', '👍', '👎', '🙏', '🤌', '💪', '🫡', '👀', '🤝', '✌️'] },
  { id: 'table', icon: '🔥', items: ['🔥', '💯', '🎉', '🍀', '💀', '🐢', '⏳', '🧠', '🎯', '🏆'] },
  { id: 'memes', icon: '⭐', items: ['manguangua', 'vladimir'] },
];

// El Manguangua's face: Henrique Capriles, 2022, CC0 via Wikimedia Commons.
// Vladimir's muddy ball is drawn for La Mesa; his line plays every time he's sent.
export const IMAGES = {
  manguangua: { src: '/img/manguangua.jpg', label: 'El Manguangua' },
  vladimir: { src: '/img/vladimir.svg', label: '¡Naweboná, Vladimir!' },
};

export const REACTIONS = REACTION_TABS.flatMap((tab) => tab.items);

/** The Recent tab before this device has sent anything. */
export const FIRST_RECENT = ['😂', '😭', '👏', '🔥', '😡', 'manguangua'];
