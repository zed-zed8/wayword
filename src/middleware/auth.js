const checkAuth = function (req, res, next) {
  if (req.session.user == null || req.session.user == undefined) {
    return res.redirect("/login");
  }

  next();
};

export { checkAuth };
