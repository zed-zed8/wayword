import mongoose from "mongoose";
import User from "../../models/db/user.js";

import {
  gamesController,
  lobbyHostController,
  lobbyController,
} from "./gamesController.js";

const indexController = (req, res) => {
  res.render("index");
};
const homeController = (req, res) => {
  const isHTMXReq = req.get("HX-Request") === "true";
  if (isHTMXReq) {
    res.render("pages/home");
  } else {
    res.render("index", { page: "home" });
  }
};
const aboutController = (req, res) => {
  const isHTMXReq = req.get("HX-Request") === "true";
  if (isHTMXReq) {
    res.render("pages/about");
  } else {
    res.render("index", { page: "about" });
  }
};
const profileController = async (req, res) => {
  const userId = req.params.id;

  if (!mongoose.isValidObjectId(userId)) {
    return res.status(400).send("Invalid user id.");
  }

  const user = await User.findById(userId).select("-password").exec();

  if (!user) {
    return res.status(400).send("Invalid user id.");
  }

  const isHTMXReq = req.get("HX-Request") === "true";
  if (isHTMXReq) {
    res.render("pages/profile", { user });
  } else {
    res.render("index", { page: "profile", user });
  }
};
const backController = (req, res) => {
  res.render("index", { page: "home" });
};

const pagesControllers = {
  indexController,
  homeController,
  gamesController,
  aboutController,
  profileController,

  backController,

  lobbyHostController,
  lobbyController,
};

export default pagesControllers;
