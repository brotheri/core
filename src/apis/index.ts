import expressWs from "express-ws";

import authRouter from "./auth";
import discoveryRouter from "./discovery";
import alertRouter from "./alert";
import monitorRouter from "./monitor";
import settingsRouter from "./settings";

interface IModule {
  prefix: string;
  router: expressWs.Router;
}

const modules: IModule[] = [
  {
    prefix: "/api/v1/auth",
    router: authRouter,
  },
  {
    prefix: "/api/v1/discover",
    router: discoveryRouter,
  },
  {
    prefix: "/api/v1/alert",
    router: alertRouter,
  },
  {
    prefix: "/api/v1/monitor",
    router: monitorRouter,
  },
  {
    prefix: "/api/v1/settings",
    router: settingsRouter,
  },
];

export default modules;
