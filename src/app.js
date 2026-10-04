import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import session from "express-session";
import mongoose from "mongoose";
import dns from "dns";
import dotenv from "dotenv";
import connect_mongodb_session from "connect-mongodb-session";
import { setupWebSocket } from "./websocket.js";
import os from "os";

// custom
import indexRouter from "./routes/index_routes.js";

// config
dotenv.config();

// ip
dns.setDefaultResultOrder("ipv4first");

// Recreate __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

//? init express
const app = express();

// Mongodb Store
const MongoDBStore = connect_mongodb_session(session);

// Set up the Atlas store
const store = new MongoDBStore({
  uri: process.env.MONGODB_URI,
  collection: "sessions",
});

// Catch errors if the store fails to connect to Atlas
store.on("error", function (error) {
  console.log("Session store error:", error);
});

//? middleware
export const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || "2e147e483e647", //random key
  store: store,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24, // last 24 hour
    httpOnly: true,
    secure: false, // Must be true for HTTPS
    sameSite: "strict",
  },
});
app.use(sessionMiddleware);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// custom
app.use((req, res, next) => {
  // This makes "currentUser" available in every single EJS file automatically
  res.locals.currentUser = req.session.user || null;
  next();
});

//? initialize htmx
app.use(
  "/js/htmx",
  express.static(path.join(__dirname, "../node_modules/htmx.org/dist")),
);

//? views engine and public dir
app.set("views", path.join(__dirname, "../views"));
app.use(express.static(path.join(__dirname, "../public")));

app.set("view engine", "ejs");

//? routes
app.use(indexRouter);

//? server
const server = http.createServer(app);

//? websocket
setupWebSocket(server);

//? connect to mongodb
const dbURI = process.env.MONGODB_URI;
// "mongodb+srv://<username>:<password>@<cluster>.lqc8ksz.mongodb.net/<database>?retryWrites=true&w=majority&appName=<cluster>";

mongoose
  .connect(dbURI)
  .then(() => {
    console.log("connected to db : ");
    // console.log(result);
    //? get Ip
    const interfaces = os.networkInterfaces();

    let hostIp;
    for (const name in interfaces) {
      for (const network of interfaces[name]) {
        if (network.family === "IPv4" && !network.internal) {
          console.info(`${name}: ${network.address}`);
          hostIp = network.address;
        }
      }
    }

    //? listen
    const port = process.env.PORT || 3000;
    const host = process.env.HOST || "0.0.0.0";
    server.listen(port, host, () =>
      console.info(`App listening on port ${hostIp}:${port}`),
    );
  })
  .catch((err) => console.log("error: " + err));
