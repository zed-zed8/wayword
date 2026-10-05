// models
import User from "../../models/db/user.js";

const loginController = (req, res) => {
  const isHTMXReq = req.get("HX-Request") === "true";
  // Read the hx-target ID from the request headers
  const targetElement = req.get("HX-Target");
  console.log(targetElement);
  if (isHTMXReq && targetElement === "main#main") {
    res.render("pages/auth/login");
  } else {
    res.render("index", { page: "auth/login" });
  }
};
const registerController = (req, res) => {
  const isHTMXReq = req.get("HX-Request") === "true";
  if (isHTMXReq) {
    res.render("pages/auth/register");
  } else {
    res.render("index", { page: "auth/register" });
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
    res.set({
      "HX-Reswap": "innerHTML",
      "HX-Retarget": "#message",
    });
    res.status(400).render("pages/auth/partials/wrong", {
      message: "username or password is wrong",
    });
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
  try {
    const username = req.body.username;
    const email = req.body.email;
    const password = req.body.password;

    const user = new User({
      username: username,
      email: email,
      password: password,
    });

    if (password.length < 8) {
      res.set({
        "HX-Reswap": "innerHTML",
        "HX-Retarget": "#message",
      });
      res.render("pages/auth/partials/wrong", {
        message: "password must be atleast 8 characters long",
      });
      return;
    }

    await user.save();

    req.session.user = { _id: user._id.toString(), username: username };
    res.redirect("/");
  } catch (error) {
    if (error.code === 11000) {
      console.error("username or email error");

      res.set({
        "HX-Reswap": "innerHTML",
        "HX-Retarget": "#message",
      });
      res.status(400).render("pages/auth/partials/wrong", {
        message: "username or email already exist",
      });
      return;
    }
    console.error("unexpected error");
    console.error(error);
    res.status(400);
  }
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
