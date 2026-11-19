// Parchís on the client, besides its table (../parchis.js): its name, its icon in the menu
// of games, its strings and its rules. Keep the rules in step with server/games/parchis.js.

export const name = { en: 'Parchís', es: 'Parchís' };
export const desc = {
  en: 'A race in pairs, with one die or two',
  es: 'Carrera en parejas, con uno o dos dados',
};

export const icon = () =>
    `<svg viewBox="0 0 40 40" aria-hidden="true">${['#facc15', '#3b82f6', '#22c55e', '#ef4444']
      .map((fill, i) => `<rect x="${i % 2 ? 21 : 3}" y="${i < 2 ? 3 : 21}" width="16" height="16" rx="3" fill="${fill}"/>`)
      .join('')}<circle cx="20" cy="20" r="5" fill="#fbf8ef"/></svg>`;

// Strings that differ from the shared ones while this game is on the table.
export const strings = {
  en: {
    'round': ({ n }) => `Game ${n}`,
    'noRounds': 'No games yet',
    'rules': 'Roll the die and move a piece. A 5 brings a piece out, and a 6 (or a double, with two dice) rolls again. Taking a rival pays 20 and reaching the goal pays 10. The first pair with all eight pieces home wins the game. The book icon has the full rules.',
    'shareTitle': 'Play parchís with me',
    'shareText': 'Join my parchís match',
    'color.yellow': 'Yellow',
    'color.blue': 'Blue',
    'color.red': 'Red',
    'color.green': 'Green',
    'aria.token': ({ color }) => `${color} piece`,
    'aria.die': ({ n }) => `Die showing ${n}`,
    'roll': 'Roll',
    'variant': 'Dice',
    'rollDie': 'Roll the die',
    'rollDice': 'Roll the dice',
    'threeDoubles': '¡Tres dobles!',
    'rollFirst': 'Roll the die first',
    'pickPiece': 'Pick a piece',
    'pickPartner': "Yours are home: move your partner's",
    'noMove': 'No move with that roll',
    'threeSixes': '¡Tres seises!',
    'captured': '¡Comida!',
    'reachedGoal': '¡A la meta!',
    'captures': 'Captures',
    'roundOver': 'Game over',
    'matchSub': ({ a, b, n }) => `${a} to ${b} · ${n === 1 ? '1 game' : `${n} games`}`,
    'nextRound': 'Next game',
    'seeBoard': 'See board',
  },
  es: {
    'round': ({ n }) => `Partida ${n}`,
    'noRounds': 'Todavía no hay partidas',
    'rules': 'Tira el dado y mueve una ficha. Con un 5 sale una ficha, y con un 6 (o un doble, con dos dados) tiras otra vez. Comerte una ficha rival da 20 y llegar a la meta da 10. Gana la primera pareja con sus ocho fichas en la meta. En el ícono del libro están todas las reglas.',
    'shareTitle': 'Juega parchís conmigo',
    'shareText': 'Únete a mi partida de parchís',
    'color.yellow': 'Amarilla',
    'color.blue': 'Azul',
    'color.red': 'Roja',
    'color.green': 'Verde',
    'aria.token': ({ color }) => `Ficha ${color.toLowerCase()}`,
    'aria.die': ({ n }) => `Dado en ${n}`,
    'roll': 'Tirar',
    'variant': 'Dados',
    'rollDie': 'Tira el dado',
    'rollDice': 'Tira los dados',
    'threeDoubles': '¡Tres dobles!',
    'rollFirst': 'Primero tira el dado',
    'pickPiece': 'Elige una ficha',
    'pickPartner': 'Las tuyas ya llegaron: mueve las de tu compañero',
    'noMove': 'No hay jugada con ese número',
    'threeSixes': '¡Tres seises!',
    'captured': '¡Comida!',
    'reachedGoal': '¡A la meta!',
    'captures': 'Comidas',
    'roundOver': 'Partida terminada',
    'matchSub': ({ a, b, n }) => `${a} a ${b} · ${n === 1 ? '1 partida' : `${n} partidas`}`,
    'nextRound': 'Siguiente partida',
    'seeBoard': 'Ver tablero',
  },
};

