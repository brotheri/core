import { json, urlencoded } from "express";
import pino from "pino-http";

import corsMiddleware from "./cors";

export default [
  json(),
  urlencoded({ extended: true }),
  pino({ enabled: false }),
  corsMiddleware,
];
