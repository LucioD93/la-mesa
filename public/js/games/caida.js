// Caída on the client, besides its table (../caida.js): its name, its icon in the menu
// of games, its strings and its rules. Keep the rules in step with server/games/caida.js.
import { cardHTML, SUITS_EN, SUITS_ES } from '../cards.js';

export const name = { en: 'Caída', es: 'Caída' };
export const desc = {
  en: 'Capture cards and sing rondas',
  es: 'Recoge cartas y canta rondas',
};

export const icon = () => cardHTML([7, 'c'], 'under') + cardHTML([1, 'o']);

// The cantos are sung in Spanish in both languages.
const cantos = {
  'canto.ronda': '¡Ronda!',
  'canto.trivilin': '¡Trivilín!',
  'canto.patrulla': '¡Patrulla!',
  'canto.vigia': '¡Vigía!',
  'canto.registro': '¡Registro!',
};

// Strings that differ from the shared ones while this game is on the table.
export const strings = {
  en: {
    ...cantos,
    'aria.card': ({ n, suit }) => `${n} of ${SUITS_EN[suit]}`,
    'round': ({ n }) => `Round ${n}`,
    'noRounds': 'No rounds yet',
    'rules': 'Play a card to take the same number from the table and whatever follows it in sequence. Caída: taking the card just played. Mesa limpia: clearing the table. First team to the target wins. The book icon has the full rules.',
    'shareTitle': 'Play caída with me',
    'shareText': 'Join my caída match',
    'dealer': 'Dealer',
    'dealerTag': 'D',
    'pickOrder': 'Call the count for the table',
    'dealing': ({ name }) => `${name} is dealing`,
    'dealOf': ({ n }) => `Deal ${n} of 3`,
    'cardsTaken': 'Cards',
    'singCanto': ({ canto }) => `You have ${canto} Sing it before your first card`,
    'caida': '¡Caída!',
    'mesaLimpia': '¡Mesa limpia!',
    'caidaMesa': '¡Caída y mesa limpia!',
    'roundOver': 'Round over',
    'dragHint': 'Drag the card onto the table',
    'mock.lines': [
      'You forgot to sing!',
      'A canto, and you kept quiet?',
      'Your partner just sighed',
      'Those points are gone, genius',
      'Sing it next time',
      'Maybe try checkers?',
    ],
    'matchSub': ({ a, b, n }) => `${a} to ${b} · ${n === 1 ? '1 round' : `${n} rounds`}`,
    'tieTitle': 'Even round',
    'tieSub': ({ n }) => `Both teams scored ${n}.`,
    'award.table': 'Table count',
    'award.mala': 'Mala echada',
    'award.ronda': 'Ronda',
    'award.trivilin': 'Trivilín',
    'award.patrulla': 'Patrulla',
    'award.vigia': 'Vigía',
    'award.registro': 'Registro',
    'award.caida': 'Caída',
    'award.mesa': 'Mesa limpia',
    'award.cards': ({ a, b }) => `Cards ${a} to ${b}`,
    'nextRound': 'Next round',
    'seeBoard': 'See table',
  },
  es: {
    ...cantos,
    'aria.card': ({ n, suit }) => `${n} de ${SUITS_ES[suit]}`,
    'round': ({ n }) => `Mano ${n}`,
    'noRounds': 'Todavía no hay manos',
    'rules': 'Juega una carta para llevarte el mismo número de la mesa y las que le siguen. Caída: llevarte la carta recién jugada. Mesa limpia: dejar la mesa vacía. Gana el primer equipo que llegue a la meta. En el ícono del libro están todas las reglas.',
    'shareTitle': 'Juega caída conmigo',
    'shareText': 'Únete a mi partida de caída',
    'dealer': 'Reparte',
    'dealerTag': 'R',
    'pickOrder': 'Canta la cuenta de la mesa',
    'dealing': ({ name }) => `${name} está repartiendo`,
    'dealOf': ({ n }) => `Reparto ${n} de 3`,
    'cardsTaken': 'Cartas',
    'singCanto': ({ canto }) => `Tienes ${canto} Cántalo antes de tu primera carta`,
    'caida': '¡Caída!',
    'mesaLimpia': '¡Mesa limpia!',
    'caidaMesa': '¡Caída y mesa limpia!',
    'roundOver': 'Mano terminada',
    'dragHint': 'Arrastra la carta a la mesa',
    'mock.lines': [
      '¡Se te olvidó cantar, mi pana!',
      '¿Con canto y calladito?',
      'Tu compañero acaba de suspirar',
      '¡Ponte las pilas!',
      'Eso se canta, chamo',
      'Mejor juega metras',
    ],
    'matchSub': ({ a, b, n }) => `${a} a ${b} · ${n === 1 ? '1 mano' : `${n} manos`}`,
    'tieTitle': 'Mano pareja',
    'tieSub': ({ n }) => `Los dos equipos sumaron ${n}.`,
    'award.table': 'Cuenta de la mesa',
    'award.mala': 'Mala echada',
    'award.ronda': 'Ronda',
    'award.trivilin': 'Trivilín',
    'award.patrulla': 'Patrulla',
    'award.vigia': 'Vigía',
    'award.registro': 'Registro',
    'award.caida': 'Caída',
    'award.mesa': 'Mesa limpia',
    'award.cards': ({ a, b }) => `Cartas ${a} a ${b}`,
    'nextRound': 'Siguiente mano',
    'seeBoard': 'Ver mesa',
    'score': 'Piedras',
  },
};

