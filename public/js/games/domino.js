// Dominoes on the client, besides its table (../domino.js): its name, its icon in the menu
// of games, its strings and its rules. Keep the rules in step with server/games/domino.js.
import { tileHTML } from '../tiles.js';

export const name = { en: 'Domino', es: 'Dominó' };
export const desc = {
  en: 'Partner dominoes, double six',
  es: 'Dominó en parejas, doble seis',
};

export const icon = () => `<span class="tile v">${tileHTML(6, 3, false)}</span>`;

// Strings that differ from the shared ones while this game is on the table.
export const strings = {
  en: {
    'aria.tile': ({ a, b }) => `${a} and ${b}`,
    'tilesLeft': 'tiles left',
    'round': ({ n }) => `Round ${n}`,
    'pass': 'Pass',
    'noRounds': 'No rounds yet',
    'histOut': ({ name }) => `${name} out`,
    'histBlocked': 'Blocked',
    'histTie': 'Blocked, tie',
    'rules':
      'Partners sit across. Whoever has the double six opens the first round; after that, the opener rotates to the right each round. Going out ("domino") scores the pips left in the losing team\'s hands. If the game is blocked, the team with fewer pips wins and scores the losing team\'s pips.',
    'shareTitle': 'Play dominoes with me',
    'shareText': 'Join my domino match',
    'youPass': 'You pass',
    'passes': ({ name }) => `${name} passes`,
    'openDoubleSix': 'Open with the double six',
    'youOpen': 'You open — play any tile',
    'opens': ({ name }) => `${name} opens…`,
    'opensDoubleSix': ({ name }) => `${name} opens with the double six…`,
    'autoPass': 'No tile fits — passing…',
    'roundOver': 'Round over',
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
    'matchSub': ({ a, b, n }) => `${a} to ${b} · ${n === 1 ? '1 round' : `${n} rounds`}`,
    'tieTitle': 'Blocked — it’s a tie',
    'tieSub': ({ n }) => `Both teams have ${n} pips. No points.`,
    'lastRound': ({ sub, how }) => `${sub} · last round: ${how}`,
    'outCheck': 'out ✓',
    'nextRound': 'Next round',
    'seeBoard': 'See board',
  },
  es: {
    'aria.tile': ({ a, b }) => `${a} y ${b}`,
    'tilesLeft': 'fichas restantes',
    'round': ({ n }) => `Mano ${n}`,
    'pass': 'Paso',
    'noRounds': 'Todavía no hay manos',
    'histOut': ({ name }) => `${name} dominó`,
    'histBlocked': 'Tranque',
    'histTie': 'Tranque, empate',
    'rules':
      'Los compañeros se sientan enfrente. Quien tiene el doble seis abre la primera mano; después, la salida rota hacia la derecha en cada mano. Quien se queda sin fichas ("dominó") suma los puntos que quedan en las manos del equipo perdedor. Si el juego se tranca, gana el equipo con menos puntos y suma los del equipo perdedor.',
    'shareTitle': 'Juega dominó conmigo',
    'shareText': 'Únete a mi partida de dominó',
    'youPass': 'Pasas',
    'passes': ({ name }) => `${name} pasa`,
    'openDoubleSix': 'Abre con el doble seis',
    'youOpen': 'Abres tú — juega cualquier ficha',
    'opens': ({ name }) => `Abre ${name}…`,
    'opensDoubleSix': ({ name }) => `${name} abre con el doble seis…`,
    'autoPass': 'No tienes ficha — pasando…',
    'roundOver': 'Mano terminada',
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
    'matchSub': ({ a, b, n }) => `${a} a ${b} · ${n === 1 ? '1 mano' : `${n} manos`}`,
    'tieTitle': 'Tranque — empate',
    'tieSub': ({ n }) => `Los dos equipos tienen ${n} puntos. Nadie suma.`,
    'lastRound': ({ sub, how }) => `${sub} · última mano: ${how}`,
    'outCheck': 'sin fichas ✓',
    'nextRound': 'Siguiente mano',
    'seeBoard': 'Ver mesa',
  },
};

// The server's errors only this game sends. They arrive in English.
export const errors = {
  es: {
    'That tile does not fit there': 'Esa ficha no va ahí',
    'You have a tile to play': 'Tienes una ficha para jugar',
  },
};

// The full rules, for the rules sheet.
export const rules = {
  en: [
    { h: 'The game', items: [
      'Double-six set, 7 tiles each, no boneyard. Partners sit across from each other and play as a team.',
      'First to the target wins. You pick 50, 75 or 100 in the lobby.',
    ] },
    { h: 'Your turn', items: [
      'In the first round, whoever holds the double six opens with it. After that the opener rotates to the right and can open with any tile.',
      'Match one of the two ends of the line.',
      'With no legal move, the game passes for you after 3 seconds.',
      'Dropping a tile where it does not fit plays nothing, and the table laughs at you.',
    ] },
    { h: 'Ending a round', items: [
      'Domino: the player who empties their hand wins for their team, which scores the pips left in the other team\'s hands.',
      'Tranque (blocked game): the team with fewer pips wins and scores the other team\'s pips. A tie scores nothing.',
    ] },
  ],
  es: [
    { h: 'El juego', items: [
      'Dominó doble seis, 7 fichas cada uno, sin pozo. Los compañeros se sientan enfrente y juegan en equipo.',
      'Gana quien llegue primero a la meta. Se elige 50, 75 o 100 en la sala.',
    ] },
    { h: 'Tu turno', items: [
      'En la primera mano sale quien tenga el doble seis, y sale con él. Después la salida rota a la derecha y se puede salir con cualquier ficha.',
      'Pega con una de las dos puntas de la línea.',
      'Si no tienes jugada, el juego pasa por ti a los 3 segundos.',
      'Si sueltas una ficha donde no pega, no se juega, y la mesa se ríe de ti.',
    ] },
    { h: 'Cómo termina la mano', items: [
      'Dominó: quien se quede sin fichas gana para su equipo, que suma los puntos que le quedan al otro equipo.',
      'Tranque: gana el equipo con menos puntos y suma los del otro. Si empatan, nadie suma.',
    ] },
  ],
};
