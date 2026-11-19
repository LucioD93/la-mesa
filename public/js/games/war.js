// War on the client, besides its table (../war.js): its name, its icon in the menu
// of games, its strings and its rules. Keep the rules in step with server/games/war.js.
import { cardSVG as frenchSVG } from '../french.js';

export const name = { en: 'War', es: 'Guerra' };
export const desc = {
  en: 'High card takes it; a tie means war',
  es: 'La carta más alta gana; si empatan, ¡guerra!',
};

export const icon = () => `<span class="card under">${frenchSVG([13, 'S'])}</span><span class="card">${frenchSVG([13, 'H'])}</span><span class="swords">⚔️</span>`; // two kings: war

// Strings that differ from the shared ones while this game is on the table.
export const strings = {
  en: {
    'round': ({ n }) => `Round ${n}`,
    'noRounds': 'No rounds yet',
    'rules': 'Nobody picks a card: tap your deck to turn the top one, all four at once. The highest card takes the four for its team, aces high. If the top card is tied between the teams, it\'s war: the tied players lay one face down and turn another. The team with more cards wins the round. The book icon has the full rules.',
    'shareTitle': 'Play war with me',
    'shareText': 'Join my war match',
    'guerra': '¡Guerra!',
    'battle': ({ n }) => `Battle ${n}`,
    'wars': 'Wars',
    'warsN': ({ n }) => (n === 1 ? '1 war' : `${n} wars`),
    'faceDown': 'Face down',
    'cardsLeft': 'Cards left',
    'tapToFlip': 'Tap to turn a card',
    'warFlip': 'War! One down, one up',
    'flipPrompt': 'Turn your card!',
    'warPrompt': '¡Guerra! Turn again',
    'waitingOn': ({ names }) => `Waiting for ${names}…`,
    'warOn': ({ names }) => `¡Guerra! ${names}`,
    'waitOthers': 'Wait for the others',
    'notInWar': 'Only the tied players fight this war',
    'outOfCards': 'You are out of cards',
    'takes': ({ name, n }) => `${name} takes ${n}`,
    'youTake': ({ n }) => `You take ${n}`,
    'nobodyTakes': 'Nobody can finish the war',
    'aria.deck': ({ n }) => `Your deck, ${n === 1 ? '1 card' : `${n} cards`}. Turn the top one`,
    'aria.pile': ({ team, n }) => `${team}: ${n === 1 ? '1 card' : `${n} cards`} taken`,
    'roundOver': 'Round over',
    'pileOf': ({ team }) => `${team}: cards`,
    'warsOf': ({ team }) => `${team}: wars won`,
    'lost': ({ n }) => (n === 1 ? '1 card of a war nobody finished' : `${n} cards of a war nobody finished`),
    'matchSub': ({ a, b, n }) => `${a} to ${b} · ${n === 1 ? '1 round' : `${n} rounds`}`,
    'lastRound': ({ sub, how }) => `${sub} · last round: ${how}`,
    'tieTitle': 'Even piles',
    'tieSub': ({ n }) => `Both teams took ${n} cards. Nobody scores.`,
    'award.cards': ({ a, b }) => `Cards ${a} to ${b}`,
    'nextRound': 'Next round',
    'seeBoard': 'See table',
  },
  es: {
    'round': ({ n }) => `Mano ${n}`,
    'noRounds': 'Todavía no hay manos',
    'rules': 'Nadie escoge carta: toca tu mazo para voltear la de arriba, los cuatro a la vez. La carta más alta se lleva las cuatro para su equipo, y el as es la más alta. Si la más alta está empatada entre los equipos, hay guerra: los empatados ponen una boca abajo y voltean otra. Gana la mano el equipo con más cartas. En el ícono del libro están todas las reglas.',
    'shareTitle': 'Juega guerra conmigo',
    'shareText': 'Únete a mi partida de guerra',
    'guerra': '¡Guerra!',
    'battle': ({ n }) => `Batalla ${n}`,
    'wars': 'Guerras',
    'warsN': ({ n }) => (n === 1 ? '1 guerra' : `${n} guerras`),
    'faceDown': 'Boca abajo',
    'cardsLeft': 'Cartas que quedan',
    'tapToFlip': 'Toca para voltear',
    'warFlip': '¡Guerra! Una abajo, una arriba',
    'flipPrompt': '¡Voltea tu carta!',
    'warPrompt': '¡Guerra! Voltea otra vez',
    'waitingOn': ({ names }) => `Esperando a ${names}…`,
    'warOn': ({ names }) => `¡Guerra! ${names}`,
    'waitOthers': 'Espera a los demás',
    'notInWar': 'Esta guerra es solo de los empatados',
    'outOfCards': 'Te quedaste sin cartas',
    'takes': ({ name, n }) => `${name} se lleva ${n}`,
    'youTake': ({ n }) => `Te llevas ${n}`,
    'nobodyTakes': 'Nadie puede terminar la guerra',
    'aria.deck': ({ n }) => `Tu mazo, ${n === 1 ? '1 carta' : `${n} cartas`}. Voltea la de arriba`,
    'aria.pile': ({ team, n }) => `${team}: ${n === 1 ? '1 carta ganada' : `${n} cartas ganadas`}`,
    'roundOver': 'Mano terminada',
    'pileOf': ({ team }) => `${team}: cartas`,
    'warsOf': ({ team }) => `${team}: guerras ganadas`,
    'lost': ({ n }) => (n === 1 ? '1 carta de una guerra que nadie terminó' : `${n} cartas de una guerra que nadie terminó`),
    'matchSub': ({ a, b, n }) => `${a} a ${b} · ${n === 1 ? '1 mano' : `${n} manos`}`,
    'lastRound': ({ sub, how }) => `${sub} · última mano: ${how}`,
    'tieTitle': 'Pilas parejas',
    'tieSub': ({ n }) => `Los dos equipos ganaron ${n} cartas. Nadie suma.`,
    'award.cards': ({ a, b }) => `Cartas ${a} a ${b}`,
    'nextRound': 'Siguiente mano',
    'seeBoard': 'Ver mesa',
  },
};

