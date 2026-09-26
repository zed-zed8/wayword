import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";

// custom
import indexRouter from "./routes/index_routes.js";

// Recreate __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

//? init express
const app = express();

//? initialize htmx, alpine
app.use(
  "/js/htmx",
  express.static(path.join(__dirname, "../node_modules/htmx.org/dist")),
);
app.use(
  "/js/alpine",
  express.static(path.join(__dirname, "../node_modules/alpinejs/dist")),
);

//? views engine and public dir
app.set("views", path.join(__dirname, "../views"));
app.use(express.static(path.join(__dirname, "../public")));

app.set("view engine", "ejs");

//? routes
app.use(indexRouter);

//? server
const server = http.createServer(app);

//? listen
const port = 3000;
const host = "127.0.0.1";
server.listen(port, host, () => console.log(`App listening on port ${port}!`));
