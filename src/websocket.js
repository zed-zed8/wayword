import { WebSocketServer } from "ws";
import ejs from "ejs";
import path from "path";
import mongoose from "mongoose";
import { fileURLToPath } from "url";

//? models
import COWsession from "./models/games/clash_of_word.js";

//? controllers
import host from "./ws-controllers/host.js";
import player from "./ws-controllers/player.js";

// Recreate __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultSession = {
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

// Store active connections in memory
const hostConnections = new Map(); // sessionId -> Host WebSocket
const playerConnections = new Map(); // sessionId -> Set of Player WebSockets

export { hostConnections };
export { playerConnections };

// Simple async helper to render EJS files into HTML strings
const renderTemplate = (gamefilename, filename, data, hxtarget, hxswap) => {
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
      return;
    }
    const jsonRes = {
      content: htmlString,
      target: "#lobby-code",
      swap: "innerHTML",
    };

    return JSON.stringify(jsonRes);
  });
};
export { renderTemplate };

export function setupWebSocket(server) {
  const wssPlayer = new WebSocketServer({ noServer: true });
  const wssHost = new WebSocketServer({ noServer: true });

  //TODO implement game
  //? Player websocket
  wssPlayer.on("connection", (ws, req) => {
    console.log("Client connected");

    let currentSessionId = null;
    let playerAssignedId = null;

    const url = new URL(req.url, `http://${req.headers.host}`);
    // Easily grab the query variables sent by HTMX
    const sessionId = url.searchParams.get("sessionId");
    const playerSlot = url.searchParams.get("playerSlot"); // 'player1' or 'player2'
    console.log(sessionId);
    console.log(playerSlot);

    ws.on("message", async (message) => {
      const data = JSON.parse(message);

      // Player Joins
      if (data.type === "join") {
        return;
      }

      // --- 2. Player Submits Word ---
      if (data.type === "submitWord") {
        // Fetch session from DB
        const session = await COWsession.findById(currentSessionId);

        // Determine which player submitted based on their saved role
        const activePlayer = session[playerAssignedId];
        activePlayer.word = data.submittedWord;
        activePlayer.status = "waiting";

        // [RUN YOUR IN-MEMORY CALCULATIONS HERE WHEN BOTH ARE WAITING...]

        // Save changes to DB
        await session.save();

        // --- BROADCAST TO EVERYONE ---
        const payload = JSON.stringify({ type: "gameStateUpdated", session });

        // Update Host Screen
        hostConnections.get(currentSessionId).send(payload);

        // Update Both Players
        for (const client of playerConnections.get(currentSessionId)) {
          client.send(payload);
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
  wssHost.on("connection", (ws) => {
    console.log("Host connected");

    // 1. Generate the session in the DB immediately when a host opens the screen
    const newSession = new COWsession(defaultSession);
    newSession.save();
    const sessionId = newSession._id.toString();

    // 2. Track the host socket in memory
    hostConnections.set(sessionId, ws);
    playerConnections.set(sessionId, new Set());

    // 3. Send the ID back to the host screen
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "games",
      "clash_of_word",
      "partials",
      "lobbyCode.ejs",
    );
    ejs.renderFile(templatePath, { sessionId }, (err, htmlString) => {
      if (err) {
        console.error("EJS Render Error: ", err);
        return;
      }
      const jsonRes = {
        content: htmlString,
        target: "#lobby-code",
        swap: "innerHTML",
      };

      ws.send(JSON.stringify(jsonRes));
    });

    ws.on("close", async () => {
      console.log("Host disconnected");
      await COWsession.deleteMany({ gamestatus: "running" }).exec();
      hostConnections.delete(sessionId);
      playerConnections.delete(sessionId);
    });
  });

  //? Intercept the upgrade event
  server.on("upgrade", (request, socket, head) => {
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
