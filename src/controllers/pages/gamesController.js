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
  const currentSessionId = req.query.lobbyCode;
  console.log(currentSessionId);

  // TODO verify login
  try {
    // 1. Fetch from DB to make sure the host room exists
    const session = await COWsession.findById(currentSessionId);
    if (!session) {
      return res
        .status(404)
        .send("Game session not found. Check the code on the screen.");
    }

    // 2. In-Memory Calculation: Verify the chosen slot is empty
    const playerSlot =
      playerConnections.get(currentSessionId).size % 2 == 0
        ? "player1"
        : "player2";
    const targetPlayer = session[playerSlot];

    // Assign a unique Object ID to this player controller if not set
    targetPlayer.playerId = req.session.user._id;

    // 3. Save the assignment to MongoDB
    await session.save();

    res.render("games/clash_of_word/player", {
      sessionId: currentSessionId,
      playerSlot: playerSlot,
    });
  } catch (error) {
    res.status(500).send("Error joining the session.");
  }
};

export { gamesController };
export { lobbyHostController };
export { lobbyController };
