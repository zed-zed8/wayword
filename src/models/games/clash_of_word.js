import mongoose from "mongoose";

const Schema = mongoose.Schema;

const playerSchema = new Schema({
  playerId: {
    type: Schema.Types.ObjectId,
    ref: "User", // Must match the string name used in mongoose.model
    required: true, // Simulates a NOT NULL foreign key constraint
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
  avaiableLetter: {
    type: [String],
    required: true,
  },
});

const sessionSchema = new Schema(
  {
    gamestatus: {
      type: String,
      enum: ["running", "finished"],
    },
    player1: playerSchema,
    player2: playerSchema,
    round: roundSchema,
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
