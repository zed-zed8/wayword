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
  if (!req.session.pages) {
    req.session.pages = "";
  }
  switch (req.session.pages) {
    case "": {
      let hostId = req.session.user._id;
      // creating new session in the DB
      const newSession = new COWsession(defaultSession(hostId));
      await newSession.save();
      let sessionId = newSession._id.toString();
      console.log(`Created brand new session: ${sessionId}`);
      req.session.pages = "lobby";

      res.render("games/clash_of_word/host", {
        playerJoined: 0,
        startButton: false,
      });
      break;
    }
    case "lobby": {
      let playerJoined = 0;
      console.log("playerJoined : " + req.session.playerJoined);
      if (req.session.playerJoined) {
        playerJoined = req.session.playerJoined;
      }
      let startButton = 0;
      console.log("startButton : " + req.session.startButton);
      if (req.session.startButton) {
        startButton = req.session.startButton;
      }
      res.render("games/clash_of_word/host", { playerJoined, startButton });
      break;
    }
    case "gameRunnning":
      console.log("host game is running");
      break;
    case "gameEnd":
      console.log("host end game result");
      break;
    default:
      throw Error("error at gamesController");
  }
};

const lobbyController = async (req, res) => {
  if (!req.session.pages) {
    req.session.pages = "";
  }
  // Check for a specific parameter
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
        if (!session) {
          return res
            .status(404)
            .send("Game session not found. Check the code on the screen.");
        }

        // Determine slot based directly on database state instead of an in-memory counter
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

        const targetPlayer = session[playerSlot];
        // Assign a unique Object ID to this player controller
        targetPlayer.playerId = req.session.user._id;
        await session.save(); // save the changes

        // Tell HTMX to update the browser URL bar with these extra query params
        res.setHeader(
          "HX-Push-Url",
          `/lobby?sessionId=${currentSessionId}&playerSlot=${playerSlot}`,
        );

        res.render("games/clash_of_word/player", {
          sessionId: currentSessionId,
          playerSlot: playerSlot,
        });
      } catch (error) {
        console.log(error);
        res.status(500).send("Error joining the session. " + error.message);
        // TODO error
      }
      req.session.pages = "lobby";
      break;
    case "lobby":
      let playerSlot = req.query.playerSlot;
      res.render("games/clash_of_word/player", {
        sessionId: currentSessionId,
        playerSlot: playerSlot,
      });
      break;
    case "gameRunnning":
      console.log("player game is running");
      break;
    case "gameEnd":
      console.log("host end game result");
      break;
    default:
      throw Error("error at gamesController");
  }
};

export { gamesController };
export { lobbyHostController };
export { lobbyController };
