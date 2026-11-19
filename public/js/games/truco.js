// Truco on the client, besides its table (../truco.js): its name, its icon in the menu
// of games, its strings and its rules. Keep the rules in step with server/games/truco.js.
import { cardHTML, SUITS_EN, SUITS_ES } from '../cards.js';

export const name = { en: 'Truco', es: 'Truco' };
export const desc = {
  en: 'Venezuelan, with vira, perico and perica',
  es: 'Venezolano, con vira, perico y perica',
};

export const icon = () => cardHTML([1, 'e']);

// Truco's calls stay in Spanish in both languages: nobody yells "truco" in translation.
const calls = {
  flor: '¡Flor!',
  envido: 'Envido',
  cinco: 'Cinco más',
  falta: 'Falta envido',
  truco1: '¡Truco!',
  truco2: '¡Retruco!',
  truco3: '¡Vale nueve!',
  truco4: '¡Vale juego!',
  mazo: 'Al mazo',
  quiero: 'Quiero',
  noquiero: 'No quiero',
};

// Strings that differ from the shared ones while this game is on the table.
export const strings = {
  en: {
    ...calls,
    'aria.card': ({ n, suit }) => `${n} of ${SUITS_EN[suit]}`,
    'round': ({ n }) => `Hand ${n}`,
    'noRounds': 'No hands yet',
    'rules':
      'The vira sets the suit of the perico (11) and perica (10), the two best cards; if the vira is one of them, the 12 takes its place. Then: 1 of swords, 1 of clubs, 7 of swords, 7 of coins, 3s, 2s, other 1s, 12, 11, 10, other 7s, 6, 5, 4. Best of three tricks. A hand is worth 1; truco 3, retruco 6, vale nueve 9, vale juego the game. Envido is worth 2 and flor 3 (reservada, perico and perica together, 5).',
    'shareTitle': 'Play truco with me',
    'shareText': 'Join my truco match',
    'vira': 'Vira',
    'perico': 'Perico',
    'perica': 'Perica',
    'mano': 'Mano',
    'worth': ({ n }) => `Worth ${n}`,
    'worthGame': 'Worth the game',
    'envidoPending': ({ name, stake }) => `${name} called envido (${stake}). Answer!`,
    'trucoPending': ({ name, call }) => `${name}: ${call} Answer!`,
    'youWaitAnswer': 'Waiting for an answer…',
    'waitingAnswer': ({ name }) => `Waiting for ${name}…`,
    'faltaStake': 'the falta',
    'plusTwo': 'Y envido',
    'singFlor': 'You have flor! Sing it before your first card',
    'roundOver': 'Hand over',
    'answerFirst': 'Answer the bet first',
    'dragHint': 'Drag the card onto the table',
    'parda': 'Parda!',
    'trickTo': ({ name }) => `${name} takes the trick`,
    'trickToYou': 'You take the trick',
    'mock.lines': [
      'You forgot your flor!',
      'A flor, and you kept quiet?',
      'Your partner just sighed',
      'That flor is gone, genius',
      'Sing it next time',
      'Maybe try checkers?',
    ],
    'matchSub': ({ a, b, n }) => `${a} to ${b} · ${n === 1 ? '1 hand' : `${n} hands`}`,
    'award.flor': ({ who }) => `Flor (${who})`,
    'award.reservada': ({ who }) => `Flor reservada (${who})`,
    'award.envido': ({ a, b }) => `Envido ${a} to ${b}`,
    'award.envidoRefused': 'Envido refused',
    'award.tricks': 'Hand',
    'award.truco': ({ call }) => `${call}`,
    'award.mazo': ({ call }) => `${call} (al mazo)`,
    'award.refused': ({ call }) => `${call} refused`,
    'nextRound': 'Next hand',
    'seeBoard': 'See table',
  },
  es: {
    ...calls,
    'aria.card': ({ n, suit }) => `${n} de ${SUITS_ES[suit]}`,
    'round': ({ n }) => `Mano ${n}`,
    'noRounds': 'Todavía no hay manos',
    'rules':
      'La vira marca la pinta del perico (11) y la perica (10), las dos mejores cartas; si la vira es una de ellas, el 12 toma su lugar. Luego: 1 de espada, 1 de basto, 7 de espada, 7 de oro, los 3, los 2, los otros 1, 12, 11, 10, los otros 7, 6, 5 y 4. Gana quien se lleve dos de tres rondas. La mano vale 1; truco 3, retruco 6, vale nueve 9, vale juego la partida. El envido vale 2 y la flor 3 (la reservada, perico y perica juntos, 5).',
    'shareTitle': 'Juega truco conmigo',
    'shareText': 'Únete a mi partida de truco',
    'vira': 'Vira',
    'perico': 'Perico',
    'perica': 'Perica',
    'mano': 'Mano',
    'worth': ({ n }) => `Vale ${n}`,
    'worthGame': 'Vale la partida',
    'envidoPending': ({ name, stake }) => `${name} envidó (${stake}). ¡Responde!`,
    'trucoPending': ({ name, call }) => `${name}: ${call} ¡Responde!`,
    'youWaitAnswer': 'Esperando respuesta…',
    'waitingAnswer': ({ name }) => `Esperando a ${name}…`,
    'faltaStake': 'la falta',
    'plusTwo': 'Y envido',
    'singFlor': '¡Tienes flor! Cántala antes de tu primera carta',
    'roundOver': 'Mano terminada',
    'answerFirst': 'Primero responde',
    'dragHint': 'Arrastra la carta a la mesa',
    'parda': '¡Parda!',
    'trickTo': ({ name }) => `Ronda para ${name}`,
    'trickToYou': 'Ronda para ti',
    'mock.lines': [
      '¡Se te fue la flor, mi pana!',
      '¿Flor y calladito?',
      'Tu compañero acaba de suspirar',
      '¡Ponte las pilas!',
      'La flor se canta, chamo',
      'Mejor juega metras',
    ],
    'matchSub': ({ a, b, n }) => `${a} a ${b} · ${n === 1 ? '1 mano' : `${n} manos`}`,
    'award.flor': ({ who }) => `Flor (${who})`,
    'award.reservada': ({ who }) => `Flor reservada (${who})`,
    'award.envido': ({ a, b }) => `Envido ${a} a ${b}`,
    'award.envidoRefused': 'Envido no querido',
    'award.tricks': 'Mano',
    'award.truco': ({ call }) => `${call}`,
    'award.mazo': ({ call }) => `${call} (al mazo)`,
    'award.refused': ({ call }) => `${call} no querido`,
    'nextRound': 'Siguiente mano',
    'seeBoard': 'Ver mesa',
    'score': 'Piedras',
  },
};

