// UI strings in English and Spanish. The language comes from localStorage
// ('domino.lang', named before truco but used for every game), falling back to the
// browser's preferred language. Each game's own strings, name and errors are in
// games/<id>.js.
import { GAME_DATA } from './games.js';

const en = {
  'landing.sub': '4 players · 2 vs 2 · no sign-up',
  'landing.name': 'Your name',
  'landing.namePlaceholder': 'Pick a name',
  'landing.new': 'New match',
  'landing.code': 'Match code',
  'landing.join': 'Join',
  'landing.hint': 'Pick the game in the lobby, send the link, and fill empty seats with bots.',

  'aria.score': 'Show score history',
  'aria.react': 'Send a reaction',
  'aria.reactions': 'Reactions',
  'react.recent': 'Recent',
  'react.faces': 'Faces',
  'react.hands': 'Hands',
  'react.table': 'Table',
  'react.memes': 'Memes',
  'aria.rules': 'Rules',
  'aria.changeGame': ({ game }) => `Game: ${game}. Change game`,
  'rulesOf': ({ game }) => `${game} rules`,
  'aria.close': 'Close',
  'aria.lang': 'Language',
  'aria.voiceJoin': 'Join voice chat',
  'aria.voiceMute': 'Mute microphone',
  'aria.voiceUnmute': 'Unmute microphone',
  'aria.voiceLeave': 'Leave voice chat',
  'aria.photo': 'Take a picture for your avatar',
  'aria.photoClear': 'Remove your picture',

  'us': 'Us',
  'them': 'Them',
  'team': ({ n }) => `Team ${n}`,
  'yourTeam': 'Your team',
  'teamName.title': 'Name your team',
  'teamName.save': 'Save',
  'teamName.clear': 'Remove name',
  'teamRenamed.mine': ({ name }) => `Your team is now “${name}”`,
  'teamRenamed.other': ({ name }) => `The other team is now “${name}”`,
  'teamRenamed.n': ({ n, name }) => `Team ${n} is now “${name}”`,
  'aria.teamName': ({ name }) => `${name}. Rename your team`,
  'you': 'You',
  'player': ({ n }) => `Player ${n}`,
  'to': ({ n }) => `to ${n}`,
  'toWord': 'to',
  'lobby': 'Lobby',

  'match': 'Match',
  'copied': 'Copied ✓',
  'copyFailed': "Couldn't copy the link. Share the match code instead.",
  'yourName': 'Your name',
  'photoFailed': "Couldn't use that picture.",
  'photoTake': 'Take picture',
  'photoChoose': 'Choose a file',
  'photoCancel': 'Cancel',
  'photoNoCamera': "Can't use the camera. You can choose a file instead.",
  'seats': 'Seats',
  'seatsNote': '— partners sit across from each other',
  'seatsNoteSolo': '— every player for themselves',
  'game': 'Game',
  'gameChanged': ({ game }) => `Now playing: ${game}`,
  'chooseGame': 'Choose a game',
  'playTo': 'Play to',
  'theme.felt': 'Felt',
  'theme.pencil': 'Pencil',
  'theme.neon': 'Neon',
  'theme.minimal': 'Minimal',
  'theme.dark': 'Dark',
  'theme.halloween': 'Halloween',
  'theme.christmas': 'Christmas',
  'themeChanged': ({ theme }) => `Table style: ${theme}`,
  'chooseStyle': 'Choose a style',
  'themeDesc.felt': 'The green table',
  'themeDesc.pencil': 'Graphite on graph paper',
  'themeDesc.neon': 'A holographic table in the dark',
  'themeDesc.minimal': 'Flat white, one ink',
  'themeDesc.dark': 'Graphite with warm highlights',
  'themeDesc.halloween': 'A moonlit night with bats',
  'themeDesc.christmas': 'A red table under falling snow',
  'fillBots': 'Fill with bots',
  'start': 'Start game',
  'takeSeatToStart': 'Take a seat to start',
  'waitingFor4': 'Waiting for 4 players…',
  'empty': 'Empty',
  'tapToSit': 'Tap to sit',
  'remove': 'Remove',
  'youSuffix': ({ name }) => `${name} (you)`,
  'standUp': 'Stand up',
  'ready': 'Ready',
  'offline': 'Offline',
  'useBot': 'Use bot',
  'takeSeat': 'Take seat',
  'removeBotFirst': 'Remove the bot first',
  'manguangua': 'Shut the door, El Manguangua is coming!',

  'score': 'Score',
  'how': 'How',
  'winner': 'Winner',
  'total': 'Total',

  'showResult': 'Show result',
  'reconnecting': 'Reconnecting…',
  'noNetwork': 'No connection — waiting for network…',
  'notConnected': 'Not connected — reconnecting…',
  'voiceOn': 'Voice chat on',
  'voiceOff': 'Left voice chat',
  'voiceJoined': ({ name }) => `${name} joined voice chat`,
  'voiceBlocked': 'Microphone blocked — you can listen but not talk',
  'voiceNoMic': 'No microphone available — you can listen but not talk',
  'voiceListening': 'Listening only (no microphone)',
  'voiceInvite.on': 'Voice chat is on',
  'voiceInvite.started': ({ name }) => `${name} started voice chat`,
  'voiceInvite.onText': ({ names, n }) => `${names} ${n === 1 ? 'is' : 'are'} in voice chat. Join them?`,
  'voiceInvite.startedText': 'Talk with the table while you play.',
  'voiceInvite.join': 'Join voice chat',
  'voiceInvite.later': 'Not now',
  'voiceInvite.hint': 'Your browser will ask to use the microphone.',
  'linkCopied': 'Link copied',

  'watchingHint': 'You are watching. Tap “Take seat” on a bot to play.',
  'waitingPlayers': 'Waiting for players',
  'yourTurn': 'Your turn',
  'watchingTurn': ({ name }) => `Watching · ${name}’s turn`,
  'turnOf': ({ name }) => `${name}’s turn`,
  'matchOver': 'Match over',
  'waitFor': ({ name }) => `Wait for ${name}`,

  'teamWinsMatch': ({ team }) => `${team} wins the match!`,
  'youWinMatch': 'You win the match!',
  'youLoseMatch': 'You lose the match',
  'playerWinsMatch': ({ name }) => `${name} wins the match!`,
  'youWinRound': 'You win the round!',
  'playerWinsRound': ({ name }) => `${name} wins the round`,
  'rematch': 'Rematch',
  'backToLobby': 'Back to the lobby',
  'confirmLobby.title': 'Back to the lobby?',
  'confirmLobby.text': 'This ends the game for all four players and the score goes back to 0–0.',
  'confirmLobby.yes': 'End game, back to the lobby',
  'keepPlaying': 'Keep playing',

  'aria.menu': 'Menu',
  'inviteFriends': 'Invite friends',
  'device.title': 'Play on another device',
  'device.text': ({ name }) => `Scan this with your other phone or computer. This match opens there as you, ${name}, in your seat. Your photo stays on this device.`,
  'device.warn': 'Anyone with this link plays as you. Only open it on your own devices.',
  'device.copy': 'Copy link',
  'device.arrived': ({ name }) => `You're ${name} on this device too`,
  'tableStyle': 'Table style',
  'language': 'Language',
  'langName': 'English',
  'sound': 'Sound',
  'on': 'On',
  'off': 'Off',
  'leaveMatch': 'Leave match',
};

