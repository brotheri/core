import { verify } from "jsonwebtoken";
import { Response, NextFunction } from "express";
import AdminModel from "../models/admin.model";

const { JWT_SECRET } = process.env;

export default function authMiddleware(
  req: any,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;

  if (!header) {
    return res.status(401).json({
      error: "An `Authorization` header is missing",
    });
  }

  const [schema, token] = header.split(" ");

  if (schema !== "Bearer") {
    return res.status(400).json({
      error: "Authorization schema must be `Bearer`",
    });
  }

  if (!JWT_SECRET) {
    throw new Error("Missing `JWT_SECRET` config env var");
  }

  verify(
    token,
    JWT_SECRET,
    { algorithms: ["HS512"] },
    async (err, decoded: any) => {
      if (err) {
        return res.status(403).json({
          error: "There is an issue with the token, please login again",
          errorMsg: err.message,
        });
      }
      if (!decoded) {
        res.status(500);
        return res.status(500).json({
          error: "Something went wrong in the token",
        });
      }

      const { _id } = decoded;

      const user = await AdminModel.findById(_id).lean();

      if (!user) {
        return res.status(401).json({
          error: "The user has been already deleted",
        });
      }

      req.user = user;
      next();
    }
  );
}
