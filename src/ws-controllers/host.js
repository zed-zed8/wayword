//? models
import COWsession from "../models/games/clash_of_word.js";

import {
  hostConnections,
  playerConnections,
  renderTemplate,
  sendToHost,
  sendToPlayers,
  sendToPlayer,
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

  if (!Number.isInteger(amount) || amount < 0 || amount > letters.length) {
    throw new RangeError(
      `Letter amount must be between 0 and ${letters.length}.`,
    );
  }

  const selectedLetters = [];
  const availableLetter = [...letters];

  for (let index = 0; index < amount; index++) {
    let randomIndex = Math.floor(Math.random() * availableLetter.length);
    selectedLetters.push(availableLetter[randomIndex]);
    availableLetter.splice(randomIndex, 1);
  }
  return selectedLetters;
}

async function getRunningSession(hostId) {
  return COWsession.findOne({
    host: hostId,
    gamestatus: "running",
  })
    .populate("player1.playerId")
    .populate("player2.playerId");
}

async function sendGameScreenToPlayers({
  session,
  sessionId,
  availableLetter,
  roundCount,
  hostUser,
}) {
  const sockets = playerConnections.get(sessionId);

  if (!sockets) {
    return;
  }

  for (const playerSocket of sockets) {
    if (playerSocket.readyState !== playerSocket.OPEN) {
      continue;
    }

    const payloadPlayer = await renderTemplate(
      "clash_of_word",
      "player_game_screen",
      {
        player1: session.player1,
        player2: session.player2,
        hostUser,
        currentUser: {
          _id: playerSocket.playerId,
          username: playerSocket.username,
        },
        playerSlot: playerSocket.playerSlot,
        availableLetter,
        roundCount,
      },
      "#game-screen",
      "innerMorph",
    );

    sendToPlayer({ playerSocket, payloadPlayer });
  }
}

