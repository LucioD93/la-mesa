// Roba la cochina on the client, besides its table (../cochina.js): its name, its icon in the menu
// of games, its strings and its rules. Keep the rules in step with server/games/cochina.js.
import { cardHTML, SUITS_EN, SUITS_ES } from '../cards.js';

export const name = { en: 'Roba la Cochina', es: 'Roba la Cochina' };
export const desc = {
  en: 'Capture cards and steal the other pile',
  es: 'Recoge cartas y róbate la otra pila',
};

export const icon = () => `${cardHTML([5, 'b'], 'under')}${cardHTML([5, 'o'])}<span class="pig">🐷</span>`;

// Strings that differ from the shared ones while this game is on the table.
export const strings = {
  en: {
    'aria.card': ({ n, suit }) => `${n} of ${SUITS_EN[suit]}`,
    'round': ({ n }) => `Round ${n}`,
    'noRounds': 'No rounds yet',
    'rules': 'Play a card, then be quick: tap matching cards on the table and keep tapping the other team\'s cochina while its top card matches to steal more. With all of your number taken, go on to the next one: 4s, then 5s, then 6s. What you don\'t grab in time stays. The bigger cochina wins the round. The book icon has the full rules.',
    'shareTitle': 'Play roba la cochina with me',
    'shareText': 'Join my roba la cochina match',
    'dealer': 'Dealer',
    'dealerTag': 'D',
    'dealOf': ({ n }) => `Deal ${n} of 3`,
    'steals': 'Steals',
    'stole': '¡Te robé la cochina!',
    'grabNow': 'Grab them!',
    'grabbing': ({ name }) => `${name} is grabbing…`,
    'grabFirst': 'Grab your cards first',
    'tooSlow': '¡Muy lento!',
    'aria.cochina': ({ team, n }) => `${team}: cochina, ${n} cards`,
    'mock.lines': [
      'That one does not match!',
      'Grabbing at random?',
      'Your partner just sighed',
      'Look before you grab',
      'Butterfingers',
      'Maybe try checkers?',
    ],
    'roundOver': 'Round over',
    'dragHint': 'Drag the card onto the table',
    'cochinaOf': ({ team }) => `${team}: cochina`,
    'stealsOf': ({ team }) => `${team}: steals`,
    'missedOf': ({ team }) => `${team}: too slow`,
    'leftovers': ({ n }) => (n === 1 ? '1 card left on the table' : `${n} cards left on the table`),
    'matchSub': ({ a, b, n }) => `${a} to ${b} · ${n === 1 ? '1 round' : `${n} rounds`}`,
    'lastRound': ({ sub, how }) => `${sub} · last round: ${how}`,
    'tieTitle': 'Even cochinas',
    'tieSub': ({ n }) => `Both teams have ${n} cards. Nobody scores.`,
    'award.cards': ({ a, b }) => `Cochina ${a} to ${b}`,
    'nextRound': 'Next round',
    'seeBoard': 'See table',
  },
  es: {
    'aria.card': ({ n, suit }) => `${n} de ${SUITS_ES[suit]}`,
    'round': ({ n }) => `Mano ${n}`,
    'noRounds': 'Todavía no hay manos',
    'rules': 'Juega una carta y sé rápido: toca las cartas del mismo número en la mesa, y sigue tocando la cochina del otro equipo mientras su carta de arriba pegue para robar más. Con todo tu número agarrado, sigue con el siguiente: los 4, luego los 5, luego los 6. Lo que no agarres a tiempo se queda. Gana la mano la cochina más grande. En el ícono del libro están todas las reglas.',
    'shareTitle': 'Juega roba la cochina conmigo',
    'shareText': 'Únete a mi partida de roba la cochina',
    'dealer': 'Reparte',
    'dealerTag': 'R',
    'dealOf': ({ n }) => `Reparto ${n} de 3`,
    'steals': 'Robos',
    'stole': '¡Te robé la cochina!',
    'grabNow': '¡Agarra!',
    'grabbing': ({ name }) => `${name} está agarrando…`,
    'grabFirst': 'Primero agarra tus cartas',
    'tooSlow': '¡Muy lento!',
    'aria.cochina': ({ team, n }) => `${team}: cochina, ${n} cartas`,
    'mock.lines': [
      '¡Esa no pega, mi pana!',
      '¿Agarrando a lo loco?',
      'Tu compañero acaba de suspirar',
      'Mira antes de agarrar',
      '¡Manos de mantequilla!',
      'Mejor juega metras',
    ],
    'roundOver': 'Mano terminada',
    'dragHint': 'Arrastra la carta a la mesa',
    'cochinaOf': ({ team }) => `${team}: cochina`,
    'stealsOf': ({ team }) => `${team}: robos`,
    'missedOf': ({ team }) => `${team}: muy lentos`,
    'leftovers': ({ n }) => (n === 1 ? '1 carta que quedó en la mesa' : `${n} cartas que quedaron en la mesa`),
    'matchSub': ({ a, b, n }) => `${a} a ${b} · ${n === 1 ? '1 mano' : `${n} manos`}`,
    'lastRound': ({ sub, how }) => `${sub} · última mano: ${how}`,
    'tieTitle': 'Cochinas parejas',
    'tieSub': ({ n }) => `Los dos equipos tienen ${n} cartas. Nadie suma.`,
    'award.cards': ({ a, b }) => `Cochina ${a} a ${b}`,
    'nextRound': 'Siguiente mano',
    'seeBoard': 'Ver mesa',
  },
};

