import { WebSocketServer } from "ws";
import ejs from "ejs";
import path from "path";
import mongoose from "mongoose";
import { fileURLToPath } from "url";

import { sessionMiddleware } from "./app.js";

//? models
import COWsession from "./models/games/clash_of_word.js";

//? controllers
import host from "./ws-controllers/host.js";
import player from "./ws-controllers/player.js";

// Helper function to run express-session manually over the websocket request
const runSession = (req) => {
  return new Promise((resolve) => {
    sessionMiddleware(req, {}, () => resolve());
  });
};

// Recreate __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultSession = function (hostId) {
  return {
    host: hostId,
    gamestatus: "running",
    player1: {
      playerId: new mongoose.Types.ObjectId(),
      health: 100,
      word: "",
      status: "active",
    }, // Placeholder IDs until players join
    player2: {
      playerId: new mongoose.Types.ObjectId(),
      health: 100,
      word: "",
      status: "active",
    },
    round: {
      round: 1,
      player1health: 100,
      player2health: 100,
      word1: "",
      word2: "",
      availableLetters: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"],
    },
  };
};

// Store active connections in memory
const hostConnections = new Map(); // sessionId -> Host WebSocket
const playerConnections = new Map(); // sessionId -> Set of Player WebSockets

export { hostConnections };
export { playerConnections };

/**
 * Simple async helper to render EJS files into HTML strings
 *
 * @param {String} gamefilename ex: clash_of_word
 * @param {String} filename ex:lobbyCode (without .ejs)
 * @param {ejs.Data} data ejs data object
 * @param {String} hxtarget ex:#lobby-code (css - swap selector)
 * @param {String} hxswap ex: innerHTML, innerMorph (htmx swap attributes)
 * @return {JSON.stringify} return json string
 */
const renderTemplate = (gamefilename, filename, data, hxtarget, hxswap) => {
  return new Promise((resolve, reject) => {
    try {
      const templatePath = path.join(
        __dirname,
        "..",
        "views",
        "games",
        gamefilename,
        "partials",
        filename + ".ejs",
      );

      ejs.renderFile(templatePath, { ...data }, (err, htmlString) => {
        if (err) {
          console.error("EJS Render Error: ", err);
          return reject(err); // Reject the promise if rendering fails
        }

        const jsonRes = {
          content: htmlString,
          target: hxtarget,
          swap: hxswap,
        };

        resolve(JSON.stringify(jsonRes)); // Resolve the promise with your JSON string
      });
    } catch (e) {
      console.log(e);
      reject(e);
    }
  });
};
export { renderTemplate };

export function setupWebSocket(server) {
  const wssPlayer = new WebSocketServer({ noServer: true });
  const wssHost = new WebSocketServer({ noServer: true });

  //TODO implement game
  //? Player websocket
  wssPlayer.on("connection", async (ws, req) => {
    console.log("Client connected");

    const url = new URL(req.url, `http://${req.headers.host}`);
    // Easily grab the query variables sent by HTMX
    const sessionId = url.searchParams.get("sessionId");
    const playerSlot = url.searchParams.get("playerSlot"); // 'player1' or 'player2'
    console.log(sessionId);
    console.log(playerSlot);

    // INITIALIZE ONLY ONCE: Check if a player exists, if not, create it
    const playerConn = playerConnections.get(sessionId);
    if (playerConn && !playerConn.has(ws)) {
      playerConnections.get(sessionId).add(ws);

      const username = req.session.user.username;
      const payloadHost = await renderTemplate(
        "clash_of_word",
        "joined_player",
        { username },
        "#joined-player",
        "beforeend",
      );

      // Update Host Screen to add the user there
      hostConnections.get(sessionId).send(payloadHost);

      // TODO start game when both player are on
      // TODO and update the host to be able to start
      if (playerConnections.get(sessionId).size == 2) {
        console.log("play");

        const payloadHost = await renderTemplate(
          "clash_of_word",
          "start_button",
          {},
          "#startButton",
          "innerMorph",
        );
        hostConnections.get(sessionId).send(payloadHost);
      }
      console.log(req.session.user);
    }

    ws.on("message", async (message) => {
      const data = JSON.parse(message);

      // Player Submits Word
      if (data.type === "submitWord") {
        const session = await COWsession.findById(sessionId);

        const activePlayer = session[playerSlot];
        activePlayer.word = data.submittedWord;
        activePlayer.status = "waiting";

        // TODO [RUN YOUR IN-MEMORY CALCULATIONS HERE WHEN BOTH ARE WAITING...]

        await session.save();

        // TODO BROADCAST TO EVERYONE
        const payloadHost = await renderTemplate(
          "clash_of_word",
          "host_game_screen",
          {},
          "#game-screen",
          "innerMorph",
        );
        const payloadClient = renderTemplate(
          "clash_of_word",
          "player_game_screen",
          {},
          "#game-screen",
          "innerMorph",
        );

        // Update Host Screen
        hostConnections.get(sessionId).send(payloadHost);

        // Update Both Players
        for (const client of playerConnections.get(sessionId)) {
          client.send(payloadClient);
        }
      }
    });

    ws.on("close", () => {
      console.log("Client disconnected");
      if (sessionId && playerConnections.has(sessionId)) {
        playerConnections.get(sessionId).delete(ws);
      }
    });
  });

  //? Host websocket
  wssHost.on("connection", async (ws, req) => {
    console.log("Host connected");
    // TODO (maybe) add page so that i can have two event (starting connecting, and start game button) inside the host screen
    let pages = "lobby";
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

      if (existingSession) {
        // Host refreshed or reconnected! Grab the existing ID
        sessionId = existingSession._id.toString();
        console.log(`Resuming existing session: ${sessionId}`);
      } else {
        // Brand new session! Create it in the DB
        const newSession = new COWsession(defaultSession(hostId));
        await newSession.save();
        sessionId = newSession._id.toString();
        console.log(`Created brand new session: ${sessionId}`);
      }

      // Now that we guaranteed we have a valid sessionId, update our memory Maps
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

    async function sendPage() {
      switch (pages) {
        case "lobby":
          // 3. Send the ID back to the host screen
          const payloadHost = await renderTemplate(
            "clash_of_word",
            "lobbyCode",
            { sessionId },
            "#lobby-code",
            "innerMorph",
          );
          ws.send(payloadHost);
          break;
        case "initialState":
          console.log("startgame");
          break;
      }
    }

    ws.on("message", async (message) => {
      const data = JSON.parse(message);

      // Player Submits Word
      if (data.type === "startGame") {
        // TODO handle the host press start button
      }
    });

    await sendPage();

    ws.on("close", async () => {
      console.log("Host disconnected");
      await COWsession.deleteMany({ gamestatus: "running" }).exec();
      hostConnections.delete(sessionId);
      playerConnections.delete(sessionId);
    });
  });

  //? Intercept the upgrade event
  server.on("upgrade", async (request, socket, head) => {
    // 1. Manually populate req.session
    await runSession(request);

    const url = new URL(request.url, `http://${request.headers.host}`);

    // Crucial: ws handles the actual handshake inside this method
    if (url.pathname === "/player") {
      wssPlayer.handleUpgrade(request, socket, head, (ws) => {
        wssPlayer.emit("connection", ws, request);
      });
    } else if (url.pathname === "/host") {
      wssHost.handleUpgrade(request, socket, head, (ws) => {
        wssHost.emit("connection", ws, request);
      });
    } else {
      socket.destroy();
    }
  });
}
