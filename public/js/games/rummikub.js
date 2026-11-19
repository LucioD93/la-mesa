// Rummikub on the client, besides its table (../rummikub.js): its name, its icon in the menu
// of games, its strings and its rules. Keep the rules in step with server/games/rummikub.js.
import { tileHTML as rkTileHTML } from '../rummikub-tiles.js';

// Behind a feature flag (the server's `flag`): a lobby only lists it once the server offers it,
// and the home page leaves it out.
export const flagged = true;

export const name = { en: 'Rummikub', es: 'Rummikub' };
export const desc = {
  en: 'Tiles in pairs: rearrange the whole table',
  es: 'Fichas en parejas: reacomoda toda la mesa',
};

export const icon = () => [10, 11 + 13, 104].map((id) => rkTileHTML(id)).join(''); // a black 11, a blue 12 and the joker

// Strings that differ from the shared ones while this game is on the table.
export const strings = {
  en: {
    'aria.tile': ({ n, color }) => `${color} ${n}`,
    'color.black': 'black',
    'color.blue': 'blue',
    'color.orange': 'orange',
    'color.red': 'red',
    'joker': 'Joker',
    'round': ({ n }) => `Round ${n}`,
    'noRounds': 'No rounds yet',
    'rules': 'Make groups (3 or 4 of a number, all different colors) and runs (3 or more in a row of one color). On your turn, play tiles and rearrange the whole table as you like, or draw. Your first play needs 30 points of your own. Going out scores what is left on the other team\'s racks. The book icon has the full rules.',
    'shareTitle': 'Play Rummikub with me',
    'shareText': 'Join my Rummikub match',
    'pool': 'Pool',
    'drawTile': 'Draw a tile',
    'pass': 'Pass',
    'done': 'Done',
    'undo': 'Undo',
    'toRack': 'Back to rack',
    'sortNumber': 'Sort 7 7 7',
    'sortColor': 'Sort 7 8 9',
    'newSet': '+ New set',
    'addHere': 'Move the picked tiles here',
    'noSets': 'Sets go here. On your turn, rearrange them however you like.',
    'tilesLeft': 'Tiles on the rack',
    'opened': 'Made their first play',
    'firstPrompt': 'Your turn: play 30 or more, or draw',
    'playPrompt': 'Your turn: play tiles, or draw',
    'firstCount': ({ n }) => `First play: ${n} / 30`,
    'placedCount': ({ n }) => (n === 1 ? '1 tile out. Press Done' : `${n} tiles out. Press Done`),
    'fixSets': ({ n }) => (n === 1 ? '1 set to fix before Done' : `${n} sets to fix before Done`),
    'needRack': 'Now put out a tile from your rack',
    'firstHands': 'Your first play cannot touch the table',
    'placeOne': 'Put at least one tile from your rack on the table',
    'badSets': ({ n }) => (n === 1 ? 'One set is not a group or a run' : `${n} sets are not groups or runs`),
    'firstShort': ({ n }) => `Your first play adds up to ${n}. It needs 30`,
    'undoFirst': 'Undo your moves to draw instead',
    'passes': ({ name }) => `${name} passes`,
    'rummikubOut': '¡Rummikub!',
    'wentOut': ({ name }) => `${name} went out`,
    'blocked': 'Nobody can play: the pool is empty',
    'leftOnRacks': 'left on their racks',
    'outCheck': 'out ✓',
    'histOut': ({ name }) => `${name} out`,
    'histBlocked': 'Blocked',
    'roundOver': 'Round over',
    'mock.lines': [
      'That is not a set, genius',
      'Do you know how to count?',
      'Those tiles? Really?',
      'Bold move. Also illegal.',
      'Your partner just sighed',
      'Maybe try checkers?',
    ],
    'matchSub': ({ a, b, n }) => `${a} to ${b} · ${n === 1 ? '1 round' : `${n} rounds`}`,
    'lastRound': ({ sub, how }) => `${sub} · last round: ${how}`,
    'tieTitle': 'Blocked — it’s a tie',
    'tieSub': ({ n }) => `Both teams have ${n} left. No points.`,
    'nextRound': 'Next round',
    'seeBoard': 'See table',
  },
  es: {
    'aria.tile': ({ n, color }) => `${n} ${color}`,
    'color.black': 'negro',
    'color.blue': 'azul',
    'color.orange': 'naranja',
    'color.red': 'rojo',
    'joker': 'Comodín',
    'round': ({ n }) => `Mano ${n}`,
    'noRounds': 'Todavía no hay manos',
    'rules': 'Arma grupos (3 o 4 del mismo número, todos de colores distintos) y escaleras (3 o más seguidas de un color). En tu turno, juega fichas y reacomoda toda la mesa como quieras, o roba. Tu primera jugada necesita 30 puntos tuyos. Quien se queda sin fichas suma lo que les queda en el atril al otro equipo. En el ícono del libro están todas las reglas.',
    'shareTitle': 'Juega Rummikub conmigo',
    'shareText': 'Únete a mi partida de Rummikub',
    'pool': 'Pozo',
    'drawTile': 'Robar ficha',
    'pass': 'Paso',
    'done': 'Listo',
    'undo': 'Deshacer',
    'toRack': 'Al atril',
    'sortNumber': 'Ordenar 7 7 7',
    'sortColor': 'Ordenar 7 8 9',
    'newSet': '+ Juego nuevo',
    'addHere': 'Mover aquí las fichas elegidas',
    'noSets': 'Aquí van los juegos. En tu turno, reacomódalos como quieras.',
    'tilesLeft': 'Fichas en el atril',
    'opened': 'Ya hizo su primera jugada',
    'firstPrompt': 'Tu turno: juega 30 o más, o roba',
    'playPrompt': 'Tu turno: juega fichas, o roba',
    'firstCount': ({ n }) => `Primera jugada: ${n} / 30`,
    'placedCount': ({ n }) => (n === 1 ? '1 ficha afuera. Dale a Listo' : `${n} fichas afuera. Dale a Listo`),
    'fixSets': ({ n }) => (n === 1 ? 'Falta arreglar 1 juego' : `Faltan arreglar ${n} juegos`),
    'needRack': 'Ahora saca una ficha de tu atril',
    'firstHands': 'Tu primera jugada no puede tocar la mesa',
    'placeOne': 'Pon al menos una ficha de tu atril en la mesa',
    'badSets': ({ n }) => (n === 1 ? 'Un juego no es grupo ni escalera' : `${n} juegos no son grupos ni escaleras`),
    'firstShort': ({ n }) => `Tu primera jugada suma ${n}. Necesita 30`,
    'undoFirst': 'Deshaz tus movidas para robar',
    'passes': ({ name }) => `${name} pasa`,
    'rummikubOut': '¡Rummikub!',
    'wentOut': ({ name }) => `${name} se quedó sin fichas`,
    'blocked': 'Nadie puede jugar: se acabó el pozo',
    'leftOnRacks': 'quedó en sus atriles',
    'outCheck': 'sin fichas ✓',
    'histOut': ({ name }) => `${name} cerró`,
    'histBlocked': 'Tranque',
    'roundOver': 'Mano terminada',
    'mock.lines': [
      '¿Y eso qué es, mi pana?',
      'Eso no pega ni con pega',
      '¿Tú sabes contar?',
      'Valiente, pero no va',
      'Tu compañero acaba de suspirar',
      'Mejor juega metras',
    ],
    'matchSub': ({ a, b, n }) => `${a} a ${b} · ${n === 1 ? '1 mano' : `${n} manos`}`,
    'lastRound': ({ sub, how }) => `${sub} · última mano: ${how}`,
    'tieTitle': 'Tranque — empate',
    'tieSub': ({ n }) => `A los dos equipos les quedan ${n}. Nadie suma.`,
    'nextRound': 'Siguiente mano',
    'seeBoard': 'Ver mesa',
  },
};

