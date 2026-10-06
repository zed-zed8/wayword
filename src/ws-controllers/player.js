import en from "dictionary-en";
import nspell from "nspell";
import mongoose from "mongoose";

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

const player = {
  async connection(ws, req) {
    const userId = req.session.user?._id;

    if (!userId || !mongoose.isValidObjectId(userId)) {
      ws.close(4001, "Unauthorized");
      return null;
    }
    console.log("Client connected");

    // Easily grab the query variables sent by HTMX
    const url = new URL(req.url, `http://${req.headers.host}`);
    const sessionId = url.searchParams.get("sessionId");
    const playerSlot = url.searchParams.get("playerSlot"); // 'player1' or 'player2'
    console.log("Session Id: " + sessionId);
    console.log("Player Slot: " + playerSlot);

    if (
      !sessionId ||
      !mongoose.isValidObjectId(sessionId) ||
      (playerSlot !== "player1" && playerSlot !== "player2")
    ) {
      ws.close(4002, "Invalid player connection data");
      return null;
    }

    try {
      const session = await COWsession.findById(sessionId);

      if (!session || session.gamestatus !== "running") {
        ws.close(4004, "Game session not found");
        return null;
      }

      const assignedPlayer = session[playerSlot];

      if (
        !assignedPlayer?.playerId ||
        assignedPlayer.playerId.toString() !== userId.toString()
      ) {
        ws.close(4003, "You are not assigned to this player slot");
        return null;
      }

      // Store the identity on the WebSocket so later messages do not have to
      // trust the playerSlot supplied by the browser.
      ws.sessionId = sessionId;
      ws.playerSlot = playerSlot;
      ws.playerId = userId.toString();
      ws.username = req.session.user.username;
      ws.session = req.session;

      if (!playerConnections.has(sessionId)) {
        playerConnections.set(sessionId, new Set());
      }

      const connections = playerConnections.get(sessionId);

      // A reconnect should not announce the same player as a new player.
      const alreadyConnected = [...connections].some(
        (connection) => connection.playerId === ws.playerId,
      );

      connections.add(ws);
      console.log("A new player connected with ws:");

      if (!alreadyConnected) {
        // Update Host Screen to add the user there
        const payloadHost = await renderTemplate(
          "clash_of_word",
          "joined_player",
          {
            username: ws.username,
            playerId: ws._id,
          },
          "#joined-player",
          "beforeend",
        );
        sendToHost({ sessionId, payloadHost, hostConnections });

        // check if there are 2 players
        if (playerConnections.get(sessionId).size >= 2) {
          console.log("play");

          // send the play button to the host
          const payloadHost = await renderTemplate(
            "clash_of_word",
            "start_button",
            {},
            "#startButton",
            "outerMorph",
          );
          sendToHost({ sessionId, payloadHost, hostConnections });
        }
      }

      return sessionId;
    } catch (error) {
      console.error("Failed to initialize player socket:", error);

      if (ws.readyState === ws.OPEN) {
        ws.close(1011, "Internal Server Error");
      }

      return null;
    }
  },
  async message(ws, message, req) {
    let data;

    try {
      data = JSON.parse(message.toString());
    } catch {
      console.warn("Player sent invalid JSON.");
      return;
    }

    if (!data || typeof data.type !== "string") {
      return;
    }

    const sessionId = ws.sessionId; // sessionId = clash_of_word_id
    const playerSlot = ws.playerSlot; // 'player1' or 'player2'
    const userId = req.session.user?._id;

    if (!sessionId || !playerSlot || !userId) {
      console.error(
        "error at player.js ws on either !sessionId || !playerSlot || !userId",
      );
      return;
    }

    // Player Submits Word
    // expected data: { summittedWord: "" }
    if (data.type === "submitWord") {
      const session = await COWsession.findById(sessionId);

      if (!session || session.gamestatus !== "running") {
        console.error('playerjs: !session || session.gamestatus !== "running"');
        return;
      }

      // Never trust the slot from the request URL after connection.
      const activePlayer = session[playerSlot];

      if (
        !activePlayer?.playerId ||
        activePlayer.playerId.toString() !== userId.toString()
      ) {
        console.error("playerjs: line ~163~ on submitWord");
        return;
      }

      // Do not allow a player to submit again until the next round.
      if (activePlayer.status !== "active") {
        return;
      }

      if (typeof data.submittedWord !== "string") {
        return;
      }

      // TODO later verify word
      const wordLetters = data.submittedWord.trim().split("");

      // length check
      if (data.submittedWord.trim().length < 2) {
        console.log("word must be more than 1 letter long");
        const payloadPlayer = await renderTemplate(
          "clash_of_word",
          "wrong",
          {
            message: "word must be more than 1 letter long",
          },
          `#message`,
          "innerMorph",
        );
        sendToPlayer({ playerSocket: ws, payloadPlayer });
        return;
      }

      // available letter check
      const availableLetter = [
        ...session.currentAvailableLetter.map((value) => value.toLowerCase()),
      ];
      if (
        !wordLetters.every((letter) =>
          availableLetter.includes(letter.toLowerCase()),
        )
      ) {
        console.log("You used forbidden letter");
        const payloadPlayer = await renderTemplate(
          "clash_of_word",
          "wrong",
          {
            message: "You used forbidden letter",
          },
          `#message`,
          "innerMorph",
        );
        sendToPlayer({ playerSocket: ws, payloadPlayer });
        return;
      }

      // word check
      const spell = nspell(en);
      if (!spell.correct(data.submittedWord.trim())) {
        console.log("words doesnt exist");
        const payloadPlayer = await renderTemplate(
          "clash_of_word",
          "wrong",
          {
            message: "words doesnt exist",
          },
          `#message`,
          "innerMorph",
        );
        sendToPlayer({ playerSocket: ws, payloadPlayer });
        return;
      }

      activePlayer.word = data.submittedWord.trim();
      activePlayer.status = "waiting";

      // save session
      await session.save();

      // BROADCAST TO EVERYONE
      if (
        session.player1.status == "waiting" &&
        session.player2.status == "waiting"
      ) {
        // Both players are now waiting. Update both player cards first so
        // neither client keeps displaying a stale submit form.
        for (const targetPlayerSlot of ["player1", "player2"]) {
          const payloadPlayer = await renderTemplate(
            "clash_of_word",
            "player_side",
            {
              player1: session.player1,
              player2: session.player2,
              playerSlot: targetPlayerSlot,
              currentUser: req.session.user,
              availableLetter: session.currentAvailableLetter,
            },
            `#${targetPlayerSlot}`,
            "innerMorph",
          );

          sendToPlayers({
            sessionId,
            payloadPlayer,
            playerConnections,
          });
        }

        const payloadHost = await renderTemplate(
          "clash_of_word",
          "host_round_result",
          {
            player1: session.player1,
            player2: session.player2,
            currentUser: req.session.user,
            availableLetter: session.currentAvailableLetter,
          },
          "#round-result",
          "innerMorph",
        );
        // Update Host Screen
        sendToHost({ sessionId, payloadHost, hostConnections });
        return;
      }

      let whichPlayer;
      if (session.player1.status == "waiting") {
        whichPlayer = "player1";
      } else if (session.player2.status == "waiting") {
        whichPlayer = "player2";
      }

      if (!whichPlayer) {
        console.error("player.js: !whichPlayer");
        return;
      }

      // send the updated round to everyone
      const payloadHost = await renderTemplate(
        "clash_of_word",
        "player_side",
        {
          player1: session.player1,
          player2: session.player2,
          playerSlot: whichPlayer,
          currentUser: req.session.user,
          availableLetter: session.currentAvailableLetter,
        },
        `#${whichPlayer}`,
        "innerMorph",
      );
      const payloadPlayer = await renderTemplate(
        "clash_of_word",
        "player_side",
        {
          player1: session.player1,
          player2: session.player2,
          playerSlot: whichPlayer,
          currentUser: req.session.user,
          availableLetter: session.currentAvailableLetter,
        },
        `#${whichPlayer}`,
        "innerMorph",
      );

      // Update Host Screen
      sendToHost({ sessionId, payloadHost, hostConnections });
      // Update Both Players
      sendToPlayers({ sessionId, payloadPlayer, playerConnections });
    }
  },
};

export default player;
