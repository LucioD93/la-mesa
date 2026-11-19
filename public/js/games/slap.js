// Irish Snap (manotazo) on the client, besides its table (../slap.js): its name, its icon in the menu
// of games, its strings and its rules. Keep the rules in step with server/games/slap.js.
import { cardHTML } from '../cards.js';

export const name = { en: 'Irish Snap', es: 'Manotazo' };
export const desc = {
  en: 'Flip, count, slap: the last hand takes the stack',
  es: 'Voltea, cuenta y manotea: la última mano se lleva la pila',
};

export const icon = () => `${cardHTML([3, 'e'], 'under')}${cardHTML([3, 'c'])}<span class="pig">🖐️</span>`;

// Irish Snap (manotazo) has no teams: its round result names a player.
export const strings = {
  en: {
    'round': ({ n }) => `Round ${n}`,
    'noRounds': 'No rounds yet',
    'rules': 'Flip your top card onto the stack while the count goes 1 to 7, sota, caballo, rey and round again. When the card is the number called, slap the stack: the last hand down takes it. Slapping any other card takes it too. Run out of cards, then live through the next slap, and you win the round. The book icon has the full rules.',
    'shareTitle': 'Play Irish Snap with me',
    'shareText': 'Join my Irish Snap match',
    'figure.10': 'Sota',
    'figure.11': 'Caballo',
    'figure.12': 'Rey',
    'called': 'Called',
    'nextCall': 'Next',
    'slap': 'Slap!',
    'flip': 'Flip',
    'yourPile': 'Your pile',
    'outShort': 'Out',
    'outOfCards': 'Out of cards',
    'aria.stack': ({ n }) => `The stack, ${n} cards. Slap it`,
    'aria.emptyStack': 'The stack is empty',
    'aria.pile': ({ n }) => `Your pile, ${n} cards face down. Flip the top one`,
    'slapFirst': 'Slap first!',
    'slapNow': 'SLAP!',
    'slapping': 'Everyone slaps…',
    'yourPlace': ({ n }) => `Your hand landed ${['first', 'second', 'third', 'fourth'][n - 1]}`,
    'youreOut': "You're out: slap the next match to win",
    'yourFlip': 'Your turn: flip a card',
    'youRanOut': 'Out! Now survive the next slap',
    'ranOut': 'Out of cards!',
    'falseSlap': 'False slap!',
    'lastHand': 'Last hand!',
    'backIn': 'Back in!',
    'mock.lines': [
      'That was not the number!',
      'Slapping at random?',
      'Count first, then slap',
      'Twitchy fingers',
      'The whole stack is yours now',
      'Maybe try checkers?',
    ],
    'roundOver': 'Round over',
    'stacksTaken': 'Stacks picked up',
    'takenN': ({ n }) => `${n} picked up`,
    'falseN': ({ n }) => (n === 1 ? '1 false slap' : `${n} false slaps`),
    'subOut': ({ name }) => `${name} ran out of cards and slapped in time`,
    'subAllOut': ({ name }) => `Every card went down without a match, and ${name} ran out first`,
    'howOut': ({ n }) => `out after ${n} cards`,
    'howAllOut': 'no match: first out',
    'soloMatchSub': ({ a, n }) => `First to ${a} · ${n === 1 ? '1 round' : `${n} rounds`}`,
    'lastRound': ({ sub, how }) => `${sub} · last round: ${how}`,
    'nextRound': 'Next round',
    'seeBoard': 'See table',
  },
  es: {
    'round': ({ n }) => `Mano ${n}`,
    'noRounds': 'Todavía no hay manos',
    'rules': 'Voltea tu carta de arriba sobre la pila mientras se cuenta 1 a 7, sota, caballo, rey y otra vez. Cuando la carta es el número cantado, dale el manotazo: la última mano se lleva la pila. Si manoteas otra carta, también te la llevas. Quédate sin cartas, aguanta el próximo manotazo y ganas la mano. En el ícono del libro están todas las reglas.',
    'shareTitle': 'Juega manotazo conmigo',
    'shareText': 'Únete a mi partida de manotazo',
    'figure.10': 'Sota',
    'figure.11': 'Caballo',
    'figure.12': 'Rey',
    'called': 'Cantado',
    'nextCall': 'Sigue',
    'slap': '¡Manotazo!',
    'flip': 'Voltea',
    'yourPile': 'Tu pila',
    'outShort': 'Fuera',
    'outOfCards': 'Sin cartas',
    'aria.stack': ({ n }) => `La pila, ${n} cartas. Dale el manotazo`,
    'aria.emptyStack': 'La pila está vacía',
    'aria.pile': ({ n }) => `Tu pila, ${n} cartas boca abajo. Voltea la de arriba`,
    'slapFirst': '¡Primero el manotazo!',
    'slapNow': '¡MANOTAZO!',
    'slapping': 'Todos al manotazo…',
    'yourPlace': ({ n }) => `Tu mano llegó de ${['primera', 'segunda', 'tercera', 'cuarta'][n - 1]}`,
    'youreOut': 'Sin cartas: dale al próximo manotazo y ganas',
    'yourFlip': 'Te toca: voltea una carta',
    'youRanOut': '¡Sin cartas! Ahora aguanta el próximo manotazo',
    'ranOut': '¡Sin cartas!',
    'falseSlap': '¡Manotazo en falso!',
    'lastHand': '¡De último!',
    'backIn': '¡De vuelta!',
    'mock.lines': [
      '¡Ese no era el número!',
      '¿Manoteando a lo loco?',
      'Cuenta primero, manotea después',
      '¡Qué mano tan nerviosa!',
      'Toda la pila es tuya',
      'Mejor juega metras',
    ],
    'roundOver': 'Mano terminada',
    'stacksTaken': 'Pilas recogidas',
    'takenN': ({ n }) => (n === 1 ? '1 recogida' : `${n} recogidas`),
    'falseN': ({ n }) => (n === 1 ? '1 en falso' : `${n} en falso`),
    'subOut': ({ name }) => `${name} se quedó sin cartas y manoteó a tiempo`,
    'subAllOut': ({ name }) => `Todas las cartas salieron sin pegar, y ${name} se quedó sin cartas primero`,
    'howOut': ({ n }) => `sin cartas tras ${n} volteadas`,
    'howAllOut': 'sin pegue: el primero sin cartas',
    'soloMatchSub': ({ a, n }) => `A ${a} · ${n === 1 ? '1 mano' : `${n} manos`}`,
    'lastRound': ({ sub, how }) => `${sub} · última mano: ${how}`,
    'nextRound': 'Siguiente mano',
    'seeBoard': 'Ver mesa',
  },
};

