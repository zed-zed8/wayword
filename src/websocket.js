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
function sendToPlayer({ playerSocket, payloadPlayer }) {
  if (!playerSocket || playerSocket.readyState !== playerSocket.OPEN) {
    return false;
  }

  playerSocket.send(payloadPlayer);
  return true;
}
export { sendToHost };
export { sendToPlayers };
export { sendToPlayer };

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
    let sessionId = null;

    try {
      sessionId = await player.connection(ws, req);

      if (!sessionId) {
        if (ws.readyState === ws.OPEN) {
          ws.close(4004, "Invalid game session");
        }
        return;
      }

      ws.on("message", async (message) => {
        try {
          await player.message(ws, message, req);
        } catch (error) {
          console.error("Player WebSocket message error:", error);

          if (ws.readyState === ws.OPEN) {
            ws.close(1011, "Internal Server Error");
          }
        }
      });

      ws.on("close", () => {
        console.log("Client disconnected");

        if (sessionId && playerConnections.has(sessionId)) {
          const connections = playerConnections.get(sessionId);
          connections.delete(ws);

          if (connections.size === 0) {
            playerConnections.delete(sessionId);
          }
        }
      });
    } catch (error) {
      console.error("Player WebSocket connection error:", error);

      if (ws.readyState === ws.OPEN) {
        ws.close(1011, "Internal Server Error");
      }
    }
  });

  //? Host websocket
  wssHost.on("connection", async (ws, req) => {
    let sessionId = null;

    try {
      sessionId = await host.connection(ws, req);

      if (!sessionId) {
        if (ws.readyState === ws.OPEN) {
          ws.close(4004, "Invalid game session");
        }
        return;
      }

      ws.on("message", async (message) => {
        try {
          await host.message(ws, message, req);
        } catch (error) {
          console.error("Host WebSocket message error:", error);

          if (ws.readyState === ws.OPEN) {
            ws.close(1011, "Internal Server Error");
          }
        }
      });

      ws.on("close", async () => {
        console.log("Host disconnected");
        if (hostConnections.get(sessionId) === ws) {
          hostConnections.delete(sessionId);
        }
      });
    } catch (error) {
      console.error("Player WebSocket connection error:", error);

      if (ws.readyState === ws.OPEN) {
        ws.close(1011, "Internal Server Error");
      }
    }
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
