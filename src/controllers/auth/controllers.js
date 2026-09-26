// models
import User from "../../models/db/user.js";

const loginController = (req, res) => {
  const isHTMXReq = req.get("HX-Request") === "true";
  if (isHTMXReq) {
    res.render("pages/login");
  } else {
    res.render("index", { page: "login" });
  }
};
const registerController = (req, res) => {
  const isHTMXReq = req.get("HX-Request") === "true";
  if (isHTMXReq) {
    res.render("pages/register");
  } else {
    res.render("index", { page: "register" });
  }
};

const postLoginController = async (req, res) => {
  //   console.log(req.get("Content-Type"));
  if (!req.body) {
    return res.status(400).send("Server received an undefined body payload.");
  }

  const username = req.body.username;
  const password = req.body.password;

  const user = await User.exists({ username: username, password: password });

  if (user === null) {
    res.render("index", { page: "login" });
  } else {
    console.log(user);
    req.session.user = { _id: user._id.toString(), username: username };
    res.redirect("/");
  }
};

const postRegisterController = async (req, res) => {
  //   console.log(req.get("Content-Type"));
  if (!req.body) {
    return res.status(400).send("Server received an undefined body payload.");
  }

  const username = req.body.username;
  const email = req.body.email;
  const password = req.body.password;

  const user = new User({
    username: username,
    email: email,
    password: password,
  });
  await user.save();

  req.session.user = { _id: user._id.toString(), username: username };
  res.redirect("/");
};

const logoutController = async (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.log("Session destruction error:", err);
      return res.redirect("/");
    }

    res.clearCookie("connect.sid");
    res.redirect("/");
  });
};

const authControllers = {
  loginController,
  postLoginController,
  registerController,
  postRegisterController,
  logoutController,
};

export default authControllers;
