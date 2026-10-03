import mongoose from "mongoose";

const Schema = mongoose.Schema;

const playerSchema = new Schema({
  playerId: {
    type: Schema.Types.ObjectId,
    ref: "User", // Must match the string name used in mongoose.model
    // required objectId, but allow null
    validate: {
      validator: function (value) {
        // Allow explicit null, or check if it's a valid ObjectId instance
        return value === null || value instanceof mongoose.Types.ObjectId;
      },
      message: "playerId must be a valid ObjectId or null.",
    },
  },
  health: {
    type: Number,
    required: true,
  },
  word: {
    type: String,
  },
  status: {
    type: String,
    enum: ["waiting", "active"],
    default: "active",
  },
});

const roundSchema = new Schema({
  round: {
    type: Number,
    required: true,
  },
  player1health: {
    type: Number,
    required: true,
  },
  player2health: {
    type: Number,
    required: true,
  },
  word1: {
    type: String,
  },
  word2: {
    type: String,
  },
  score1: {
    type: Number,
  },
  score2: {
    type: Number,
  },
  result: {
    type: String,
    enum: ["player1win", "player2win", "draw"],
  },
  availableLetter: {
    type: [String],
    required: true,
  },
});

const sessionSchema = new Schema(
  {
    // This acts as your foreign key reference
    host: {
      type: Schema.Types.ObjectId,
      ref: "User", // Must match the exact model name string
      required: true,
    },
    gamestatus: {
      type: String,
      enum: ["running", "finished"],
    },
    player1: playerSchema,
    player2: playerSchema,
    currentAvailableLetter: {
      type: [String],
      required: true,
    },
    rounds: [roundSchema],
  },
  {
    // CRITICAL: Prevents a player from submitting two moves at the exact same time
    optimisticConcurrency: true,
  },
);

const COWSession = mongoose.model(
  "Session",
  sessionSchema,
  "history_clash_of_word",
);
export default COWSession;