const es = {
  'landing.sub': '4 jugadores · 2 contra 2 · sin registro',
  'landing.name': 'Tu nombre',
  'landing.namePlaceholder': 'Elige un nombre',
  'landing.new': 'Nueva partida',
  'landing.code': 'Código de partida',
  'landing.join': 'Unirse',
  'landing.hint': 'Elige el juego en la sala, envía el enlace y llena los asientos vacíos con bots.',

  'aria.score': 'Ver historial de puntos',
  'aria.react': 'Enviar una reacción',
  'aria.reactions': 'Reacciones',
  'react.recent': 'Recientes',
  'react.faces': 'Caras',
  'react.hands': 'Manos',
  'react.table': 'Mesa',
  'react.memes': 'Memes',
  'aria.rules': 'Reglas',
  'aria.changeGame': ({ game }) => `Juego: ${game}. Cambiar de juego`,
  'rulesOf': ({ game }) => `Reglas de ${game}`,
  'aria.close': 'Cerrar',
  'aria.lang': 'Idioma',
  'aria.voiceJoin': 'Entrar al chat de voz',
  'aria.voiceMute': 'Silenciar micrófono',
  'aria.voiceUnmute': 'Activar micrófono',
  'aria.voiceLeave': 'Salir del chat de voz',
  'aria.photo': 'Tomar una foto para tu avatar',
  'aria.photoClear': 'Quitar tu foto',

  'us': 'Nosotros',
  'them': 'Ellos',
  'team': ({ n }) => `Equipo ${n}`,
  'yourTeam': 'Tu equipo',
  'teamName.title': 'Nombre del equipo',
  'teamName.save': 'Guardar',
  'teamName.clear': 'Quitar nombre',
  'teamRenamed.mine': ({ name }) => `Tu equipo ahora se llama «${name}»`,
  'teamRenamed.other': ({ name }) => `El otro equipo ahora se llama «${name}»`,
  'teamRenamed.n': ({ n, name }) => `El equipo ${n} ahora se llama «${name}»`,
  'aria.teamName': ({ name }) => `${name}. Cambiar el nombre del equipo`,
  'you': 'Tú',
  'player': ({ n }) => `Jugador ${n}`,
  'to': ({ n }) => `a ${n}`,
  'toWord': 'a',
  'lobby': 'Sala',

  'match': 'Partida',
  'copied': 'Copiado ✓',
  'copyFailed': 'No se pudo copiar el enlace. Comparte el código de la partida.',
  'yourName': 'Tu nombre',
  'photoFailed': 'No se pudo usar esa foto.',
  'photoTake': 'Tomar foto',
  'photoChoose': 'Elegir archivo',
  'photoCancel': 'Cancelar',
  'photoNoCamera': 'No se puede usar la cámara. Puedes elegir un archivo.',
  'seats': 'Asientos',
  'seatsNote': '— los compañeros se sientan enfrente',
  'seatsNoteSolo': '— cada quien por su cuenta',
  'game': 'Juego',
  'gameChanged': ({ game }) => `Ahora se juega: ${game}`,
  'chooseGame': 'Elige un juego',
  'playTo': 'Jugar a',
  'theme.felt': 'Paño',
  'theme.pencil': 'Lápiz',
  'theme.neon': 'Neón',
  'theme.minimal': 'Simple',
  'theme.dark': 'Oscuro',
  'theme.halloween': 'Halloween',
  'theme.christmas': 'Navidad',
  'themeChanged': ({ theme }) => `Estilo de mesa: ${theme}`,
  'chooseStyle': 'Elige un estilo',
  'themeDesc.felt': 'La mesa verde',
  'themeDesc.pencil': 'Grafito sobre papel cuadriculado',
  'themeDesc.neon': 'Una mesa holográfica a oscuras',
  'themeDesc.minimal': 'Blanco liso, una sola tinta',
  'themeDesc.dark': 'Grafito con toques cálidos',
  'themeDesc.halloween': 'Noche de luna con murciélagos',
  'themeDesc.christmas': 'Mesa roja bajo la nieve',
  'fillBots': 'Llenar con bots',
  'start': 'Empezar',
  'takeSeatToStart': 'Siéntate para empezar',
  'waitingFor4': 'Esperando 4 jugadores…',
  'empty': 'Vacío',
  'tapToSit': 'Siéntate',
  'remove': 'Quitar',
  'youSuffix': ({ name }) => `${name} (tú)`,
  'standUp': 'Levantarse',
  'ready': 'Listo',
  'offline': 'Desconectado',
  'useBot': 'Usar bot',
  'takeSeat': 'Ocupar',
  'removeBotFirst': 'Primero quita el bot',
  'manguangua': '¡Cierra la puerta que viene El Manguangua!',

  'score': 'Puntos',
  'how': 'Cómo',
  'winner': 'Ganador',
  'total': 'Total',

  'showResult': 'Ver resultado',
  'reconnecting': 'Reconectando…',
  'noNetwork': 'Sin conexión — esperando la red…',
  'notConnected': 'Sin conexión — reconectando…',
  'voiceOn': 'Chat de voz activado',
  'voiceOff': 'Saliste del chat de voz',
  'voiceJoined': ({ name }) => `${name} entró al chat de voz`,
  'voiceBlocked': 'Micrófono bloqueado — puedes escuchar pero no hablar',
  'voiceNoMic': 'No hay micrófono — puedes escuchar pero no hablar',
  'voiceListening': 'Solo escuchando (sin micrófono)',
  'voiceInvite.on': 'El chat de voz está activo',
  'voiceInvite.started': ({ name }) => `${name} inició el chat de voz`,
  'voiceInvite.onText': ({ names, n }) => `${names} ${n === 1 ? 'está' : 'están'} en el chat de voz. ¿Te unes?`,
  'voiceInvite.startedText': 'Habla con la mesa mientras juegas.',
  'voiceInvite.join': 'Entrar al chat de voz',
  'voiceInvite.later': 'Ahora no',
  'voiceInvite.hint': 'Tu navegador te pedirá usar el micrófono.',
  'linkCopied': 'Enlace copiado',

  'watchingHint': 'Estás mirando. Toca “Ocupar” en un bot para jugar.',
  'waitingPlayers': 'Esperando jugadores',
  'yourTurn': 'Tu turno',
  'watchingTurn': ({ name }) => `Mirando · turno de ${name}`,
  'turnOf': ({ name }) => `Turno de ${name}`,
  'matchOver': 'Partida terminada',
  'waitFor': ({ name }) => `Espera a ${name}`,

  'teamWinsMatch': ({ team }) => `¡${team} gana la partida!`,
  'youWinMatch': '¡Ganaste la partida!',
  'youLoseMatch': 'Perdiste la partida',
  'playerWinsMatch': ({ name }) => `¡${name} gana la partida!`,
  'youWinRound': '¡Ganaste la mano!',
  'playerWinsRound': ({ name }) => `${name} gana la mano`,
  'rematch': 'Revancha',
  'backToLobby': 'Volver a la sala',
  'confirmLobby.title': '¿Volver a la sala?',
  'confirmLobby.text': 'Se termina el juego para los cuatro y el marcador vuelve a 0–0.',
  'confirmLobby.yes': 'Terminar y volver a la sala',
  'keepPlaying': 'Seguir jugando',

  'aria.menu': 'Menú',
  'inviteFriends': 'Invitar amigos',
  'device.title': 'Jugar en otro dispositivo',
  'device.text': ({ name }) => `Escanea esto con tu otro teléfono o computadora. La partida se abre ahí como tú, ${name}, en tu puesto. Tu foto se queda en este dispositivo.`,
  'device.warn': 'Quien tenga este enlace juega como tú. Ábrelo solo en tus propios dispositivos.',
  'device.copy': 'Copiar enlace',
  'device.arrived': ({ name }) => `También eres ${name} en este dispositivo`,
  'tableStyle': 'Estilo de mesa',
  'language': 'Idioma',
  'langName': 'Español',
  'sound': 'Sonido',
  'on': 'Activado',
  'off': 'Apagado',
  'leaveMatch': 'Salir de la partida',

  // Server error messages arrive in English. The ones only one game sends are in its games/<id>.js.
  'Round is over': 'La mano terminó',
  'Not your turn': 'No es tu turno',
  'You do not have that tile': 'No tienes esa ficha',
  'You do not have that card': 'No tienes esa carta',
  'Reload the page to keep playing': 'Recarga la página para seguir jugando',
  'Too late': 'Muy tarde',
};

