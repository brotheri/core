import { Request, Response } from "express";

export default function (req: Request, res: Response, next: Function) {
  const allowedOrigins = ["https://postwoman.io"];
  const origin = req.headers["origin"] as string;

  //if (origin && allowedOrigins.includes(origin)) {
  res.header("Access-Control-Allow-Origin", origin);
  res.header(
    "Access-Control-Allow-Methods",
    "GET,PUT,POST,PATCH,DELETE,OPTIONS"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization, Set-Cookie"
  );
  res.header("Access-Control-Allow-Credentials", "true");
  //}

  next();
}
