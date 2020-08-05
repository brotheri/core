import express from "express";
import expressWs from "express-ws";
import bootstrapScripts from "./bootstrap/index";
import middlewaresStack from "./middlewares/index";
import bootstrapSwagger from "./swagger";

const app = express();
expressWs(app); // enable WebSocket endpoints

async function bootstrap() {
  // run bootstrap scripts before server init
  for (const fn of bootstrapScripts) {
    await fn();
  }

  // apply middlewares with respect to priority
  for (const middleware of middlewaresStack) {
    app.use(middleware);
  }

  // Routes
  // I am lazy loading the routes to let express-ws to hook into the routers
  const routesStack = (await import("./apis/index")).default;
  for (const module of routesStack) {
    app.use(module.prefix, module.router);
  }

  // apply swagger
  bootstrapSwagger(app);

  app.listen(process.env.PORT || 3000, () => {
    console.log(
      `${new Date().toLocaleString()}: Server running on ${process.env.PORT}`
    );
  });
}

bootstrap().catch(console.error);
