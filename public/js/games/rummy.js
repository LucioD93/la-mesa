// Rummy on the client, besides its table (../rummy.js): its name, its icon in the menu
// of games, its strings and its rules. Keep the rules in step with server/games/rummy.js.
import { cardSVG as frenchSVG } from '../french.js';

export const name = { en: 'Rummy', es: 'Rummy' };
export const desc = {
  en: 'Melds in pairs, with a French deck',
  es: 'Combinaciones en parejas, con baraja francesa',
};

export const icon = () => `<span class="card under">${frenchSVG([7, 'H'])}</span><span class="card">${frenchSVG([1, 'S'])}</span>`;

// Strings that differ from the shared ones while this game is on the table.
export const strings = {
  en: {
    'aria.card': ({ card }) => card,
    'round': ({ n }) => `Round ${n}`,
    'noRounds': 'No rounds yet',
    'rules': 'Draw, meld sets (3 or 4 of a rank) and runs (3 or more in a row of one suit), lay off on any meld, then discard. A round scores what your team melded less what both of you still hold. The book icon has the full rules.',
    'shareTitle': 'Play rummy with me',
    'shareText': 'Join my rummy match',
    'dealer': 'Dealer',
    'dealerTag': 'D',
    'drawDeck': 'Draw from deck',
    'takeDiscard': ({ card }) => `Take ${card}`,
    'meld': 'Meld',
    'discardIt': ({ card }) => `Discard ${card}`,
    'sortRank': 'Sort by rank',
    'sortSuit': 'Sort by suit',
    'discardPile': 'Discard pile',
    'melded': 'Melded',
    'inHand': 'in hand',
    'noMelds': 'Melds go here. Anyone can lay off on any of them.',
    'cardsLeft': 'Cards in hand',
    'drawPrompt': 'Your turn: draw a card',
    'playPrompt': 'Meld, lay off, discard',
    'drawFirst': 'Draw a card first',
    'alreadyDrew': 'You already drew. Now meld or discard',
    'justTook': 'You just took that card. Discard another one',
    'pickOne': 'Pick one card from your hand first',
    'dropHint': 'Drop it on the discard pile or on a meld',
    'tookDiscard': ({ name, card }) => `${name} takes the ${card}`,
    'rummyOut': '¡Rummy!',
    'wentOut': ({ name }) => `${name} went out`,
    'deckOut': 'The deck ran out',
    'outCheck': 'out ✓',
    'histOut': ({ name }) => `${name} out`,
    'histDeck': 'Deck ran out',
    'roundOver': 'Round over',
    'mock.lines': [
      'That is not a meld, genius',
      'Do you know how to count?',
      'Those cards? Really?',
      'Bold move. Also illegal.',
      'Your partner just sighed',
      'Maybe try checkers?',
    ],
    'matchSub': ({ a, b, n }) => `${a} to ${b} · ${n === 1 ? '1 round' : `${n} rounds`}`,
    'tieTitle': 'Even round',
    'tieSub': ({ n }) => `Both teams scored ${n}.`,
    'nextRound': 'Next round',
    'seeBoard': 'See table',
  },
  es: {
    'aria.card': ({ card }) => card,
    'round': ({ n }) => `Mano ${n}`,
    'noRounds': 'Todavía no hay manos',
    'rules': 'Roba, baja tríos (3 o 4 del mismo número) y escaleras (3 o más seguidas de una pinta), pega en cualquier combinación y descarta. La mano suma lo que bajó tu equipo menos lo que les queda a los dos en la mano. En el ícono del libro están todas las reglas.',
    'shareTitle': 'Juega rummy conmigo',
    'shareText': 'Únete a mi partida de rummy',
    'dealer': 'Reparte',
    'dealerTag': 'R',
    'drawDeck': 'Robar del mazo',
    'takeDiscard': ({ card }) => `Tomar ${card}`,
    'meld': 'Bajar',
    'discardIt': ({ card }) => `Descartar ${card}`,
    'sortRank': 'Ordenar por número',
    'sortSuit': 'Ordenar por pinta',
    'discardPile': 'Pila de descarte',
    'melded': 'Bajado',
    'inHand': 'en mano',
    'noMelds': 'Aquí van las combinaciones. Cualquiera puede pegar en cualquiera.',
    'cardsLeft': 'Cartas en la mano',
    'drawPrompt': 'Tu turno: roba una carta',
    'playPrompt': 'Baja, pega, descarta',
    'drawFirst': 'Primero roba una carta',
    'alreadyDrew': 'Ya robaste. Ahora baja o descarta',
    'justTook': 'Acabas de tomar esa carta. Descarta otra',
    'pickOne': 'Primero elige una carta de tu mano',
    'dropHint': 'Suéltala en la pila de descarte o en una combinación',
    'tookDiscard': ({ name, card }) => `${name} toma el ${card}`,
    'rummyOut': '¡Rummy!',
    'wentOut': ({ name }) => `${name} se quedó sin cartas`,
    'deckOut': 'Se acabó el mazo',
    'outCheck': 'sin cartas ✓',
    'histOut': ({ name }) => `${name} cerró`,
    'histDeck': 'Se acabó el mazo',
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
    'tieTitle': 'Mano pareja',
    'tieSub': ({ n }) => `Los dos equipos sumaron ${n}.`,
    'nextRound': 'Siguiente mano',
    'seeBoard': 'Ver mesa',
  },
};