// The server's errors only this game sends. They arrive in English.
export const errors = {
  es: {
    'Hand is over': 'La mano terminó',
    'Answer the bet first': 'Primero responde',
    'You cannot sing flor now': 'Ahora no puedes cantar flor',
    'You cannot call that now': 'Ahora no puedes cantar eso',
    'You cannot raise now': 'Ahora no puedes subir',
    'You cannot fold now': 'Ahora no puedes irte al mazo',
    'Nothing to answer': 'No hay nada que responder',
  },
};

// The full rules, for the rules sheet.
export const rules = {
  en: [
    { h: 'The game', items: [
      '40-card Spanish deck, 3 cards each, 2 vs 2. Best of three tricks wins the hand. First to the target wins.',
      'A card is turned up as the vira. The 11 of its suit is the perico and the 10 is the perica, the two best cards. If the vira is one of them, the 12 takes its place.',
    ] },
    { h: 'Card order, best first', items: [
      'Perico, perica, 1 of swords, 1 of clubs, 7 of swords, 7 of coins.',
      'Then 3s, 2s, the other 1s, 12, 11, 10, the other 7s, 6, 5, 4.',
      'Equal cards tie the trick (parda). The first tied trick is decided by the second, and a final tie goes to whoever won the first trick, or the mano.',
    ] },
    { h: 'Truco', items: [
      'A hand is worth 1. On your turn you can raise, and the other team answers quiero, no quiero, or raises back.',
      'Truco is worth 3 (1 if refused), retruco 6 (3), vale nueve 9 (6), vale juego the game (9).',
      'After a raise is accepted, only the team that accepted can raise next.',
      'Al mazo: you fold, and the other team takes the hand at its current value.',
    ] },
    { h: 'Envido', items: [
      'Called before your first card, on your turn or in reply to a truco. Worth 2.',
      'Answer quiero, no quiero, or raise with y envido (+2), cinco más (+5) or falta envido (what the leading team needs to win).',
      'A first envido refused pays 1. A refused raise pays what was bet before it.',
      'Your count: two cards of a suit are 20 plus their values, with 10, 11 and 12 worth 0. The perico counts 30 and the perica 29, plus your next card.',
    ] },
    { h: 'Flor', items: [
      'Three cards of one suit (the perico and perica count as any suit) is a flor, worth 3. Sing it before your first card or lose it.',
      'Reservada, perico and perica together, is worth 5 and counts without singing.',
      'Flor cancels the envido.',
    ] },
    { h: 'Scoring', items: [
      'Points are added when the hand ends: flor, then envido, then truco. Nothing more is added once a team reaches the target.',
    ] },
  ],
  es: [
    { h: 'El juego', items: [
      'Baraja española de 40 cartas, 3 cartas cada uno, 2 contra 2. Gana la mano quien se lleve dos de tres rondas. Gana la partida quien llegue primero a la meta.',
      'Se voltea una carta, la vira. El 11 de su pinta es el perico y el 10 la perica, las dos mejores cartas. Si la vira es una de ellas, el 12 toma su lugar.',
    ] },
    { h: 'Orden de las cartas, de mejor a peor', items: [
      'Perico, perica, 1 de espada, 1 de basto, 7 de espada, 7 de oro.',
      'Luego los 3, los 2, los otros 1, 12, 11, 10, los otros 7, 6, 5 y 4.',
      'Cartas iguales empatan la ronda (parda). Si empata la primera, decide la segunda. Si empata la última, gana quien se llevó la primera, o la mano.',
    ] },
    { h: 'Truco', items: [
      'La mano vale 1. En tu turno puedes subir, y el otro equipo responde quiero, no quiero, o sube de vuelta.',
      'El truco vale 3 (1 si no lo quieren), el retruco 6 (3), el vale nueve 9 (6), el vale juego la partida (9).',
      'Después de una subida aceptada, solo puede subir el equipo que aceptó.',
      'Al mazo: te retiras, y el otro equipo se lleva la mano por lo que valga en ese momento.',
    ] },
    { h: 'Envido', items: [
      'Se canta antes de tu primera carta, en tu turno o respondiendo a un truco. Vale 2.',
      'Se responde quiero, no quiero, o se sube con y envido (+2), cinco más (+5) o falta envido (lo que le falta al equipo que va ganando).',
      'Un primer envido no querido paga 1. Una subida no querida paga lo apostado antes.',
      'Tu cuenta: dos cartas de la misma pinta son 20 más sus valores, y 10, 11 y 12 valen 0. El perico cuenta 30 y la perica 29, más tu siguiente carta.',
    ] },
    { h: 'Flor', items: [
      'Tres cartas de la misma pinta (perico y perica cuentan como cualquiera) son flor, y vale 3. Se canta antes de tu primera carta, o se pierde.',
      'La reservada, perico y perica juntos, vale 5 y cuenta sin cantarla.',
      'La flor anula el envido.',
    ] },
    { h: 'Puntos', items: [
      'Se suman al terminar la mano: flor, envido y truco, en ese orden. No se suma nada más cuando un equipo llega a la meta.',
    ] },
  ],
};
