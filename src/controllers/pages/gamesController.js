import COWsession from "../../models/games/clash_of_word.js";
import { playerConnections } from "../../websocket.js";

const gamesController = (req, res) => {
  const isHTMXReq = req.get("HX-Request") === "true";
  if (isHTMXReq) {
    res.render("pages/games");
  } else {
    res.render("index", { page: "games" });
  }
};

const lobbyHostController = async (req, res) => {
  res.render("games/clash_of_word/host");
};

const lobbyController = async (req, res) => {
  // Check for a specific parameter
  let currentSessionId;
  if (req.query.lobbyCode) {
    currentSessionId = req.query.lobbyCode;
  } else {
    currentSessionId = req.query.sessionId;
  }

  console.log(currentSessionId);

  try {
    // 1. Fetch from DB to make sure the host room exists
    const session = await COWsession.findById(currentSessionId);
    if (!session) {
      return res
        .status(404)
        .send("Game session not found. Check the code on the screen.");
    }

    // 2. In-Memory Calculation: Verify the chosen slot is empty
    let playerSlot;
    if (
      req.query.playerSlot === "player1" ||
      req.query.playerSlot === "player2"
    ) {
      playerSlot = req.query.playerSlot;
    } else {
      playerSlot =
        playerConnections.get(currentSessionId).size % 2 == 0
          ? "player1"
          : "player2";
    }
    const targetPlayer = session[playerSlot];

    // Assign a unique Object ID to this player controller if not set
    targetPlayer.playerId = req.session.user._id;

    // 3. Save the assignment to MongoDB
    await session.save();

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
    res.status(500).send("Error joining the+ session. " + error.message);
    // TODO error
  }
};

export { gamesController };
export { lobbyHostController };
export { lobbyController };
