//? models
import COWsession from "../models/games/clash_of_word.js";

import {
  hostConnections,
  playerConnections,
  renderTemplate,
  sendToHost,
  sendToPlayers,
} from "../websocket.js";

const player = {
  async connection(ws, req) {
    console.log("Client connected");

    // Easily grab the query variables sent by HTMX
    const url = new URL(req.url, `http://${req.headers.host}`);
    const sessionId = url.searchParams.get("sessionId");
    const playerSlot = url.searchParams.get("playerSlot"); // 'player1' or 'player2'
    console.log("Session Id: " + sessionId);
    console.log("Player Slot: " + playerSlot);

    // INITIALIZE ONLY ONCE: Check if a player exists, if not, create it
    const playerConn = playerConnections.get(sessionId);
    if (
      (req.session.pages === "" || req.session.pages === "lobby") &&
      playerConn &&
      !playerConn.has(ws)
    ) {
      playerConnections.get(sessionId).add(ws);
      console.log("A new player connected with ws:");
      // console.log(ws);

      const username = req.session.user?.username;
      const playerId = req.session.user._id;

      // Update Host Screen to add the user there
      const payloadHost = await renderTemplate(
        "clash_of_word",
        "joined_player",
        { username, playerId },
        "#joined-player",
        "beforeend",
      );
      sendToHost({ sessionId, payloadHost, hostConnections });

      // check if there are 2 players
      if (playerConnections.get(sessionId).size == 2) {
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
  },
  // TODO finish this
  async message(ws, message, req) {
    const data = JSON.parse(message);

    const url = new URL(req.url, `http://${req.headers.host}`);
    const sessionId = url.searchParams.get("sessionId"); // sessionId = clash_of_word_id
    const playerSlot = url.searchParams.get("playerSlot"); // 'player1' or 'player2'

    // Player Submits Word
    // expected data: { summittedWord: "" }
    if (data.type === "submitWord") {
      const session = await COWsession.findById(sessionId);

      const activePlayer = session[playerSlot];

      // TODO later verify word
      activePlayer.word = data.submittedWord;
      activePlayer.status = "waiting";

      // save session
      await session.save();

      // BROADCAST TO EVERYONE
      if (
        session.player1.status == "waiting" &&
        session.player2.status == "waiting"
      ) {
        // handle both player waiting
        // send round result to host
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
      }
      else {
        let whichPlayer;
        if (session.player1.status == "waiting") {
          whichPlayer = "player1";
        } else if (session.player2.status == "waiting") {
          whichPlayer = "player2";
        }

        // send the updated round to everyone
        const payloadHost = await renderTemplate(
          "clash_of_word",
          "player_side",
          {
            player1: session.player1,
            player2: session.player2,
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
    }
  },
};

export default player;
