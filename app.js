const Koa = require("koa");
const app = new Koa();
const views = require("koa-views");
const json = require("koa-json");
const onerror = require("koa-onerror");
const bodyparser = require("koa-bodyparser");
const logger = require("koa-logger");
const log4js = require("./utils/log4j");
const router = require("koa-router")();
const jwt = require("jsonwebtoken");
const koajwt = require("koa-jwt");
const util = require("./utils/util");
const users = require("./routes/users");
const menus = require("./routes/menus");
const roles = require("./routes/roles");
const depts = require("./routes/depts");
const leaves = require("./routes/leaves");
// error handler
onerror(app);

require("./config/db");
// middlewares
app.use(
  bodyparser({
    enableTypes: ["json", "form", "text"],
  })
);
app.use(json());
app.use(logger());
app.use(require("koa-static")(__dirname + "/public"));

app.use(
  views(__dirname + "/views", {
    extension: "pug",
  })
);

// logger
app.use(async (ctx, next) => {
  log4js.info(`get params:${JSON.stringify(ctx.request.query)}`);
  log4js.info(`get params:${JSON.stringify(ctx.request.body)}`);
  // 对下面koajwt返回的错误进行捕获
  await next().catch((err) => {
    if (err.status == "401") {
      ctx.status = 200;
      ctx.body = util.fail("Token认证失败", util.CODE.AUTH_ERROR);
    } else {
      throw err;
    }
  });
});

//使用这个中间件做一层拦截 但是要把登录接口不能拦截校验 因为登录进去才能生成token呀
app.use(
  koajwt({ secret: "imooc" }).unless({
    path: [/^\/api\/users\/login/],
  })
);
router.prefix("/api");
// router.get("/leave/count", (ctx) => {
//   const token = ctx.request.headers.authorization.split(" ")[1];
//   const payload = jwt.verify(token, "imooc");
//   ctx.body = payload;
// });

router.use(users.routes(), users.allowedMethods());
router.use(menus.routes(), menus.allowedMethods());
router.use(roles.routes(), roles.allowedMethods());
router.use(depts.routes(), depts.allowedMethods());
router.use(leaves.routes(), depts.allowedMethods());
app.use(router.routes(), leaves.allowedMethods());

// error-handling
app.on("error", (err, ctx) => {
  log4js.error(err);
});

module.exports = app;
