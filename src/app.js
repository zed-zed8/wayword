import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import mongoose from "mongoose";
import dns from "dns";
import dotenv from "dotenv";

// custom
import indexRouter from "./routes/index_routes.js";

// models
import User from "./models/db/user.js";

// config
dotenv.config();

// ip
dns.setDefaultResultOrder("ipv4first");

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

app.get("/test", (req, res) => {
  const zid = new User({
    username: "zid",
    email: "zid@gmail.com",
    password: "zid123",
  });
  zid.save();
  res.send(zid);
});

//? server
const server = http.createServer(app);

//? connect to mongodb
const dbURI = process.env.MONGODB_URI;
// "mongodb+srv://<username>:<password>@<cluster>.lqc8ksz.mongodb.net/<database>?retryWrites=true&w=majority&appName=<cluster>";

mongoose
  .connect(dbURI)
  .then((result) => {
    console.log("connected to db : ");
    // console.log(result);
    //? listen
    const port = process.env.PORT || 3000;
    const host = process.env.HOST || "127.0.0.1";
    server.listen(port, host, () =>
      console.log(`App listening on port ${port}!`),
    );
  })
  .catch((err) => console.log("error: " + err));
