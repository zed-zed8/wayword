import express from "express";

import controllers from "../controllers/index/index.js";

const indexRouter = express.Router();

//? routes
indexRouter.get("/", controllers.homeController);

export default indexRouter;