// The server's errors only this game sends. They arrive in English.
export const errors = {
  es: {
    'Grab your cards first': 'Primero agarra tus cartas',
    'Nothing to grab': 'No hay nada que agarrar',
    'That cochina is not yours to steal': 'Esa cochina no te la puedes robar',
    'That card does not match': 'Esa carta no pega',
  },
};

// The full rules, for the rules sheet.
export const rules = {
  en: [
    { h: 'The game', items: [
      '40-card Spanish deck, 2 vs 2. Partners share one pile, the cochina, kept face up so everyone sees its top card.',
      'A round is 4 cards on the table, then three deals of 3 cards each. That uses the whole deck.',
      'The bigger cochina wins the round and scores 1. You pick how many rounds to win (1, 3 or 5) in the lobby.',
    ] },
    { h: 'Your turn', items: [
      'Play one card. Only the number counts, never the suit.',
      'With no match, your card stays on the table for anyone to take, and the turn moves on.',
    ] },
    { h: 'Grab them!', items: [
      'If your card matches something, you have 3 seconds to grab it. A bar shows the time left, and what you can grab glows.',
      'Tap each card of that number on the table to take it onto your cochina. Your card goes on top with the first one.',
      'If your card matches the top card of the other team\'s cochina, tap it to steal that card. The next card is exposed; keep tapping while its number matches to steal more. ¡Te robé la cochina!',
      'You can take from the table and steal with the same card.',
      'Escalera: once you have every card of your number, the run goes on to the next number, on the table or on top of their cochina. Play a 4, grab all the 4s, then the 5s, then the 6s, until a number is missing. After the 7 comes the 10, and the run ends at the 12.',
      'Whatever you don\'t grab in time stays where it is, and if you grabbed nothing your card stays on the table too. Tapping something that doesn\'t match gets you laughed at.',
      'Bots grab too. They are quick, but now and then they look away.',
    ] },
    { h: 'Watch your top card', items: [
      'The card on top of your cochina is the one the rivals need. Taking with a number they might still hold puts your whole pile at risk.',
    ] },
    { h: 'End of the round', items: [
      'Whoever captured last takes whatever is left on the table.',
      'The team with more cards wins the round. Equal cochinas score nothing.',
    ] },
    { h: 'House rules', items: [
      'Roba la cochina (also roba montón) varies by table. Here partners share a cochina, you grab every card of the number yourself, against the clock, and you can never add to your own pile without capturing.',
    ] },
  ],
  es: [
    { h: 'El juego', items: [
      'Baraja española de 40 cartas, 2 contra 2. Los compañeros comparten una pila, la cochina, boca arriba para que todos vean la carta de arriba.',
      'Una mano son 4 cartas en la mesa y luego tres repartos de 3 cartas cada uno. Así se acaba la baraja.',
      'La cochina más grande gana la mano y suma 1. Se elige en la sala a cuántas manos se juega (1, 3 o 5).',
    ] },
    { h: 'Tu turno', items: [
      'Juega una carta. Solo cuenta el número, nunca el palo.',
      'Si no pega con nada, tu carta se queda en la mesa para quien se la lleve, y pasa el turno.',
    ] },
    { h: '¡Agarra!', items: [
      'Si tu carta pega con algo, tienes 3 segundos para agarrarlo. Una barra muestra el tiempo que queda, y lo que puedes agarrar brilla.',
      'Toca cada carta de ese número en la mesa para llevarla a tu cochina. Tu carta va arriba con la primera.',
      'Si tu carta pega con la de arriba de la cochina del otro equipo, tócala para robar esa carta. Queda visible la siguiente; sigue tocando mientras pegue el número para robar más. ¡Te robé la cochina!',
      'Con la misma carta puedes recoger de la mesa y robar.',
      'Escalera: cuando tengas todas las cartas de tu número, sigues con el número siguiente, en la mesa o arriba de su cochina. Juegas un 4, agarras todos los 4, luego los 5, luego los 6, hasta que falte un número. Después del 7 viene el 10, y la escalera termina en el 12.',
      'Lo que no agarres a tiempo se queda donde está, y si no agarraste nada tu carta también se queda en la mesa. Si tocas algo que no pega, la mesa se ríe de ti.',
      'Los bots también agarran. Son rápidos, pero de vez en cuando se distraen.',
    ] },
    { h: 'Cuida tu carta de arriba', items: [
      'La carta de arriba de tu cochina es la que buscan los rivales. Recoger con un número que todavía pueden tener pone en riesgo toda tu pila.',
    ] },
    { h: 'Fin de la mano', items: [
      'Quien recogió de último se lleva lo que quede en la mesa.',
      'Gana la mano el equipo con más cartas. Si las cochinas son iguales, nadie suma.',
    ] },
    { h: 'Reglas de la casa', items: [
      'Roba la cochina (o roba montón) cambia de mesa en mesa. Aquí los compañeros comparten la cochina, cada carta del número se agarra a mano y contra el reloj, y no puedes poner cartas en tu pila sin recoger.',
    ] },
  ],
};