const host = {
  async connection(ws, req) {
    console.log("Host connected");
    let sessionId;

    const hostId = req.session.user?._id;

    if (!hostId) {
      ws.close(4001, "Unauthorized");
      return;
    }

    try {
      // check if this host already have a session running
      let existingSession = await getRunningSession(hostId);

      if (!existingSession) {
        ws.close(4004, "Game session not found");
        return null;
      }

      sessionId = existingSession?._id.toString();
      console.log(`Resuming existing session: ${sessionId}`);

      // set memory Maps
      hostConnections.set(sessionId, ws);

      // Only create a new player set if one doesn't already exist for this session
      if (!playerConnections.has(sessionId)) {
        playerConnections.set(sessionId, new Set());
      }

      // init pages
      if (!req.session.pages) {
        req.session.pages = "lobby";
      }
      ws.session = req.session;

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
          const availableLetter = existingSession.currentAvailableLetter;
          const roundCount = existingSession.rounds.length + 1;

          const payloadHost = await renderTemplate(
            "clash_of_word",
            "host_game_screen",
            {
              player1: existingSession.player1,
              player2: existingSession.player2,
              availableLetter,
              roundCount,
            },
            "#game-screen",
            "innerMorph",
          );

          sendToHost({ sessionId, payloadHost, hostConnections });

          await sendGameScreenToPlayers({
            session: existingSession,
            sessionId,
            availableLetter,
            roundCount,
            hostUser: req.session.user,
          });
          break;
        }

        case "gameRoundResult": {
          const lastRound = existingSession.rounds.at(-1);

          if (lastRound) {
            const isEnd =
              existingSession.player1.health <= 0 ||
              existingSession.player2.health <= 0;

            const difference = Math.abs(
              (lastRound.score1 ?? 0) - (lastRound.score2 ?? 0),
            );

            const winningPlayer =
              lastRound.result === "player1win"
                ? "player 1"
                : lastRound.result === "player2win"
                  ? "player 2"
                  : lastRound.result === "draw"
                    ? "draw"
                    : undefined;

            const payloadHost = await renderTemplate(
              "clash_of_word",
              "round_result",
              {
                round: lastRound,
                winningPlayer,
                difference,
                isEnd,
              },
              "#round-result",
              "innerMorph",
            );

            sendToHost({ sessionId, payloadHost, hostConnections });
          }
          break;
        }

        case "gameEnd": {
          console.log("host end game result");

          const roundCount = existingSession.rounds.length;
          let winningPlayer;

          if (existingSession.player1.health <= 0) {
            winningPlayer = "Player 2 Win";
          } else if (existingSession.player2.health <= 0) {
            winningPlayer = "Player 1 Win";
          }

          const payloadHost = await renderTemplate(
            "clash_of_word",
            "host_end_result",
            {
              player1: existingSession.player1,
              player2: existingSession.player2,
              roundCount,
              winningPlayer,
              rounds: existingSession.rounds,
            },
            "#game-screen",
            "innerMorph",
          );

          sendToHost({ sessionId, payloadHost, hostConnections });
          break;
        }

        default:
          req.session.pages = "lobby";
          await req.session.save();
          break;
      }

      return sessionId;
    } catch (err) {
      console.error("Failed to initialize host socket:", err);

      if (ws.readyState === ws.OPEN) {
        ws.close(1011, "Internal Server Error");
      }

      return null;
    }
  },
  async message(ws, message, req) {
    const data = JSON.parse(message);

    // update: host player joined list
    // expected data: { username: "", playerId: "" }
    if (data.type === "playerJoined") {
      if (!data.playerId || !data.username) {
        return;
      }

      // init host req.session.playerJoined
      if (!Array.isArray(req.session.playerJoined)) {
        req.session.playerJoined = []; // an array of object { username: "", playerId: "" }
      }

      // Do not add the same player more than once.
      const alreadyJoined = req.session.playerJoined.some(
        (player) => String(player.playerId) === String(data.playerId),
      );

      // and do not have more thann 2 player
      if (!alreadyJoined && req.session.playerJoined.length < 2) {
        console.log("[Line ~294~, File host.js] Joined Player: ");
        console.log(req.session.playerJoined);
        req.session.playerJoined.push({
          username: data.username,
          playerId: data.playerId,
        });
      }

      // Force the session to save immediately
      await req.session.save();
      return;
    }

    // host start game
    // expected data: {  }
    // can be used as continue to next round
    if (data.type === "startGame") {
      // TODO handle the host press start button
      // TODO handle the host continue next round
      // find session using hostId and populate them
      const hostId = req.session.user._id;

      if (!hostId) {
        ws.close(4001, "Unauthorized");
        return;
      }

      const session = await getRunningSession(hostId);

      if (!session) {
        return;
      }
      if (!session.player1.playerId || !session.player2.playerId) {
        return;
      }

      req.session.pages = "gameRunning";
      // Force the session to save immediately
      await req.session.save();

      console.log("game is running");
      console.log(req.session.pages);

      const sessionId = session._id.toString();

      // Start a new round.
      session.player1.word = "";
      session.player1.status = "active";
      session.player2.word = "";
      session.player2.status = "active";

      // generate available letter
      const availableLetter = generateLetter();
      session.currentAvailableLetter = availableLetter;
      await session.save();

      const roundCount = session.rounds.length + 1;

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
      // Each player gets a payload rendered for their own player slot.
      await sendGameScreenToPlayers({
        session,
        sessionId,
        availableLetter,
        roundCount,
        hostUser: req.session.user,
      });

      return;
    }

    // host start game
    // expected data: {  }
    if (data.type === "roundResult") {
      // TODO handle round result result
      // find session using hostId and populate them
      const hostId = req.session.user._id;

      if (!hostId) {
        ws.close(4001, "Unauthorized");
        return;
      }

      const session = await getRunningSession(hostId);
      if (!session) {
        return;
      }

      // The host may only resolve a round after both players submitted.
      if (
        session.player1.status !== "waiting" ||
        session.player2.status !== "waiting"
      ) {
        return;
      }

      const word1 = session.player1.word ?? "";
      const word2 = session.player2.word ?? "";

      if (!word1 || !word2) {
        return;
      }

      console.log("host roundResult happen");
      req.session.pages = "gameRoundResult";
      await req.session.save();

      const sessionId = session._id.toString();

      let player1health = session.player1.health;
      let player2health = session.player2.health;

      // calculate score (length * 10)
      const score1 = word1.length * 10;
      const score2 = word2.length * 10;

      // calculate health
      const scoreDifference = score1 - score2;
      const difference = Math.abs(scoreDifference);

      let result;
      let winningPlayer;

      if (scoreDifference > 0) {
        // player 1 win
        player2health -= difference;
        result = "player1win";
        session.player2.health = player2health; // update health
        winningPlayer = "player 1";
      } else if (scoreDifference < 0) {
        // player 2 win
        player1health -= difference;
        result = "player2win";
        session.player1.health = player1health; // update health
        winningPlayer = "player 2";
      } else {
        // draw
        result = "draw";
      }

      // create round and save it to db
      const roundCount = session.rounds.length + 1;
      const round = {
        round: roundCount,
        player1health,
        player2health,
        word1,
        word2,
        score1,
        score2,
        result,
        availableLetter: session.currentAvailableLetter,
      };

      session.rounds.push(round);
      await session.save();

      const isEnd = player1health <= 0 || player2health <= 0;

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
        },
        "#round-result",
        "innerMorph",
      );
      sendToPlayers({ sessionId, payloadPlayer, playerConnections });

      return;
    }

    // host end game
    // exprected data {}
    if (data.type === "endGame") {
      // TODO handle end game result
      // find session using hostId and populate them
      const hostId = req.session.user._id;

      if (!hostId) {
        ws.close(4001, "Unauthorized");
        return;
      }

      const session = await getRunningSession(hostId);
      if (!session) {
        return;
      }

      // The game can only be ended after a player has reached zero health.
      if (session.player1.health > 0 && session.player2.health > 0) {
        return;
      }

      console.log("host end game");
      const sessionId = session._id.toString();

      let winningPlayer;
      if (session.player1.health <= 0) {
        winningPlayer = "Player 2 Win";
      } else if (session.player2.health <= 0) {
        winningPlayer = "Player 1 Win";
      }

      const roundCount = session.rounds.length + 1;

      // Mark this exact session as finished. Do not delete every running game.
      session.gamestatus = "finished";
      await session.save();

      req.session.pages = "gameEnd";
      await req.session.save();

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

      const playerSockets = playerConnections.get(sessionId);

      if (playerSockets) {
        for (const playerWs of playerSockets) {
          console.log("playerWs.session:", playerWs.session);
          delete playerWs.session.pages;
          delete playerWs.session.cowSessionId;

          await playerWs.session.save();
        }
      }
      console.log("playerWs.session:", ws.session);
      delete ws.session.pages;
      delete ws.session.cowSessionId;
      delete ws.session.playerJoined;
      await ws.session.save();

      // The game is finished; active in-memory connection groups can be removed.
      playerConnections.delete(sessionId);
      return;
    }
  },
};

export default host;
