// UI strings in English and Spanish. The language comes from localStorage
// ('domino.lang'), falling back to the browser's preferred language.

const en = {
  'landing.sub': '4 players · 2 vs 2 · no sign-up',
  'landing.name': 'Your name',
  'landing.namePlaceholder': 'Pick a name',
  'landing.new': 'New match',
  'landing.code': 'Match code',
  'landing.join': 'Join',
  'landing.hint': 'Create a match and send the link to your friends. Empty seats can be filled with bots.',

  'aria.home': 'Home',
  'aria.score': 'Show score history',
  'aria.invite': 'Invite',
  'aria.react': 'Send a reaction',
  'aria.sound': 'Toggle sound',
  'aria.close': 'Close',
  'aria.lang': 'Language',
  'aria.voiceJoin': 'Join voice chat',
  'aria.voiceMute': 'Mute microphone',
  'aria.voiceUnmute': 'Unmute microphone',
  'aria.voiceLeave': 'Leave voice chat',
  'aria.tile': ({ a, b }) => `${a} and ${b}`,
  'tilesLeft': 'tiles left',

  'us': 'Us',
  'them': 'Them',
  'team': ({ n }) => `Team ${n}`,
  'you': 'You',
  'player': ({ n }) => `Player ${n}`,
  'to': ({ n }) => `to ${n}`,
  'toWord': 'to',
  'lobby': 'Lobby',
  'round': ({ n }) => `Round ${n}`,

  'match': 'Match',
  'copy': 'Copy',
  'yourName': 'Your name',
  'seats': 'Seats',
  'seatsNote': '— partners sit across from each other',
  'playTo': 'Play to',
  'fillBots': 'Fill empty seats with bots',
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
  'pass': 'Pass',
  'useBot': 'Use bot',
  'takeSeat': 'Take seat',
  'removeBotFirst': 'Remove the bot first',

  'score': 'Score',
  'how': 'How',
  'total': 'Total',
  'noRounds': 'No rounds yet',
  'histOut': ({ name }) => `${name} out`,
  'histBlocked': 'Blocked',
  'histTie': 'Blocked, tie',
  'rules':
    'Partners sit across. Whoever has the double six opens the first round; after that, the opener rotates to the right each round. Going out ("domino") scores every pip left in all hands. If the game is blocked, the team with fewer pips wins them all.',

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
  'shareTitle': 'Play dominoes with me',
  'shareText': 'Join my domino match',
  'linkCopied': 'Link copied',

  'youPass': 'You pass',
  'passes': ({ name }) => `${name} passes`,
  'openDoubleSix': 'Open with the double six',
  'youOpen': 'You open — play any tile',
  'opens': ({ name }) => `${name} opens…`,
  'opensDoubleSix': ({ name }) => `${name} opens with the double six…`,
  'watchingHint': 'You are watching. Tap “Take seat” on a bot to play.',
  'waitingPlayers': 'Waiting for players',
  'yourTurn': 'Your turn',
  'autoPass': 'No tile fits — passing…',
  'watchingTurn': ({ name }) => `Watching · ${name}’s turn`,
  'turnOf': ({ name }) => `${name}’s turn`,
  'roundOver': 'Round over',
  'matchOver': 'Match over',
  'waitFor': ({ name }) => `Wait for ${name}`,
  'dragHint': 'Drag the tile onto the board',
  'mock.lines': [
    'Nice try, genius',
    'Can you even count pips?',
    'That tile? Really?',
    'Bold move. Also illegal.',
    'Your partner just sighed',
    'Maybe try checkers?',
    'The tiles have dots for a reason',
  ],

  'youGoOut': 'You go out!',
  'goesOut': ({ name }) => `${name} goes out!`,
  'blockedPips': ({ a, pa, b, pb }) => `Blocked! Pips — ${a}: ${pa}, ${b}: ${pb}`,
  'teamWinsMatch': ({ team }) => `${team} wins the match!`,
  'youWinMatch': 'You win the match!',
  'youLoseMatch': 'You lose the match',
  'matchSub': ({ a, b, n }) => `${a} to ${b} · ${n} rounds`,
  'tieTitle': 'Blocked — it’s a tie',
  'tieSub': ({ n }) => `Both teams have ${n} pips. No points.`,
  'lastRound': ({ sub, how }) => `${sub} · last round: ${how}`,
  'outCheck': 'out ✓',
  'rematch': 'Rematch',
  'changeSeats': 'Change seats',
  'nextRound': 'Next round',
  'seeBoard': 'See board',
};

