import mongoose from "mongoose";
import COWsession from "../../models/games/clash_of_word.js";
import { defaultSession } from "../../websocket.js";

const gamesController = (req, res) => {
  const isHTMXReq = req.get("HX-Request") === "true";
  if (isHTMXReq) {
    res.render("pages/games");
  } else {
    res.render("index", { page: "games" });
  }
};

const lobbyHostController = async (req, res) => {
  // init pages
  if (!req.session.pages) {
    req.session.pages = "";
  }

  switch (req.session.pages) {
    case "": {
      try {
        // TODO handle initialization
        // creating new session in the DB with the default
        const hostId = req.session.user._id;
        const newSession = new COWsession(defaultSession(hostId));
        await newSession.save();

        //? sessionId = clash_of_word_id
        let sessionId = newSession._id.toString();
        console.log(`Created brand new session: ${sessionId}`);

        // Keep the host's lobby state in the HTTP session.
        req.session.pages = "lobby";
        req.session.cowSessionId = sessionId;
        req.session.playerJoined = [];
        await req.session.save();

        // render the iniial lobby pages to host
        res.render("games/clash_of_word/host", {
          playerJoined: 0,
          startable: false,
        });
      } catch (error) {
        console.error("Failed to create game session:", error);
        res.status(500).send("Failed to create game session.");
      }
      break;
    }
    case "lobby": {
      // TODO handle lobby on refresh
      const playerJoined = Array.isArray(req.session.playerJoined)
        ? req.session.playerJoined
        : [];

      // filter uniquely
      const uniquePlayers = [];
      const seenIds = new Set();

      for (const player of playerJoined) {
        const currentId = String(player.playerId);

        if (!seenIds.has(currentId)) {
          seenIds.add(currentId);
          uniquePlayers.push(player);
        }
      }

      req.session.playerJoined = uniquePlayers;
      await req.session.save();

      console.log("playerJoined : " + req.session.playerJoined);
      console.log("uniquePlayers : " + uniquePlayers);

      // is startable
      const startable = uniquePlayers.length === 2;

      // render the lobby state to host
      res.render("games/clash_of_word/host", {
        playerJoined: uniquePlayers,
        startable,
      });
      break;
    }
    case "gameRunning": {
      // TODO later running game
      console.log("host game is running");
      break;
    }
    case "gameRoundResult": {
      // TODO later round result
      console.log("host game resulting round");
      break;
    }
    case "gameEnd": {
      // TODO later game result
      console.log("host end game result");
      break;
    }
    default:
      throw Error("error at gamesController");
  }
};

const lobbyController = async (req, res) => {
  // init pages
  if (!req.session.pages) {
    req.session.pages = "";
  }

  // Check for a specific parameter
  // sessionId = lobbyCode = clash_of_word_id
  const currentSessionId = req.query.lobbyCode || req.query.sessionId;

  if (!currentSessionId) {
    return res.status(400).send("A lobby code is required.");
  }
  if (!mongoose.isValidObjectId(currentSessionId)) {
    return res.status(400).send("Invalid lobby code.");
  }

  const userId = req.session.user?._id;
  if (!userId || !mongoose.isValidObjectId(userId)) {
    return res.status(401).send("Unauthorized.");
  }
  console.log("currentSessionId : " + currentSessionId);

  switch (req.session.pages) {
    case "":
      try {
        // Fetch from DB to make sure the host room exists
        const session = await COWsession.findById(currentSessionId);

        // handle error
        if (!session) {
          return res
            .status(404)
            .send("Game session not found. Check the code on the screen.");
        }

        if (session.gamestatus !== "running") {
          return res
            .status(400)
            .send("This game session is no longer running.");
        }

        const userIdString = userId.toString();

        // Rejoin the same slot if this user already belongs to the session.
        let playerSlot;
        if (
          session.player1.playerId &&
          session.player1.playerId.toString() === userIdString
        ) {
          playerSlot = "player1";
        } else if (
          session.player2.playerId &&
          session.player2.playerId.toString() === userIdString
        ) {
          playerSlot = "player1";
        } else {
          // Claim the first available slot.
          // The update condition prevents two simultaneous join requests from claiming the same slot
          let updatedSession = await COWsession.findOneAndUpdate(
            {
              _id: currentSessionId,
              gamestatus: "running",
              "player1.playerId": null,
            },
            { $set: { "player1.playerId": userId } },
            { new: true },
          );

          if (updatedSession) {
            playerSlot = "player1";
          } else {
            updatedSession = await COWsession.findOneAndUpdate(
              {
                _id: currentSessionId,
                gamestatus: "running",
                "player2.playerId": null,
              },
              { $set: { "player2.playerId": userId } },
              { new: true },
            );

            if (updatedSession) {
              playerSlot = "player2";
            } else {
              return res
                .status(400)
                .send("Room is full! Cannot have more than 2 players.");
            }
          }
        }

        console.log("player1_id : " + session.player1.playerId);
        console.log("player2_id : " + session.player2.playerId);
        console.log("user_id : " + req.session.user._id);

        // Tell HTMX to update the browser URL bar with these extra query params
        res.setHeader(
          "HX-Push-Url",
          `/lobby?sessionId=${currentSessionId}&playerSlot=${playerSlot}`,
        );

        // update pages to lobby before rendering so the WebSocket sees it
        req.session.pages = "lobby";
        req.session.cowSessionId = currentSessionId;
        await req.session.save();

        // render the init state to player
        res.render("games/clash_of_word/player", {
          sessionId: currentSessionId,
          playerSlot: playerSlot,
        });
      } catch (error) {
        console.log(error);
        res.status(500).send("Error joining the session. " + error.message);
      }
      break;

    case "lobby": {
      // get player slot from query
      let playerSlot = req.query.playerSlot;

      // render lobby
      res.render("games/clash_of_word/player", {
        sessionId: currentSessionId,
        playerSlot: playerSlot,
      });
      break;
    }
    case "gameRunning": {
      // TODO later running game
      console.log("player game is running");
      break;
    }
    case "gameRoundResult": {
      // TODO later round result
      console.log("player game resulting round");
      break;
    }
    case "gameEnd": {
      // TODO later game result
      console.log("player end game result");
      break;
    }
    default:
      throw Error("error at gamesController");
  }
};

export { gamesController };
export { lobbyHostController };
export { lobbyController };
