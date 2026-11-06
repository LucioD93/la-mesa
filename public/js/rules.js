// The full rules of each game, for the rules sheet. Keep these in step with the
// README and with what server/games/ actually does.

export const RULES = {
  domino: {
    en: [
      { h: 'The game', items: [
        'Double-six set, 7 tiles each, no boneyard. Partners sit across from each other and play as a team.',
        'First to the target wins. You pick 50, 75 or 100 in the lobby.',
      ] },
      { h: 'Your turn', items: [
        'In the first round, whoever holds the double six opens with it. After that the opener rotates to the right and can open with any tile.',
        'Match one of the two ends of the line.',
        'With no legal move, the game passes for you after 3 seconds.',
        'Dropping a tile where it does not fit plays nothing, and the table laughs at you.',
      ] },
      { h: 'Ending a round', items: [
        'Domino: the player who empties their hand wins for their team, which scores the pips left in the other team\'s hands.',
        'Tranque (blocked game): the team with fewer pips wins and scores the other team\'s pips. A tie scores nothing.',
      ] },
    ],
    es: [
      { h: 'El juego', items: [
        'Dominó doble seis, 7 fichas cada uno, sin pozo. Los compañeros se sientan enfrente y juegan en equipo.',
        'Gana quien llegue primero a la meta. Se elige 50, 75 o 100 en la sala.',
      ] },
      { h: 'Tu turno', items: [
        'En la primera mano sale quien tenga el doble seis, y sale con él. Después la salida rota a la derecha y se puede salir con cualquier ficha.',
        'Pega con una de las dos puntas de la línea.',
        'Si no tienes jugada, el juego pasa por ti a los 3 segundos.',
        'Si sueltas una ficha donde no pega, no se juega, y la mesa se ríe de ti.',
      ] },
      { h: 'Cómo termina la mano', items: [
        'Dominó: quien se quede sin fichas gana para su equipo, que suma los puntos que le quedan al otro equipo.',
        'Tranque: gana el equipo con menos puntos y suma los del otro. Si empatan, nadie suma.',
      ] },
    ],
  },

  truco: {
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
  },

  caida: {
    en: [
      { h: 'The game', items: [
        '40-card Spanish deck, 2 vs 2. Points land as they happen, and the first team to the target (12 or 24) wins on the spot, even mid-round.',
        'A round is the table, then three deals of 3 cards each. That uses the whole deck.',
      ] },
      { h: 'The table', items: [
        'The dealer calls the count, 1 → 4 or 4 → 1, and lays 4 cards face up.',
        'A card that lands on its own number scores that number for the dealer: a 2 on spot 2 is +2.',
        'Four different numbers first try: dealer +1. A repeated number goes back in the deck and pays the other team +1 instead.',
      ] },
      { h: 'Cantos', items: [
        'Sing on your turn, before your first card of each deal. If you play without singing, the points are gone.',
        'Ronda (a pair): 1 for 1 to 7, 2 for 10s, 3 for 11s, 4 for 12s.',
        'Patrulla (three in a row, like 5-6-7 or 7-10-11): 2.',
        'Tolete (three of a kind): 3.',
        'Once everyone has played a card from the deal, the best canto pays: tolete beats patrulla, patrulla beats ronda. If both teams sang the same kind, both score.',
      ] },
      { h: 'Playing', items: [
        'Play one card. If its number is on the table you take it, plus any cards that follow in sequence: a 5 takes the 5, then the 6, the 7, the 10 and so on until there is a gap.',
        'Capturing is automatic. With no match, your card stays on the table.',
        'Caída: taking the card the player before you just played. 1 for 1 to 7, 2 for a 10, 3 for an 11, 4 for a 12.',
        'Mesa limpia: taking every card on the table. +4, on top of any caída.',
      ] },
      { h: 'End of the round', items: [
        'Whoever captured last takes whatever is left on the table.',
        'The team with more cards scores 1 for each card above 20.',
      ] },
      { h: 'House rules', items: [
        'Caída rules vary by table. Not included here: other cantos such as registro or vigía, bluffing a canto, and soplada (claiming a capture someone missed, which cannot happen because captures are automatic).',
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
        'Cuatro números distintos a la primera: +1 para el que reparte. Un número repetido vuelve a la baraja y le da +1 al otro equipo.',
      ] },
      { h: 'Cantos', items: [
        'Se canta en tu turno, antes de tu primera carta de cada reparto. Si juegas sin cantar, se pierden los puntos.',
        'Ronda (un par): 1 del 1 al 7, 2 con los 10, 3 con los 11, 4 con los 12.',
        'Patrulla (tres seguidas, como 5-6-7 o 7-10-11): 2.',
        'Tolete (tres iguales): 3.',
        'Cuando todos jugaron una carta del reparto, paga el mejor canto: tolete gana a patrulla y patrulla a ronda. Si los dos equipos cantaron lo mismo, suman los dos.',
      ] },
      { h: 'El juego de cartas', items: [
        'Juega una carta. Si su número está en la mesa te lo llevas, y también las que le siguen: un 5 se lleva el 5, luego el 6, el 7, el 10 y así hasta que falte uno.',
        'Se recoge solo. Si no pega con nada, tu carta se queda en la mesa.',
        'Caída: llevarte la carta que acaba de jugar el anterior. 1 del 1 al 7, 2 con un 10, 3 con un 11, 4 con un 12.',
        'Mesa limpia: llevarte todas las cartas de la mesa. +4, además de la caída si la hay.',
      ] },
      { h: 'Fin de la mano', items: [
        'Quien recogió de último se lleva lo que quede en la mesa.',
        'El equipo con más cartas suma 1 por cada carta por encima de 20.',
      ] },
      { h: 'Reglas de la casa', items: [
        'La caída cambia de mesa en mesa. No se incluyen otros cantos como registro o vigía, cantar de mentira, ni la soplada (reclamar una recogida que alguien dejó pasar, que aquí no ocurre porque se recoge solo).',
      ] },
    ],
  },

  parchis: {
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
  },
  cochina: {
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
  },

  rummy: {
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
  },
};