// The server's errors only this game sends. They arrive in English.
export const errors = {
  es: {
    'You cannot sing now': 'Ahora no puedes cantar',
    'Unknown order': 'Esa cuenta no existe',
  },
};

// The full rules, for the rules sheet.
export const rules = {
  en: [
    { h: 'The game', items: [
      '40-card Spanish deck, 2 vs 2. Points land as they happen, and the first team to the target (12 or 24) wins on the spot, even mid-round.',
      'A round is the table, then three deals of 3 cards each. That uses the whole deck.',
    ] },
    { h: 'The table', items: [
      'The dealer calls the count, 1 → 4 or 4 → 1, and lays 4 cards face up.',
      'A card that lands on its own number scores that number for the dealer: a 2 on spot 2 is +2.',
      'Mala echada: no card on its number gives the other team +1.',
      'A number already on the table goes back in the deck and another card is laid.',
    ] },
    { h: 'Cantos', items: [
      'Sing on your turn, before your first card of each deal. If you play without singing, the points are gone.',
      'Ronda (a pair and a card not next to it, like 6-6-3): 1 for 1 to 7, 2 for 10s, 3 for 11s, 4 for 12s.',
      'Trivilín (three of a kind): 5.',
      'Patrulla (three in a row, like 5-6-7 or 7-10-11; 12 and 1 are not in a row): 6.',
      'Vigía (a pair and the number next to it, like 3-3-4 or 7-7-10): 7.',
      'Registro (1, 11 and 12): 8.',
      'Once everyone has played a card from the deal, only the best canto at the table pays. Between two of the same, the higher cards win (a ronda\'s pair, then its third card), and then whoever sits closer to the dealer\'s right.',
    ] },
    { h: 'Playing', items: [
      'Play one card. If its number is on the table you take it, plus any cards that follow in sequence: a 5 takes the 5, then the 6, the 7, the 10 and so on until there is a gap.',
      'Capturing is automatic. With no match, your card stays on the table.',
      'Caída: taking the card the player before you just played. 1 for 1 to 7, 2 for a 10, 3 for an 11, 4 for a 12.',
      'Mesa limpia: taking every card on the table. +4, on top of any caída. It doesn\'t count in the last deal.',
    ] },
    { h: 'End of the round', items: [
      'Whoever captured last takes whatever is left on the table.',
      'The team with more cards scores 1 for each card above 20.',
    ] },
    { h: 'House rules', items: [
      'Caída rules vary by table. Not included here: registrico, casa chica and casa grande, a trivilín that wins the game, a caída that kills the rival\'s canto, bluffing a canto, and soplo (claiming a capture someone missed, which cannot happen because captures are automatic).',
    ] },
  ],
  es: [
    { h: 'El juego', items: [
      'Baraja española de 40 cartas, 2 contra 2. Los puntos se suman al momento, y el primer equipo que llegue a la meta (12 o 24) gana ahí mismo, aunque la mano no haya terminado.',
      'Una mano es la mesa y luego tres repartos de 3 cartas cada uno. Así se acaba la baraja.',
    ] },
    { h: 'La mesa', items: [
      'El que reparte canta la cuenta, 1 → 4 o 4 → 1, y pone 4 cartas boca arriba.',
      'Una carta que cae en su número le da ese número al que reparte: un 2 en el puesto 2 son +2.',
      'Mala echada: si ninguna carta cae en su número, +1 para el otro equipo.',
      'Un número que ya está en la mesa vuelve a la baraja y se echa otra carta.',
    ] },
    { h: 'Cantos', items: [
      'Se canta en tu turno, antes de tu primera carta de cada reparto. Si juegas sin cantar, se pierden los puntos.',
      'Ronda (un par y una carta que no le sigue, como 6-6-3): 1 del 1 al 7, 2 con los 10, 3 con los 11, 4 con los 12.',
      'Trivilín (tres iguales): 5.',
      'Patrulla (tres seguidas, como 5-6-7 o 7-10-11; el 12 y el 1 no son seguidas): 6.',
      'Vigía (un par y la que le sigue o la anterior, como 3-3-4 o 7-7-10): 7.',
      'Registro (1, 11 y 12): 8.',
      'Cuando todos jugaron una carta del reparto, solo paga el mejor canto de la mesa. Entre dos iguales ganan las cartas más altas (en la ronda, el par y luego la tercera), y después el que esté más cerca a la derecha del que reparte.',
    ] },
    { h: 'El juego de cartas', items: [
      'Juega una carta. Si su número está en la mesa te lo llevas, y también las que le siguen: un 5 se lleva el 5, luego el 6, el 7, el 10 y así hasta que falte uno.',
      'Se recoge solo. Si no pega con nada, tu carta se queda en la mesa.',
      'Caída: llevarte la carta que acaba de jugar el anterior. 1 del 1 al 7, 2 con un 10, 3 con un 11, 4 con un 12.',
      'Mesa limpia: llevarte todas las cartas de la mesa. +4, además de la caída si la hay. No cuenta en el último reparto.',
    ] },
    { h: 'Fin de la mano', items: [
      'Quien recogió de último se lleva lo que quede en la mesa.',
      'El equipo con más cartas suma 1 por cada carta por encima de 20.',
    ] },
    { h: 'Reglas de la casa', items: [
      'La caída cambia de mesa en mesa. No se incluyen el registrico, la casa chica ni la casa grande, el trivilín que gana la partida, la caída que mata el canto del rival, cantar de mentira, ni el soplo (reclamar una recogida que alguien dejó pasar, que aquí no ocurre porque se recoge solo).',
    ] },
  ],
};