// The server's errors only this game sends. They arrive in English.
export const errors = {
  es: {
    'Slap first': 'Primero el manotazo',
    'You already slapped': 'Ya diste tu manotazo',
  },
};

// The full rules, for the rules sheet.
export const rules = {
  en: [
    { h: 'The game', items: [
      'Irish Snap, or manotazo. 40-card Spanish deck, every player for themselves: no teams.',
      'The whole deck is dealt face down, 10 each. Nobody ever sees their own cards.',
      'The round winner scores 1. You pick how many rounds to win (1, 3 or 5) in the lobby.',
    ] },
    { h: 'The count', items: [
      'Turns go round the table. On your turn, tap your pile to flip its top card onto the stack in the middle, blind.',
      'Each card calls the next number of the count: 1, 2, 3, 4, 5, 6, 7, then sota (10), caballo (11), rey (12), and back to 1.',
      'The table shows the number called for the top card, and the next one once the stack has been taken.',
    ] },
    { h: 'Slap!', items: [
      'When the card flipped is the number just called, everyone slaps the stack: tap it, or the Slap button, or press space.',
      'The last hand down takes the whole stack, turns it over and puts it under their pile. The server decides the order the slaps arrive in.',
      'You have 3 seconds. Once three hands are down the fourth is last anyway. If two or more never slap, the stack goes to the first of them in turn from whoever flipped.',
      'Then the count starts again from 1 with whoever was next after the player who flipped, as if nobody had slapped.',
      'Slapping a card that is not the number called is a false slap: you take the stack, the table laughs at you, and the count starts again from the player after whoever flipped.',
      'Bots slap too. They wait for the card to show on everyone\'s screen, react in about half a second to a second, and now and then they look away, or get fooled.',
    ] },
    { h: 'Running out', items: [
      'With no cards left you are out, and your turns are skipped.',
      'You still have to slap the next match. Get there in time and you win the round. Be last (or slap wrongly) and you pick up the stack and you are back in.',
      'If two players are out at the same slap and both get a hand down in time, the first hand down wins.',
      'If every card goes down without a match, whoever ran out first wins the round.',
    ] },
    { h: 'House rules', items: [
      'Only the count calls for a slap. Snap, where a card matching the one under it also calls for one, is off.',
    ] },
  ],
  es: [
    { h: 'El juego', items: [
      'Manotazo (Irish Snap en inglés). Baraja española de 40 cartas, cada quien por su cuenta: no hay equipos.',
      'Se reparte toda la baraja boca abajo, 10 cartas a cada uno. Nadie ve nunca sus propias cartas.',
      'Quien gana la mano suma 1. Se elige en la sala a cuántas manos se juega (1, 3 o 5).',
    ] },
    { h: 'La cuenta', items: [
      'Se juega por turnos alrededor de la mesa. En tu turno, toca tu pila para voltear la carta de arriba sobre la pila del medio, sin verla.',
      'Cada carta canta el siguiente número de la cuenta: 1, 2, 3, 4, 5, 6, 7, luego sota (10), caballo (11), rey (12), y otra vez 1.',
      'La mesa muestra el número cantado para la carta de arriba, y el siguiente cuando alguien se llevó la pila.',
    ] },
    { h: '¡Manotazo!', items: [
      'Cuando la carta volteada es el número que se acaba de cantar, todos le dan el manotazo a la pila: tócala, o el botón de manotazo, o la barra espaciadora.',
      'La última mano que llega se lleva toda la pila, la voltea y la pone debajo de la suya. El servidor decide en qué orden llegan los manotazos.',
      'Tienes 3 segundos. Con tres manos encima, la cuarta es la última de todas formas. Si dos o más no manotean, la pila es para el primero de ellos contando desde quien volteó.',
      'Después, la cuenta empieza otra vez desde 1 con quien seguía después del que volteó, como si nadie hubiera manoteado.',
      'Manotear una carta que no es el número cantado es un manotazo en falso: te llevas la pila, la mesa se ríe de ti, y la cuenta sigue con el jugador después del que volteó.',
      'Los bots también manotean. Esperan a que la carta se vea en todas las pantallas, reaccionan en medio segundo a un segundo, y de vez en cuando se distraen o se dejan engañar.',
    ] },
    { h: 'Quedarse sin cartas', items: [
      'Sin cartas quedas fuera, y se salta tu turno.',
      'Igual tienes que darle al próximo manotazo. Si llegas a tiempo, ganas la mano. Si llegas de último (o manoteas en falso), te llevas la pila y vuelves a jugar.',
      'Si dos jugadores están fuera en el mismo manotazo y los dos llegan a tiempo, gana la primera mano que llegó.',
      'Si todas las cartas salen sin que ninguna pegue, gana quien se quedó sin cartas primero.',
    ] },
    { h: 'Reglas de la casa', items: [
      'Solo la cuenta pide manotazo. La variante en que también se manotea cuando una carta es igual a la de abajo está apagada.',
    ] },
  ],
};