// The server's errors only this game sends. They arrive in English.
export const errors = {
  es: {
    'Draw a card first': 'Primero roba una carta',
    'Draw from the deck or the discard pile': 'Roba del mazo o de la pila de descarte',
    'The discard pile is empty': 'La pila de descarte está vacía',
    'That is not a meld': 'Eso no es una combinación',
    'There is no such meld': 'Esa combinación no existe',
    'That card does not fit there': 'Esa carta no va ahí',
    'You just took that card': 'Acabas de tomar esa carta',
  },
};

// The full rules, for the rules sheet.
export const rules = {
  en: [
    { h: 'The game', items: [
      'One 52-card deck, no jokers, 7 cards each, 2 vs 2. Partners sit across from each other and score as a team.',
      'One card starts the discard pile face up. The player after the dealer goes first, and the deal rotates every round.',
      'First team to the target wins. You pick 150 or 300 in the lobby.',
    ] },
    { h: 'Your turn', items: [
      'Draw: the top card of the deck, or the top card of the discard pile.',
      'Then, as many times as you like: meld cards from your hand, or lay off a card on any meld on the table, yours, your partner\'s or the other team\'s.',
      'Discard one card to end your turn. A card you just took from the discard pile cannot go straight back.',
      'Tap cards to pick them, then use the buttons. You can also drag a card onto the discard pile or onto a meld. Drag cards along your hand to arrange it.',
    ] },
    { h: 'Melds', items: [
      'Set: 3 or 4 cards of the same rank.',
      'Run: 3 or more cards in a row of the same suit. The ace goes below the 2 (A-2-3) or above the king (Q-K-A), but a run does not turn the corner (K-A-2).',
      'Trying a meld or a lay-off that is not legal plays nothing, and the table laughs at you.',
    ] },
    { h: 'Ending a round', items: [
      'The round ends when someone runs out of cards, by melding, laying off or discarding the last one, or when the deck runs out after a discard.',
    ] },
    { h: 'Scoring', items: [
      'Cards are worth 5 (2 to 9), 10 (10, J, Q, K) and 15 (ace). An ace at the bottom of a run, A-2-3, is worth 1.',
      'Each team scores the cards it melded and laid off, less the cards still in both partners\' hands. A round can cost you points.',
    ] },
    { h: 'House rules', items: [
      'Rummy has many versions. Not included here: jokers or wild cards, picking up deeper into the discard pile, and a bonus for going out.',
    ] },
  ],
  es: [
    { h: 'El juego', items: [
      'Una baraja francesa de 52 cartas, sin comodines, 7 cartas cada uno, 2 contra 2. Los compañeros se sientan enfrente y suman en equipo.',
      'Una carta boca arriba empieza la pila de descarte. Sale el jugador después del que reparte, y el reparto rota cada mano.',
      'Gana el primer equipo que llegue a la meta. Se elige 150 o 300 en la sala.',
    ] },
    { h: 'Tu turno', items: [
      'Roba: la carta de arriba del mazo, o la de arriba de la pila de descarte.',
      'Luego, todas las veces que quieras: baja cartas de tu mano, o pega una carta en cualquier combinación de la mesa, tuya, de tu compañero o del otro equipo.',
      'Descarta una carta para terminar tu turno. Una carta que acabas de tomar del descarte no puede volver enseguida.',
      'Toca las cartas para elegirlas y usa los botones. También puedes arrastrar una carta a la pila de descarte o a una combinación. Arrastra cartas dentro de tu mano para ordenarla.',
    ] },
    { h: 'Combinaciones', items: [
      'Trío: 3 o 4 cartas del mismo número.',
      'Escalera: 3 o más cartas seguidas de la misma pinta. El as va antes del 2 (A-2-3) o después del rey (Q-K-A), pero la escalera no da la vuelta (K-A-2).',
      'Si intentas bajar o pegar algo que no vale, no se juega, y la mesa se ríe de ti.',
    ] },
    { h: 'Cómo termina la mano', items: [
      'La mano termina cuando alguien se queda sin cartas, bajando, pegando o descartando la última, o cuando se acaba el mazo después de un descarte.',
    ] },
    { h: 'Puntos', items: [
      'Las cartas valen 5 (del 2 al 9), 10 (10, J, Q, K) y 15 (el as). Un as al principio de una escalera, A-2-3, vale 1.',
      'Cada equipo suma las cartas que bajó y pegó, menos las que les quedan en la mano a los dos compañeros. Una mano puede restar puntos.',
    ] },
    { h: 'Reglas de la casa', items: [
      'El rummy tiene muchas versiones. No se incluyen comodines, tomar cartas más abajo en la pila de descarte, ni un premio por cerrar.',
    ] },
  ],
};
