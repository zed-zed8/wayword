import { WebSocketServer } from "ws";
import ejs from "ejs";
import path from "path";
import { fileURLToPath } from "url";

import { sessionMiddleware } from "./app.js";

//? controllers
import host from "./ws-controllers/host.js";
import player from "./ws-controllers/player.js";
// Helper function to run express-session manually over the websocket request // req.session
const runSession = (req) => {
  return new Promise((resolve, reject) => {
    sessionMiddleware(req, {}, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
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
      playerId: null,
      health: 100,
      word: "",
      status: "active",
    }, // Placeholder IDs until players join
    player2: {
      playerId: null,
      health: 100,
      word: "",
      status: "active",
    },
    currentAvailableLetter: [],
    rounds: [],
  };
};
export { defaultSession };

// Store active connections and state in memory
const hostConnections = new Map(); // sessionId -> Host WebSocket
const playerConnections = new Map(); // sessionId -> Set of Player WebSockets

export { hostConnections };
export { playerConnections };

function sendToHost({ sessionId, payloadHost, hostConnections }) {
  const hostSocket = hostConnections.get(sessionId);

  // Update a host
  hostSocket.send(payloadHost);
}
function sendToPlayers({ sessionId, payloadPlayer, playerConnections }) {
  const playerSockets = playerConnections.get(sessionId);

  // Update Both Players
  for (const player of playerSockets) {
    player.send(payloadPlayer);
  }
}
export { sendToPlayers };
export { sendToHost };

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
function renderTemplate(gamefilename, filename, data, hxtarget, hxswap) {
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
}
export { renderTemplate };

export function setupWebSocket(server) {
  const wssPlayer = new WebSocketServer({ noServer: true });
  const wssHost = new WebSocketServer({ noServer: true });

  //TODO implement game
  //? Player websocket
  wssPlayer.on("connection", async (ws, req) => {
    let sessionId = await player.connection(ws, req);

    ws.on("message", async (message) => {
      await player.message(ws, message, req);
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
    let sessionId = await host.connect(ws, req);

    ws.on("message", async (message) => {
      await host.message(ws, message, req);
    });

    ws.on("close", async () => {
      console.log("Host disconnected");
      hostConnections.delete(sessionId);
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
