// Kemps (kimi) on the client, besides its table (../kemps.js): its name, its icon in the menu
// of games, its strings and its rules. Keep the rules in step with server/games/kemps.js.
import { cardSVG as frenchSVG } from '../french.js';

// Behind a feature flag (the server's `flag`): a lobby only lists it once the server offers it,
// and the home page leaves it out.
export const flagged = true;

export const name = { en: 'Kemps', es: 'Kimi' };
export const desc = {
  en: 'Four of a kind and a secret signal to your partner',
  es: 'Cuatro iguales y una seña secreta a tu pareja',
};

export const icon = () => `<span class="card under">${frenchSVG([13, 'D'])}</span><span class="card">${frenchSVG([13, 'C'])}</span><span class="wink">😉</span>`;

// Strings that differ from the shared ones while this game is on the table.
export const strings = {
  en: {
    'round': ({ n }) => `Hand ${n}`,
    'noRounds': 'No hands yet',
    'rules': 'Everyone swaps with the four cards in the middle at once, after four of a kind. When you have it, make your team\'s secret signal (★) without the others noticing, and your partner calls Kemps! If the other team spots it first, they call Stop Kemps on you. A wrong call gives the hand away. The book icon has the full rules.',
    'shareTitle': 'Play Kemps with me',
    'shareText': 'Join my Kemps match',
    'sign.wink': 'Wink',
    'sign.nose': 'Touch your nose',
    'sign.ear': 'Tug your ear',
    'sign.tongue': 'Stick out your tongue',
    'sign.brow': 'Raise an eyebrow',
    'sign.shrug': 'Shrug',
    'ourSignal': 'your team\'s signal',
    'callKemps': 'Kemps!',
    'callCorta': 'Stop Kemps!',
    'pass': 'Nothing for me',
    'passed': 'Waiting…',
    'passedTag': 'Done with the middle',
    'changeSignal': 'Change signal',
    'pickSignal': 'Tap your new signal',
    'cancel': 'Cancel',
    'signalSet': ({ sign }) => `Your team's signal is now ${sign}`,
    'hint': ({ sign }) => `Your signal: ${sign}. Others see every gesture, so bluff too`,
    'exposed': ({ sign }) => `They caught your signal (${sign}) last time. Change it`,
    'middleNo': ({ n }) => `Middle ${n}`,
    'reshuffled': ({ n }) => (n === 1 ? 'reshuffled once' : `reshuffled ${n} times`),
    'reshuffling': 'The deck ran out: the discards are shuffled back in',
    'knownTitle': 'Cards they took from the middle',
    'pickHand': 'Now tap a card in your hand to give',
    'pickMiddle': 'Now tap a card in the middle to take',
    'dropHint': 'Drop it on a card in the middle to swap',
    'everyone': 'Everyone swaps at once',
    'swapPrompt': 'Swap with the middle, or pass',
    'waitingMiddle': 'Waiting for new cards in the middle',
    'gotFour': 'Four of a kind! Signal your partner',
    'roundOver': 'Hand over',
    'kempsRight': ({ caller, target, rank }) => `${caller} called Kemps: ${target} had four ${rank}`,
    'kempsWrong': ({ caller, target }) => `${caller} called Kemps, but ${target} didn't have it`,
    'cortaRight': ({ caller, target, rank }) => `${caller} stopped ${target}, who had four ${rank}`,
    'cortaWrong': ({ caller, target }) => `${caller} called Stop Kemps on ${target}, who didn't have it`,
    'gaveAway': ({ name }) => `${name} gave it away with`,
    'deadTitle': 'Dead hand',
    'deadSub': 'The deck went round three times. Nobody scores.',
    'histDead': 'Dead hand',
    'hist.kemps.right': ({ name }) => `${name}: Kemps ✓`,
    'hist.kemps.wrong': ({ name }) => `${name}: Kemps ✗`,
    'hist.corta.right': ({ name, target }) => `${name} stopped ${target} ✓`,
    'hist.corta.wrong': ({ name, target }) => `${name} on ${target} ✗`,
    'matchSub': ({ a, b, n }) => `${a} to ${b} · ${n === 1 ? '1 hand' : `${n} hands`}`,
    'lastRound': ({ sub, how }) => `${sub} · last hand: ${how}`,
    'nextRound': 'Next hand',
    'seeBoard': 'See table',
    'rank.1': 'aces', 'rank.2': '2s', 'rank.3': '3s', 'rank.4': '4s', 'rank.5': '5s', 'rank.6': '6s', 'rank.7': '7s',
    'rank.8': '8s', 'rank.9': '9s', 'rank.10': '10s', 'rank.11': 'jacks', 'rank.12': 'queens', 'rank.13': 'kings',
  },
  es: {
    'round': ({ n }) => `Mano ${n}`,
    'noRounds': 'Todavía no hay manos',
    'rules': 'Todos cambian a la vez con las cuatro cartas del medio, buscando cuatro iguales. Cuando las tengas, hazle a tu pareja la seña secreta del equipo (★) sin que los otros se den cuenta, y tu pareja canta ¡Kimi! Si el otro equipo la ve primero, te canta ¡Corta! Cantar mal regala la mano. En el ícono del libro están todas las reglas.',
    'shareTitle': 'Juega kimi conmigo',
    'shareText': 'Únete a mi partida de kimi',
    'sign.wink': 'Guiñar el ojo',
    'sign.nose': 'Tocarse la nariz',
    'sign.ear': 'Jalarse la oreja',
    'sign.tongue': 'Sacar la lengua',
    'sign.brow': 'Levantar la ceja',
    'sign.shrug': 'Encogerse de hombros',
    'ourSignal': 'la seña de tu equipo',
    'callKemps': '¡Kimi!',
    'callCorta': '¡Corta!',
    'pass': 'Nada para mí',
    'passed': 'Esperando…',
    'passedTag': 'Ya no quiere nada del medio',
    'changeSignal': 'Cambiar seña',
    'pickSignal': 'Toca la seña nueva',
    'cancel': 'Cancelar',
    'signalSet': ({ sign }) => `La seña de tu equipo ahora es ${sign}`,
    'hint': ({ sign }) => `Tu seña: ${sign}. Todos ven cada gesto, así que disimula`,
    'exposed': ({ sign }) => `La otra vez te pillaron la seña (${sign}). Cámbiala`,
    'middleNo': ({ n }) => `Medio ${n}`,
    'reshuffled': ({ n }) => (n === 1 ? 'rebarajado una vez' : `rebarajado ${n} veces`),
    'reshuffling': 'Se acabó el mazo: se barajan los descartes',
    'knownTitle': 'Cartas que tomó del medio',
    'pickHand': 'Ahora toca la carta de tu mano que vas a dar',
    'pickMiddle': 'Ahora toca la carta del medio que vas a tomar',
    'dropHint': 'Suéltala sobre una carta del medio para cambiarla',
    'everyone': 'Todos cambian a la vez',
    'swapPrompt': 'Cambia con el medio, o pasa',
    'waitingMiddle': 'Esperando cartas nuevas en el medio',
    'gotFour': '¡Cuatro iguales! Hazle la seña a tu pareja',
    'roundOver': 'Mano terminada',
    'kempsRight': ({ caller, target, rank }) => `${caller} cantó kimi: ${target} tenía cuatro ${rank}`,
    'kempsWrong': ({ caller, target }) => `${caller} cantó kimi, pero ${target} no lo tenía`,
    'cortaRight': ({ caller, target, rank }) => `${caller} le cortó a ${target}, que tenía cuatro ${rank}`,
    'cortaWrong': ({ caller, target }) => `${caller} le cantó corta a ${target}, que no lo tenía`,
    'gaveAway': ({ name }) => `${name} se delató con`,
    'deadTitle': 'Mano muerta',
    'deadSub': 'El mazo dio tres vueltas. Nadie suma.',
    'histDead': 'Mano muerta',
    'hist.kemps.right': ({ name }) => `${name}: kimi ✓`,
    'hist.kemps.wrong': ({ name }) => `${name}: kimi ✗`,
    'hist.corta.right': ({ name, target }) => `${name} le cortó a ${target} ✓`,
    'hist.corta.wrong': ({ name, target }) => `${name} a ${target} ✗`,
    'matchSub': ({ a, b, n }) => `${a} a ${b} · ${n === 1 ? '1 mano' : `${n} manos`}`,
    'lastRound': ({ sub, how }) => `${sub} · última mano: ${how}`,
    'nextRound': 'Siguiente mano',
    'seeBoard': 'Ver mesa',
    'rank.1': 'ases', 'rank.2': 'doses', 'rank.3': 'treses', 'rank.4': 'cuatros', 'rank.5': 'cincos', 'rank.6': 'seises', 'rank.7': 'sietes',
    'rank.8': 'ochos', 'rank.9': 'nueves', 'rank.10': 'dieces', 'rank.11': 'jotas', 'rank.12': 'reinas', 'rank.13': 'reyes',
  },
};