// The server's errors only this game sends. They arrive in English.
export const errors = {
  es: {
    'Wait for the cards to be taken': 'Espera a que se lleven las cartas',
    'You already turned your card': 'Ya volteaste tu carta',
    'You are not in this war': 'No estás en esta guerra',
  },
};

// The full rules, for the rules sheet.
export const rules = {
  en: [
    { h: 'The game', items: [
      'One 52-card deck, 2 vs 2. Everyone gets 13 cards face down, and nobody looks at them, not even their own.',
      'Aces are highest, then K, Q, J, 10 down to 2. Suits don\'t count.',
      'The team that takes more cards wins the round and scores 1. You pick how many rounds to win (1, 3 or 5) in the lobby.',
    ] },
    { h: 'A battle', items: [
      'All four turn up their top card at once: tap your deck, or drag it onto the table. Nobody chooses, and nobody waits for a turn.',
      'The highest card takes all four for its team. Partners tied on top take it just the same.',
      'The cards stay up a moment so everyone sees who took them, then slide onto that team\'s pile.',
    ] },
    { h: '¡Guerra!', items: [
      'If the highest card is tied between the teams, it\'s war. Only the tied players fight it: each lays one card face down and turns up the next, with a single tap.',
      'The highest of the new cards takes everything on the table, the face-down cards too. Tied again, and it\'s war again.',
      'With one card left, it goes face up without one face down. A player with no cards left drops out of the war, and if a whole side runs out the other side takes it. If nobody can go on, nobody gets those cards.',
    ] },
    { h: 'End of the round', items: [
      'A player out of cards sits out the battles that are left. The round ends when every card has been played.',
      'Equal piles score nothing.',
    ] },
    { h: 'House rules', items: [
      'War is usually two players, each taking the cards back into their deck until one has them all, which can go on forever. This version is for two teams, plays through the deck once, and counts the cards taken.',
    ] },
  ],
  es: [
    { h: 'El juego', items: [
      'Una baraja francesa de 52 cartas, 2 contra 2. Cada uno recibe 13 cartas boca abajo, y nadie las mira, ni siquiera las suyas.',
      'El as es la más alta, luego K, Q, J, 10 hasta el 2. La pinta no cuenta.',
      'El equipo que se lleva más cartas gana la mano y suma 1. Se elige en la sala a cuántas manos se juega (1, 3 o 5).',
    ] },
    { h: 'Una batalla', items: [
      'Los cuatro voltean la carta de arriba a la vez: toca tu mazo, o arrástralo a la mesa. Nadie escoge, y nadie espera turno.',
      'La carta más alta se lleva las cuatro para su equipo. Si los compañeros empatan arriba, se la llevan igual.',
      'Las cartas se quedan a la vista un momento para que todos vean quién se las llevó, y luego van a la pila de ese equipo.',
    ] },
    { h: '¡Guerra!', items: [
      'Si la carta más alta está empatada entre los equipos, hay guerra. Solo pelean los empatados: cada uno pone una carta boca abajo y voltea la siguiente, con un solo toque.',
      'La más alta de las nuevas se lleva todo lo que hay en la mesa, también las de boca abajo. Si empatan otra vez, hay guerra otra vez.',
      'Con una sola carta, va boca arriba sin poner una abajo. Quien se queda sin cartas sale de la guerra, y si un lado entero se queda sin cartas, el otro se la lleva. Si nadie puede seguir, esas cartas no son de nadie.',
    ] },
    { h: 'Fin de la mano', items: [
      'Quien se queda sin cartas no juega las batallas que faltan. La mano termina cuando se juegan todas las cartas.',
      'Si las pilas quedan iguales, nadie suma.',
    ] },
    { h: 'Reglas de la casa', items: [
      'La guerra se suele jugar entre dos, y cada uno mete las cartas que gana en su mazo hasta que uno se queda con todas, lo que puede no acabar nunca. Esta versión es para dos equipos, recorre la baraja una sola vez y cuenta las cartas ganadas.',
    ] },
  ],
};