// The full rules, for the rules sheet.
export const rules = {
  en: [
    { h: 'The game', items: [
      'One die or two, picked in the lobby. 68 shared squares, 2 vs 2. Partners sit across: yellow with red, blue with green.',
      'A game ends when one pair has all eight pieces in the goal. You pick how many games to win (1, 2 or 3) in the lobby.',
      'Pieces go around counterclockwise, then up their own colored corridor. The goal needs the exact count.',
    ] },
    { h: 'Your turn', items: [
      'A 5 has to bring a piece out of the nest if one can come out.',
      'With no possible move, the turn passes by itself.',
    ] },
    { h: 'With one die', items: [
      'A 6 rolls again. With no pieces in your nest, it moves 7.',
      'A third 6 in a row ends your turn and sends the last piece you moved back to the nest, unless it is already in its corridor.',
    ] },
    { h: 'With two dice', items: [
      'Use each die separately, on one piece or on two, in the order you like. Pick which one with the buttons by the dice.',
      'Dice adding up to 5 bring a piece out between them, and a double 5 brings out two.',
      'A double rolls again, and a 6 is just a 6.',
      'A third double in a row ends your turn and sends the last piece you moved back to the nest, unless it is already in its corridor.',
    ] },
    { h: 'Taking pieces', items: [
      'Landing on a lone rival sends it back to its nest, and you count 20 with one piece.',
      'Nobody can be taken on a gray safe square or a colored start square, and two different colors can share one.',
      'Coming out onto a start square holding two pieces takes the rival that got there last. If both are your pair, you stay in.',
      'Partners never take each other.',
    ] },
    { h: 'Barriers', items: [
      'Two pieces of one color on a square are a barrier. Nobody can land on it or pass it, not even its owner.',
      'A 6, or a double with two dice, has to open your barrier if it can.',
      'A square holds two pieces at most.',
    ] },
    { h: 'Bonuses and partners', items: [
      'Reaching the goal pays 10, counted with one piece. A bonus no piece can use is lost.',
      'Once your four pieces are home, your rolls and bonuses move your partner\'s pieces.',
    ] },
    { h: 'House rules', items: [
      'Parchís varies by table. Here barriers stop everyone everywhere, a 5 always has to come out, and taking a piece as you come out also pays 20.',
    ] },
  ],
  es: [
    { h: 'El juego', items: [
      'Uno o dos dados, se elige en la sala. 68 casillas compartidas, 2 contra 2. Los compañeros van enfrente: amarillo con rojo, azul con verde.',
      'La partida termina cuando una pareja tiene sus ocho fichas en la meta. Se elige en la sala a cuántas partidas se juega (1, 2 o 3).',
      'Las fichas dan la vuelta en sentido contrario a las agujas del reloj y luego suben por su pasillo de color. Para entrar a la meta hay que sacar el número exacto.',
    ] },
    { h: 'Tu turno', items: [
      'Con un 5 tienes que sacar una ficha de la casa si puede salir.',
      'Si no tienes jugada, el turno pasa solo.',
    ] },
    { h: 'Con un dado', items: [
      'Con un 6 tiras otra vez. Si no tienes fichas en casa, mueves 7.',
      'El tercer 6 seguido termina tu turno y manda a casa la última ficha que moviste, salvo que ya esté en su pasillo.',
    ] },
    { h: 'Con dos dados', items: [
      'Cada dado se usa por separado, con una ficha o con dos, en el orden que quieras. Elige cuál con los botones junto a los dados.',
      'Si los dados suman 5 sale una ficha entre los dos, y con un doble 5 salen dos.',
      'Un doble tira otra vez, y un 6 es solo un 6.',
      'El tercer doble seguido termina tu turno y manda a casa la última ficha que moviste, salvo que ya esté en su pasillo.',
    ] },
    { h: 'Comer fichas', items: [
      'Si caes sobre una ficha rival sola, vuelve a su casa y cuentas 20 con una ficha.',
      'En una casilla gris segura o en una salida de color no se come, y pueden compartirla dos colores.',
      'Si sales a una salida con dos fichas, te comes la rival que llegó de última. Si las dos son de tu pareja, no puedes salir.',
      'Los compañeros no se comen entre sí.',
    ] },
    { h: 'Barreras', items: [
      'Dos fichas del mismo color en una casilla son una barrera. Nadie puede caer ahí ni pasarla, ni siquiera su dueño.',
      'Con un 6, o un doble con dos dados, tienes que abrir tu barrera si puedes.',
      'En una casilla caben dos fichas como máximo.',
    ] },
    { h: 'Premios y compañeros', items: [
      'Llegar a la meta da 10, contados con una ficha. Un premio que ninguna ficha pueda usar se pierde.',
      'Cuando tus cuatro fichas llegan, tus tiradas y premios mueven las fichas de tu compañero.',
    ] },
    { h: 'Reglas de la casa', items: [
      'El parchís cambia de mesa en mesa. Aquí las barreras detienen a todos en cualquier casilla, con un 5 siempre hay que salir, y comer al salir también da 20.',
    ] },
  ],
};
