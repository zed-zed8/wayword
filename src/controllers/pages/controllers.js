const indexController = (req, res) => {
  res.render("index", { page: "home" });
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

const pagesControllers = {
  indexController,
  homeController,
  gamesController,
  aboutController,
};

export default pagesControllers;