// Strings that differ by game win over the shared ones while that game is on the table.
const games = {};
for (const [id, g] of Object.entries(GAME_DATA)) {
  games[id] = g.strings;
  en[`game.${id}`] = g.name.en;
  es[`game.${id}`] = g.name.es;
  en[`gameDesc.${id}`] = g.desc.en;
  es[`gameDesc.${id}`] = g.desc.es;
  Object.assign(es, g.errors?.es);
}

const dicts = { en, es };
export const LANGS = Object.keys(dicts);

const detect = () => {
  const saved = localStorage.getItem('domino.lang');
  if (dicts[saved]) return saved;
  const pref = (navigator.languages ?? [navigator.language]).map((l) => l?.slice(0, 2));
  return pref.find((l) => dicts[l]) ?? 'en';
};

export let lang = detect();
let game = null;

/** Which game's strings to use, re-applying the static ones. */
export function setGame(id) {
  game = id;
  apply();
}

export function t(key, params = {}) {
  const own = games[game];
  const v = own?.[lang][key] ?? dicts[lang][key] ?? own?.en[key] ?? en[key] ?? key;
  return typeof v === 'function' ? v(params) : v;
}

/** Fill static markup: data-i18n (text), data-i18n-placeholder, data-i18n-aria. */
export function apply(root = document) {
  document.documentElement.lang = lang;
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
  for (const el of root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  for (const el of root.querySelectorAll('[data-lang-btn]')) el.textContent = lang.toUpperCase();
}

/** Switch to the next language and re-apply static strings. */
export function cycle() {
  lang = LANGS[(LANGS.indexOf(lang) + 1) % LANGS.length];
  localStorage.setItem('domino.lang', lang);
  apply();
  return lang;
}