// The server's errors only this game sends. They arrive in English.
export const errors = {
  es: {
    'That card is gone': 'Esa carta ya no está',
    'You already passed': 'Ya pasaste',
    'Too fast': 'Más despacio',
    'Pick a rival': 'Elige a un rival',
    'Unknown gesture': 'Esa seña no existe',
  },
};

// The full rules, for the rules sheet.
export const rules = {
  en: [
    { h: 'The game', items: [
      'One 52-card French deck, 2 vs 2; partners sit across from each other. Each team has a secret signal, one of six gestures, that only its two players see (★ on its button). It starts at random and stays from hand to hand until you change it.',
      'Everyone gets 4 cards, and 4 more go face up in the middle.',
      'The aim is four of a kind: four cards of one number in one hand.',
    ] },
    { h: 'Swapping', items: [
      'There are no turns. Anyone, at any moment, swaps one card of their hand for one in the middle: drag yours onto it, or tap one of each. Your hand always has 4 cards. Whoever gets there first takes the card.',
      'Everyone sees what you take: the cards each player took from the middle and still holds show by their seat.',
      'When there is nothing in the middle for you, press Nothing for me. Once all four have, or nobody has swapped for 12 seconds, the middle is discarded and four new cards take its place. When the deck runs out the discards are shuffled back in, twice; after that the hand is dead and nobody scores.',
    ] },
    { h: 'Signals and calls', items: [
      'Any gesture you tap shows over your seat for everyone. Only your team knows which one is the signal, so make the others too, to bluff.',
      'Kemps!: your partner holds four of a kind. If they do, your team wins the hand. If not, the other team wins it. You can\'t call it on your own hand: your partner has to see your signal.',
      'Stop Kemps!: pick a rival you think holds four of a kind. If they do, your team wins the hand; if not, theirs does.',
      'A hand won is worth 1. First team to the target wins: 3, 5 or 7, picked in the lobby.',
    ] },
    { h: 'Bots', items: [
      'Bots go for the number they hold most of, signal as soon as they have four, and make a gesture now and then that means nothing.',
      'They remember the gesture a team gave itself away with, and cut a rival who makes it again. A team of two bots changes its signal once it is caught; with a person on the team, changing it is up to them.',
    ] },
    { h: 'House rules', items: [
      'Kemps is usually played face to face, with real winks and nose scratches, and scored by letters (the first team to spell K-E-M-P-S loses). Here the gestures are buttons, a hand won is a point, and the middle is replaced on a clock instead of by the dealer.',
    ] },
  ],
  es: [
    { h: 'El juego', items: [
      'Una baraja francesa de 52 cartas, 2 contra 2; los compañeros se sientan enfrente. Cada equipo tiene una seña secreta, uno de seis gestos, que solo ven sus dos jugadores (★ en su botón). Empieza al azar y sigue de mano en mano hasta que la cambien.',
      'Cada uno recibe 4 cartas, y otras 4 van boca arriba en el medio.',
      'Se buscan cuatro iguales: cuatro cartas del mismo número en una mano.',
    ] },
    { h: 'Cambiar', items: [
      'No hay turnos. Cualquiera, en cualquier momento, cambia una carta de su mano por una del medio: arrastra la tuya encima, o toca una de cada lado. Tu mano siempre tiene 4 cartas. El que llega primero se lleva la carta.',
      'Todos ven lo que tomas: junto a cada puesto se ven las cartas que ese jugador tomó del medio y todavía tiene.',
      'Cuando no haya nada para ti en el medio, dale a Nada para mí. Cuando los cuatro lo hayan hecho, o nadie haya cambiado en 12 segundos, el medio se descarta y cuatro cartas nuevas ocupan su lugar. Si se acaba el mazo se barajan los descartes, dos veces; después la mano queda muerta y nadie suma.',
    ] },
    { h: 'Señas y cantos', items: [
      'Cualquier gesto que toques aparece sobre tu puesto para todos. Solo tu equipo sabe cuál es la seña, así que haz los otros también, para disimular.',
      '¡Kimi!: tu pareja tiene cuatro iguales. Si las tiene, tu equipo gana la mano. Si no, la gana el otro. No lo puedes cantar con tu propia mano: tu pareja tiene que ver tu seña.',
      '¡Corta!: elige a un rival que creas que tiene cuatro iguales. Si las tiene, tu equipo gana la mano; si no, la gana el suyo.',
      'Cada mano ganada vale 1. Gana el primer equipo que llegue a la meta: 3, 5 o 7, se elige en la sala.',
    ] },
    { h: 'Bots', items: [
      'Los bots van por el número del que más tienen, hacen la seña en cuanto tienen cuatro, y de vez en cuando hacen un gesto que no quiere decir nada.',
      'Se acuerdan del gesto con el que un equipo se delató, y le cortan al rival que lo vuelva a hacer. Un equipo de dos bots cambia de seña cuando se la pillan; si en el equipo hay una persona, cambiarla le toca a ella.',
    ] },
    { h: 'Reglas de la casa', items: [
      'El kimi (kemps) se juega cara a cara, con guiños y rascadas de nariz de verdad, y se cuenta por letras (pierde el primer equipo que complete K-E-M-P-S). Aquí los gestos son botones, cada mano ganada es un punto, y el medio se cambia con un reloj en vez de que lo cambie el que reparte.',
    ] },
  ],
};