const es = {
  'landing.sub': '4 jugadores · 2 contra 2 · sin registro',
  'landing.name': 'Tu nombre',
  'landing.namePlaceholder': 'Elige un nombre',
  'landing.new': 'Nueva partida',
  'landing.code': 'Código de partida',
  'landing.join': 'Unirse',
  'landing.hint': 'Crea una partida y envía el enlace a tus amigos. Los asientos vacíos se pueden llenar con bots.',

  'aria.home': 'Inicio',
  'aria.score': 'Ver historial de puntos',
  'aria.invite': 'Invitar',
  'aria.react': 'Enviar una reacción',
  'aria.sound': 'Activar o silenciar sonido',
  'aria.close': 'Cerrar',
  'aria.lang': 'Idioma',
  'aria.voiceJoin': 'Entrar al chat de voz',
  'aria.voiceMute': 'Silenciar micrófono',
  'aria.voiceUnmute': 'Activar micrófono',
  'aria.voiceLeave': 'Salir del chat de voz',
  'aria.tile': ({ a, b }) => `${a} y ${b}`,
  'tilesLeft': 'fichas restantes',

  'us': 'Nosotros',
  'them': 'Ellos',
  'team': ({ n }) => `Equipo ${n}`,
  'you': 'Tú',
  'player': ({ n }) => `Jugador ${n}`,
  'to': ({ n }) => `a ${n}`,
  'toWord': 'a',
  'lobby': 'Sala',
  'round': ({ n }) => `Mano ${n}`,

  'match': 'Partida',
  'copy': 'Copiar',
  'yourName': 'Tu nombre',
  'seats': 'Asientos',
  'seatsNote': '— los compañeros se sientan enfrente',
  'playTo': 'Jugar a',
  'fillBots': 'Llenar asientos vacíos con bots',
  'start': 'Empezar',
  'takeSeatToStart': 'Siéntate para empezar',
  'waitingFor4': 'Esperando 4 jugadores…',
  'empty': 'Vacío',
  'tapToSit': 'Toca para sentarte',
  'remove': 'Quitar',
  'youSuffix': ({ name }) => `${name} (tú)`,
  'standUp': 'Levantarse',
  'ready': 'Listo',
  'offline': 'Desconectado',
  'pass': 'Paso',
  'useBot': 'Usar bot',
  'takeSeat': 'Ocupar',
  'removeBotFirst': 'Primero quita el bot',

  'score': 'Puntos',
  'how': 'Cómo',
  'total': 'Total',
  'noRounds': 'Todavía no hay manos',
  'histOut': ({ name }) => `${name} dominó`,
  'histBlocked': 'Tranque',
  'histTie': 'Tranque, empate',
  'rules':
    'Los compañeros se sientan enfrente. Quien tiene el doble seis abre la primera mano; después, la salida rota hacia la derecha en cada mano. Quien se queda sin fichas ("dominó") suma todos los puntos que quedan en las manos. Si el juego se tranca, el equipo con menos puntos se los lleva todos.',

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
  'shareTitle': 'Juega dominó conmigo',
  'shareText': 'Únete a mi partida de dominó',
  'linkCopied': 'Enlace copiado',

  'youPass': 'Pasas',
  'passes': ({ name }) => `${name} pasa`,
  'openDoubleSix': 'Abre con el doble seis',
  'youOpen': 'Abres tú — juega cualquier ficha',
  'opens': ({ name }) => `Abre ${name}…`,
  'opensDoubleSix': ({ name }) => `${name} abre con el doble seis…`,
  'watchingHint': 'Estás mirando. Toca “Ocupar” en un bot para jugar.',
  'waitingPlayers': 'Esperando jugadores',
  'yourTurn': 'Tu turno',
  'autoPass': 'No tienes ficha — pasando…',
  'watchingTurn': ({ name }) => `Mirando · turno de ${name}`,
  'turnOf': ({ name }) => `Turno de ${name}`,
  'roundOver': 'Mano terminada',
  'matchOver': 'Partida terminada',
  'waitFor': ({ name }) => `Espera a ${name}`,
  'dragHint': 'Arrastra la ficha a la mesa',
  'mock.lines': [
    '¿Y esa ficha qué, mi pana?',
    '¡Esa no pega ni con pega!',
    '¿Tú sabes contar puntos?',
    'Valiente, pero no va',
    'Tu compañero acaba de suspirar',
    'Mejor juega metras',
    '¡Ponte las pilas!',
  ],

  'youGoOut': '¡Dominaste!',
  'goesOut': ({ name }) => `¡${name} dominó!`,
  'blockedPips': ({ a, pa, b, pb }) => `¡Tranque! Puntos — ${a}: ${pa}, ${b}: ${pb}`,
  'teamWinsMatch': ({ team }) => `¡${team} gana la partida!`,
  'youWinMatch': '¡Ganaste la partida!',
  'youLoseMatch': 'Perdiste la partida',
  'matchSub': ({ a, b, n }) => `${a} a ${b} · ${n} manos`,
  'tieTitle': 'Tranque — empate',
  'tieSub': ({ n }) => `Los dos equipos tienen ${n} puntos. Nadie suma.`,
  'lastRound': ({ sub, how }) => `${sub} · última mano: ${how}`,
  'outCheck': 'sin fichas ✓',
  'rematch': 'Revancha',
  'changeSeats': 'Cambiar asientos',
  'nextRound': 'Siguiente mano',
  'seeBoard': 'Ver mesa',

  // Server error messages arrive in English.
  'Round is over': 'La mano terminó',
  'Not your turn': 'No es tu turno',
  'You do not have that tile': 'No tienes esa ficha',
  'That tile does not fit there': 'Esa ficha no va ahí',
  'You have a tile to play': 'Tienes una ficha para jugar',
};

const dicts = { en, es };
export const LANGS = Object.keys(dicts);

const detect = () => {
  const saved = localStorage.getItem('domino.lang');
  if (dicts[saved]) return saved;
  const pref = (navigator.languages ?? [navigator.language]).map((l) => l?.slice(0, 2));
  return pref.find((l) => dicts[l]) ?? 'en';
};

export let lang = detect();

export function t(key, params = {}) {
  const v = dicts[lang][key] ?? en[key] ?? key;
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
