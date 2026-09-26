import express from "express";

import pagesControllers from "../controllers/pages/controllers.js";
import authControllers from "../controllers/auth/controllers.js";

const indexRouter = express.Router();

//? routes
indexRouter.get("/", pagesControllers.indexController);
indexRouter.get("/home", pagesControllers.homeController);
indexRouter.get("/games", pagesControllers.gamesController);
indexRouter.get("/about", pagesControllers.aboutController);
indexRouter.get("/profile/:id", pagesControllers.profileController);

//? auth routes
indexRouter.get("/login", authControllers.loginController);
indexRouter.post("/login", authControllers.postLoginController);
indexRouter.get("/register", authControllers.registerController);
indexRouter.post("/register", authControllers.postRegisterController);
indexRouter.get("/logout", authControllers.logoutController);

export default indexRouter;
