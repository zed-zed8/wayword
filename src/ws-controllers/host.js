//? models
import COWsession from "../models/games/clash_of_word.js";

import {
  hostConnections,
  playerConnections,
  renderTemplate,
  sendToHost,
  sendToPlayers,
} from "../websocket.js";

function generateLetter({ amount = 10 } = {}) {
  let letters = [
    "a",
    "b",
    "c",
    "d",
    "e",
    "f",
    "g",
    "h",
    "i",
    "j",
    "k",
    "l",
    "m",
    "n",
    "o",
    "p",
    "q",
    "r",
    "s",
    "t",
    "u",
    "v",
    "w",
    "x",
    "y",
    "z",
  ];

  let selectedLetters = [];
  for (let index = 0; index < amount; index++) {
    let randomIndex = Math.floor(Math.random() * letters.length);
    selectedLetters.push(letters[randomIndex]);
    letters.splice(randomIndex, 1);
  }
  return selectedLetters;
}

const host = {
  async connect(ws, req) {
    console.log("Host connected");
    let sessionId;

    let hostId = req.session.user?._id;
    if (!hostId) {
      ws.close(4001, "Unauthorized");
      return;
    }
    try {
      // check if this host already have a session running
      const existingSession = await COWsession.findOne({
        host: hostId,
        gamestatus: "running",
      });

      sessionId = existingSession?._id.toString();
      console.log(`Resuming existing session: ${sessionId}`);

      // set memory Maps
      hostConnections.set(sessionId, ws);

      // Only create a new player set if one doesn't already exist for this session
      if (!playerConnections.has(sessionId)) {
        playerConnections.set(sessionId, new Set());
      }
    } catch (err) {
      console.error("Failed to initialize host socket:", err);
      ws.close(1011, "Internal Server Error");
      return;
    }

    // init pages
    if (!req.session.pages) {
      req.session.pages = "";
    }

    // check host pages
    switch (req.session.pages) {
      case "lobby": {
        // Send the ID back to the host screen
        const payloadHost = await renderTemplate(
          "clash_of_word",
          "lobbyCode",
          { sessionId },
          "#lobby-code",
          "innerMorph",
        );
        sendToHost({ sessionId, payloadHost, hostConnections });
        break;
      }

      case "gameRunning": {
        console.log("host start game");
        break;
      }
      case "gameRoundResult": {
        // TODO later game round result on host
        console.log("host round game result");
        break;
      }
      case "gameEnd": {
        // TODO later end game on host
        console.log("host end game result");
        await COWsession.deleteMany({ gamestatus: "running" }).exec();
        // clear the Map from RAM
        hostConnections.clear();
        playerConnections.clear();
        break;
      }
    }

    return sessionId;
  },
  async message(ws, message, req) {
    const data = JSON.parse(message);

    // update: host player joined list
    // expected data: { username: "", playerId: "" }
    if (data.type === "playerJoined") {
      // init host req.session.playerJoined
      if (!req.session.playerJoined) {
        req.session.playerJoined = []; // an array of object { username: "", playerId: "" }
      }
      console.log("test" + req.session.playerJoined);
      req.session.playerJoined.push({
        username: data.username,
        playerId: data.playerId,
      });

      // Force the session to save immediately
      await req.session.save();
    }

    // host start game
    // expected data: {  }
    // can be used as continue to next round
    if (data.type === "startGame") {
      // TODO handle the host press start button
      // TODO handle the host continuer next round
      req.session.pages = "gameRunning";
      // Force the session to save immediately
      await req.session.save();

      console.log("game is running");
      console.log(req.session.pages);

      // find session using hostId and populate them
      const hostId = req.session.user._id;
      const session = await COWsession.findOne({
        host: hostId,
        gamestatus: "running",
      })
        .populate("player1.playerId")
        .populate("player2.playerId");
      let sessionId = session._id.toString();

      // TODO generate available letter
      let availableLetter = generateLetter();
      session.currentAvailableLetter = availableLetter;
      await session.save();

      let roundCount = session.rounds.length + 1;

      // send current game screen to host
      const payloadHost = await renderTemplate(
        "clash_of_word",
        "host_game_screen",
        {
          player1: session.player1,
          player2: session.player2,
          availableLetter,
          roundCount,
        },
        "#game-screen",
        "innerMorph",
      );
      sendToHost({ sessionId, payloadHost, hostConnections });

      // TODO diferentiate currentUser for player 1 and 2
      const payloadPlayer = await renderTemplate(
        "clash_of_word",
        "player_game_screen",
        {
          player1: session.player1,
          player2: session.player2,
          currentUser: req.session.user,
          availableLetter,
          roundCount,
        },
        "#game-screen",
        "innerMorph",
      );
      sendToPlayers({ sessionId, payloadPlayer, playerConnections });
    }

    // host start game
    // expected data: {  }
    if (data.type === "roundResult") {
      // TODO handle round result result
      console.log("host roundResult happer");
      req.session.pages = "gameRoundResult";
      // Force the session to save immediately
      await req.session.save();

      // find session using hostId and populate them
      const hostId = req.session.user._id;
      const session = await COWsession.findOne({
        host: hostId,
        gamestatus: "running",
      })
        .populate("player1.playerId")
        .populate("player2.playerId");
      let sessionId = session._id.toString();

      const word1 = session.player1.word;
      const word2 = session.player2.word;
      let player1health = session.player1.health;
      let player2health = session.player2.health;
      // TODO [RUN YOUR IN-MEMORY CALCULATIONS HERE WHEN BOTH ARE WAITING...]
      // calculate score (length * 10)
      let score1;
      let score2;
      score1 = word1.length * 10;
      score2 = word2.length * 10;

      // calculate health
      let difference;
      let result;
      let winningPlayer;
      difference = score1 - score2;
      if (difference > 0) {
        // player 1 win
        player2health -= difference;
        result = "player1win";
        session.player2.health = player2health; // update health
        winningPlayer = "player 1";
      } else if (difference < 0) {
        // player 2 win
        player1health -= difference * -1;
        result = "player2win";
        session.player1.health = player1health; // update health
        winningPlayer = "player 2";
      } else {
        // draw
        result = "draw";
      }

      // create round and save it to db
      // TODO increment round
      let roundCount = session.rounds.length + 1;
      const round = {
        round: roundCount,
        player1health: player1health,
        player2health: player2health,
        word1: word1,
        word2: word2,
        score1: score1,
        score2: score2,
        result: result,
        availableLetters: session.currentAvailableLetter,
      };
      session.rounds.push(round);
      await session.save();

      let isEnd = false;
      if (player1health <= 0 || player2health <= 0) {
        isEnd = true;
      }

      // send round result to host
      const payloadHost = await renderTemplate(
        "clash_of_word",
        "round_result",
        {
          round,
          winningPlayer,
          difference,
          isEnd,
        },
        "#round-result",
        "innerMorph",
      );
      sendToHost({ sessionId, payloadHost, hostConnections });

      // send round result to players
      const payloadPlayer = await renderTemplate(
        "clash_of_word",
        "player_round_result",
        {
          round,
          winningPlayer,
          difference,
          isEnd,
        },
        "#round-result",
        "innerMorph",
      );
      // Update Both Players
      sendToPlayers({ sessionId, payloadPlayer, playerConnections });
    }

    // host end game
    // exprected data {}
    if (data.type === "endGame") {
      // TODO handle end game result
      console.log("host roundResult happer");

      // find session using hostId and populate them
      const hostId = req.session.user._id;
      const session = await COWsession.findOne({
        host: hostId,
        gamestatus: "running",
      })
        .populate("player1.playerId")
        .populate("player2.playerId");
      let sessionId = session._id.toString();

      // end result variable
      let player1health = session.player1.health;
      let player2health = session.player2.health;

      let roundCount = session.rounds.length + 1;
      let winningPlayer;
      if (player1health <= 0) {
        winningPlayer = "Player 2 Win";
      } else if (player2health <= 0) {
        winningPlayer = "Player 1 Win";
      }

      // send the updated round to everyone
      const payloadHost = await renderTemplate(
        "clash_of_word",
        "host_end_result",
        {
          player1: session.player1,
          player2: session.player2,
          roundCount,
          winningPlayer,
          rounds: session.rounds,
        },
        "#game-screen",
        "innerMorph",
      );
      const payloadPlayer = await renderTemplate(
        "clash_of_word",
        "player_end_result",
        {
          player1: session.player1,
          player2: session.player2,
          roundCount,
          winningPlayer,
          rounds: session.rounds,
        },
        "#game-screen",
        "innerMorph",
      );

      // Update Host Screen
      sendToHost({ sessionId, payloadHost, hostConnections });
      // Update Both Players
      sendToPlayers({ sessionId, payloadPlayer, playerConnections });
    }
  },
};

export default host;