// The server's errors only this game sends. They arrive in English.
export const errors = {
  es: {
    'That is not a table': 'Esa mesa no vale',
    'Every tile on the table has to stay there': 'Todas las fichas de la mesa tienen que quedarse en la mesa',
    'Play at least one tile from your rack': 'Juega al menos una ficha de tu atril',
    'Every set has to be a group or a run': 'Cada juego tiene que ser un grupo o una escalera',
    'Your first play cannot touch the table': 'Tu primera jugada no puede tocar la mesa',
    'Your first play has to add up to 30': 'Tu primera jugada tiene que sumar 30',
  },
};

// The full rules, for the rules sheet.
export const rules = {
  en: [
    { h: 'The game', items: [
      '106 tiles: 1 to 13 in four colors (black, blue, orange, red), twice over, and two jokers. 14 each, 2 vs 2; partners sit across from each other and score as a team. The other 50 stay face down in the pool.',
      'The first player rotates every round.',
      'First team to the target wins. You pick 50, 100 or 200 in the lobby.',
    ] },
    { h: 'Sets', items: [
      'Group: 3 or 4 tiles of the same number, every one a different color.',
      'Run: 3 or more tiles in a row of one color. The 1 is only the bottom (1-2-3), and a run stops at 13.',
      'A joker stands in for any tile. In a run it fills a gap first, then goes on the high end, or the low end once the run reaches 13.',
    ] },
    { h: 'Your turn', items: [
      'Put tiles from your rack on the table, or draw one from the pool. Either ends your turn. With the pool empty, you pass.',
      'While you play you can rearrange the whole table: split runs, move tiles between sets, take a joker out and use it elsewhere. When you press Done every tile that was on the table must still be there, at least one tile must come from your rack, and every set must be a group or a run.',
      'Tap tiles, on your rack or the table, to pick them, then tap the + of a set, or New set, to move them there. Or drag a tile from your rack onto a set. Back to rack takes back tiles you put out this turn, and Undo puts the table back as it was. Nobody sees your moves until you press Done.',
      'A set that is not good yet shows red. Pressing Done with one still red plays nothing, and the table laughs at you.',
    ] },
    { h: 'Your first play', items: [
      'Until you have made it, you can only play new sets of your own tiles that add up to 30 or more, a joker counting as the tile it stands for. You cannot touch the table on that turn.',
      'The ✓ by a player\'s name means they have made it.',
    ] },
    { h: 'Ending a round', items: [
      'The first player to empty their rack goes out, and their team scores what is left on the other team\'s two racks: each tile its number, a joker 30.',
      'If the pool runs out and all four pass in a row, the team with less left scores what the other team has left. A tie scores nothing.',
    ] },
    { h: 'House rules', items: [
      'Rummikub is played one against one, or every player for themselves. This is a version for two teams. The others only see your new table when you press Done, and there is no turn timer: the table mocks you after two minutes instead.',
    ] },
  ],
  es: [
    { h: 'El juego', items: [
      '106 fichas: del 1 al 13 en cuatro colores (negro, azul, naranja y rojo), dos veces, y dos comodines. 14 cada uno, 2 contra 2; los compañeros se sientan enfrente y suman en equipo. Las otras 50 quedan boca abajo en el pozo.',
      'El que sale rota cada mano.',
      'Gana el primer equipo que llegue a la meta. Se elige 50, 100 o 200 en la sala.',
    ] },
    { h: 'Juegos', items: [
      'Grupo: 3 o 4 fichas del mismo número, todas de colores distintos.',
      'Escalera: 3 o más fichas seguidas de un color. El 1 solo va abajo (1-2-3), y la escalera termina en el 13.',
      'El comodín reemplaza cualquier ficha. En una escalera llena primero un hueco, después va arriba, o abajo cuando la escalera llega al 13.',
    ] },
    { h: 'Tu turno', items: [
      'Pon fichas de tu atril en la mesa, o roba una del pozo. Las dos cosas terminan tu turno. Sin pozo, pasas.',
      'Mientras juegas puedes reacomodar toda la mesa: partir escaleras, mover fichas de un juego a otro, sacar un comodín y usarlo en otro lado. Al darle a Listo, todas las fichas que estaban en la mesa tienen que seguir ahí, al menos una tiene que salir de tu atril, y cada juego tiene que ser un grupo o una escalera.',
      'Toca fichas, de tu atril o de la mesa, para elegirlas, y luego toca el + de un juego, o Juego nuevo, para moverlas ahí. O arrastra una ficha de tu atril a un juego. Al atril devuelve las fichas que sacaste en este turno, y Deshacer deja la mesa como estaba. Nadie ve tus movidas hasta que le das a Listo.',
      'Un juego que todavía no vale se ve en rojo. Si le das a Listo con uno en rojo, no se juega nada, y la mesa se ríe de ti.',
    ] },
    { h: 'Tu primera jugada', items: [
      'Hasta que la hagas, solo puedes jugar juegos nuevos con tus propias fichas que sumen 30 o más, y el comodín vale la ficha que reemplaza. En ese turno no puedes tocar la mesa.',
      'La ✓ junto al nombre de un jugador quiere decir que ya la hizo.',
    ] },
    { h: 'Cómo termina la mano', items: [
      'El primero que vacía su atril cierra, y su equipo suma lo que les queda en los dos atriles al otro equipo: cada ficha su número, el comodín 30.',
      'Si se acaba el pozo y los cuatro pasan seguidos, el equipo al que le queda menos suma lo que le queda al otro. Si empatan, nadie suma.',
    ] },
    { h: 'Reglas de la casa', items: [
      'El Rummikub se juega uno contra uno, o cada uno por su cuenta. Esta es una versión para dos equipos. Los demás solo ven tu mesa nueva cuando le das a Listo, y no hay reloj por turno: la mesa se burla de ti a los dos minutos.',
    ] },
  ],
};
