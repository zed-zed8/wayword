import User from "../../models/db/user.js";

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
const gamesController = (req, res) => {
  const isHTMXReq = req.get("HX-Request") === "true";
  if (isHTMXReq) {
    res.render("pages/games");
  } else {
    res.render("index", { page: "games" });
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
  const user = await User.findById(userId).exec();

  const isHTMXReq = req.get("HX-Request") === "true";
  if (isHTMXReq) {
    res.render("pages/profile", { user: user });
  } else {
    res.render("index", { page: "profile", user: user });
  }
};

const pagesControllers = {
  indexController,
  homeController,
  gamesController,
  aboutController,
  profileController,
};

export default pagesControllers;
