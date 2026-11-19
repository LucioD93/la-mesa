// All Fives on the client, besides its table (../fives.js): its name, its icon in the menu
// of games, its strings and its rules. Keep the rules in step with server/games/fives.js.
import { tileHTML } from '../tiles.js';
import { strings as domino } from './domino.js';

export const name = { en: 'All Fives', es: 'Dominó a los cinco' };
export const desc = {
  en: 'Dominoes that score when the ends add up to 5s',
  es: 'Dominó que suma cuando las puntas dan múltiplos de 5',
};

export const icon = () => `<span class="tile v">${tileHTML(5, 5, false)}</span><span class="five">5</span>`;

// All Fives is dominoes with points on the ends: the domino table's strings, plus its own.
export const strings = {
  en: {
    ...domino.en,
    'rules':
      'Dominoes, scored as you play. After each tile, if the open ends add up to a multiple of 5, your team scores that sum; a double on an end counts both halves. The first double is the spinner: once both its long sides are taken, tiles go above and below it too. Going out scores the other team\'s pips, rounded to the nearest 5. The first team to the target wins on the spot.',
    'shareTitle': 'Play All Fives with me',
    'shareText': 'Join my All Fives domino match',
    'ends': ({ n }) => `Ends: ${n}`,
    'scored': ({ team, n }) => `${team} +${n}`,
    'onTheEnds': 'Points on the ends',
    'outBonus': 'Going out: their pips, to the nearest 5',
    'blockBonus': 'Blocked: their pips, to the nearest 5',
    'youReach': 'You reach the target!',
    'reaches': ({ name }) => `${name} reaches the target!`,
    'histTarget': ({ name }) => `${name} to the target`,
    'tieSub': ({ n }) => `Both teams have ${n} pips. No bonus.`,
  },
  es: {
    ...domino.es,
    'rules':
      'Dominó que suma mientras se juega. Después de cada ficha, si las puntas abiertas suman un múltiplo de 5, tu equipo se anota esa suma; un doble en una punta cuenta sus dos mitades. El primer doble es la cruz: cuando tiene fichas por sus dos lados largos, también se juega arriba y abajo de él. Quien domina suma los puntos del otro equipo, redondeados al 5 más cercano. El primer equipo en llegar a la meta gana en el acto.',
    'shareTitle': 'Juega dominó a los cinco conmigo',
    'shareText': 'Únete a mi partida de dominó a los cinco',
    'ends': ({ n }) => `Puntas: ${n}`,
    'scored': ({ team, n }) => `${team} +${n}`,
    'onTheEnds': 'Puntos en las puntas',
    'outBonus': 'Dominó: sus puntos, al 5 más cercano',
    'blockBonus': 'Tranque: sus puntos, al 5 más cercano',
    'youReach': '¡Llegaste a la meta!',
    'reaches': ({ name }) => `¡${name} llegó a la meta!`,
    'histTarget': ({ name }) => `${name} a la meta`,
    'tieSub': ({ n }) => `Los dos equipos tienen ${n} puntos. Nadie suma el premio.`,
  },
};

// The full rules, for the rules sheet.
export const rules = {
  en: [
    { h: 'The game', items: [
      'Dominoes with the same set and deal: double six, 7 tiles each, no boneyard, partners across from each other.',
      'Points come as you play. The first team to the target wins on the spot, even mid-round. You pick 100, 150 or 250 in the lobby.',
    ] },
    { h: 'Your turn', items: [
      'In the first round, whoever holds the double six opens with it. After that the opener rotates to the right and can open with any tile.',
      'Match one of the open ends. With no legal move, the game passes for you after 3 seconds.',
    ] },
    { h: 'The spinner', items: [
      'The first double played is the spinner, whether it opens or comes later.',
      'Once tiles are on both of its long sides, its other two sides open too: drag a tile above or below it. The table can then have four ends.',
    ] },
    { h: 'Scoring on the ends', items: [
      'After each tile, add up the open ends. If the sum is a multiple of 5 (5, 10, 15, 20…), your team scores it.',
      'A double on an end counts both halves: the 4-4 on an end counts 8.',
      'The spinner\'s other sides count once a tile is on them, and the spinner stops counting once both its long sides are taken.',
      'The opening tile counts its pips: opening with the 5-5 or the 6-4 scores 10, and the 5-0 scores 5.',
    ] },
    { h: 'Ending a round', items: [
      'Domino: the player who empties their hand wins for their team, which also scores the pips left in the other team\'s hands, rounded to the nearest 5 (7 is 5, 8 is 10).',
      'Tranque (blocked game): the team with fewer pips scores the other team\'s pips, rounded the same way. A tie adds nothing.',
    ] },
  ],
  es: [
    { h: 'El juego', items: [
      'Dominó con el mismo juego y reparto: doble seis, 7 fichas cada uno, sin pozo, compañeros enfrente.',
      'Los puntos llegan mientras se juega. El primer equipo en llegar a la meta gana en el acto, aunque sea a mitad de mano. Se elige 100, 150 o 250 en la sala.',
    ] },
    { h: 'Tu turno', items: [
      'En la primera mano sale quien tenga el doble seis, y sale con él. Después la salida rota a la derecha y se puede salir con cualquier ficha.',
      'Pega con una de las puntas abiertas. Si no tienes jugada, el juego pasa por ti a los 3 segundos.',
    ] },
    { h: 'La cruz', items: [
      'El primer doble que se juega es la cruz (el spinner), sea la salida o venga después.',
      'Cuando tiene fichas por sus dos lados largos, se abren también los otros dos: arrastra una ficha arriba o abajo de él. La mesa puede tener entonces cuatro puntas.',
    ] },
    { h: 'Puntos en las puntas', items: [
      'Después de cada ficha, se suman las puntas abiertas. Si la suma es múltiplo de 5 (5, 10, 15, 20…), tu equipo se la anota.',
      'Un doble en una punta cuenta sus dos mitades: el 4-4 en una punta cuenta 8.',
      'Los otros lados de la cruz cuentan cuando tienen una ficha, y la cruz deja de contar cuando tiene fichas por sus dos lados largos.',
      'La ficha de salida cuenta sus puntos: salir con el 5-5 o el 6-4 da 10, y el 5-0 da 5.',
    ] },
    { h: 'Cómo termina la mano', items: [
      'Dominó: quien se quede sin fichas gana para su equipo, que además suma los puntos que le quedan al otro equipo, redondeados al 5 más cercano (7 es 5, 8 es 10).',
      'Tranque: el equipo con menos puntos suma los del otro, redondeados igual. Si empatan, nadie suma.',
    ] },
  ],
};
