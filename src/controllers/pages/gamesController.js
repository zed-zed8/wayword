import COWsession from "../../models/games/clash_of_word.js";
import { playerConnections, defaultSession } from "../../websocket.js";

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
      // TODO handle initialization
      // creating new session in the DB with the default
      const hostId = req.session.user._id;
      const newSession = new COWsession(defaultSession(hostId));
      await newSession.save();

      //? sessionId = clash_of_word_id
      let sessionId = newSession._id.toString();
      console.log(`Created brand new session: ${sessionId}`);

      // update pages
      req.session.pages = "lobby";

      // render the iniial lobby pages to host
      res.render("games/clash_of_word/host", {
        playerJoined: 0,
        startable: false,
      });
      break;
    }
    case "lobby": {
      // TODO handle lobby on refresh
      // filter uniquely
      let seenIds = new Set();
      for (let i = 0; i < req.session.playerJoined.length; i++) {
        const currentId = req.session.playerJoined[i].playerId;

        if (seenIds.has(currentId)) {
          req.session.playerJoined.splice(i, 1); // Mutates original array by removing duplicate
          i--; // Step back so the next item isn't skipped
        } else {
          seenIds.add(currentId);
        }
      }

      // amount of player joined
      let playerJoined = {};
      console.log("playerJoined : " + req.session.playerJoined);
      if (req.session.playerJoined) {
        playerJoined = req.session.playerJoined;
      }

      // is startable
      console.log("playerConnections");
      console.log(playerConnections);
      let startable = false;
      if (playerJoined.length == 2) {
        startable = true;
      }

      // render the lobby state to host
      res.render("games/clash_of_word/host", { playerJoined, startable });
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
  let currentSessionId;
  if (req.query.lobbyCode) {
    currentSessionId = req.query.lobbyCode;
  } else {
    currentSessionId = req.query.sessionId;
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

        // determine slot based directly on database state instead of an in-memory counter
        let playerSlot;
        console.log("player1_id : " + session.player1.playerId);
        console.log("player2_id : " + session.player2.playerId);
        console.log("user_id : " + req.session.user._id);
        if (
          !session.player1.playerId ||
          session.player1.playerId.toString() ===
            req.session.user._id.toString()
        ) {
          playerSlot = "player1";
        } else if (
          !session.player2.playerId ||
          session.player2.playerId.toString() ===
            req.session.user._id.toString()
        ) {
          playerSlot = "player2";
        } else {
          return res
            .status(400)
            .send("Room is full! Cannot have more than 2 players.");
        }

        // assign this player id to the player slot
        const targetPlayer = session[playerSlot];
        targetPlayer.playerId = req.session.user._id;
        session.markModified(playerSlot);
        await session.save(); // save the changes

        // Tell HTMX to update the browser URL bar with these extra query params
        res.setHeader(
          "HX-Push-Url",
          `/lobby?sessionId=${currentSessionId}&playerSlot=${playerSlot}`,
        );

        // render the init state to player
        res.render("games/clash_of_word/player", {
          sessionId: currentSessionId,
          playerSlot: playerSlot,
        });

        // update pages to lobby
        req.session.pages = "lobby";
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
