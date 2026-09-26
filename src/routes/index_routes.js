import express from "express";

import pagesControllers from "../controllers/pages/controllers.js";

const indexRouter = express.Router();

//? routes
indexRouter.get("/", pagesControllers.indexController);
indexRouter.get("/home", pagesControllers.homeController);
indexRouter.get("/games", pagesControllers.gamesController);
indexRouter.get("/about", pagesControllers.aboutController);

export default indexRouter;
