import { Router } from "express";
import { sign } from "jsonwebtoken";
import { compare } from "bcryptjs";
import Admins from "../models/admin.model";

/**
 * @swagger
 * tags:
 *   name: auth
 *   description: User management and login
 */

const router = Router();

async function signJwtAsync(payload: any): Promise<string> {
  return new Promise((resolve, reject) => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error("Missing JWT secret");
    }
    sign(
      payload,
      secret,
      { algorithm: "HS512", audience: "Cairo Uni.", expiresIn: "7d" },
      (err, token) => {
        if (err) {
          reject(err);
        }

        resolve(token);
      }
    );
  });
}

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     description: Login to the application
 *     tags: [auth]
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: email
 *         description: User's email.
 *         in: body
 *         required: true
 *         type: string
 *       - name: password
 *         description: User's password.
 *         in: body
 *         required: true
 *         type: string
 *     responses:
 *       200:
 *         description: logged In
 *         schema:
 *           type: object
 */
router.post("/login", async function (req, res) {
  const { email, password } = req.body;

  const user = await Admins.findOne({
    email,
  });

  if (!user) {
    return res.status(404).send({
      error: "Email not found in the system",
    });
  }

  const isOk = await compare(password, user.password);

  // save last success/failed login attempt
  user.lastLoginAttempt = user.get("updatedAt");
  await user.save();

  if (!isOk) {
    return res.status(401).send({
      error: "Email/Password combination is wrong",
    });
  }

  const token = await signJwtAsync({
    _id: user.id,
  });

  const sanitizedUser = user.toJSON();
  delete sanitizedUser.password;

  res.status(200).send({
    token,
    user: sanitizedUser,
  });
});

export default router;
