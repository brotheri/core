import { Router } from "express";
import authMiddleware from "../middlewares/user";
import BlocklistModel from "../models/blocklist.model";
import AdminModel from "../models/admin.model";

const router = Router();

// Monitoring Settings

router.post("/monitor/start", authMiddleware, async (_req, res) => {
  const { monitorWorker } = global as any;

  if (!monitorWorker) {
    return res.status(200).json({
      message: "Monitoring is still booting, wait for a couple of minutes",
    });
  }

  monitorWorker.postMessage({ type: "START" });

  return res.status(200).send({ message: "Monitoring started successfully" });
});

router.post("/monitor/stop", authMiddleware, async (_req, res) => {
  const { monitorWorker } = global as any;

  if (!monitorWorker) {
    return res.status(200).json({
      message: "Monitoring is still booting, wait for a couple of minutes",
    });
  }

  monitorWorker.postMessage({ type: "STOP" });

  return res.status(200).send({ message: "Monitoring stopped successfully" });
});

router.get("/monitor/state", authMiddleware, async (_req, res) => {
  return res.status(200).send({
    state: "running",
  });
});

// Blocklist CRUD

router.get("/blocklist", authMiddleware, async (req, res) => {
  const list = await BlocklistModel.find().lean();

  return res.status(200).send({
    list,
  });
});

router.post("/blocklist", authMiddleware, async (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(422).json({
      error: "You have to send the name field, it is required.",
    });
  }

  const entry = new BlocklistModel({ name });
  await entry.save();

  return res.status(200).send({
    message: "Entry added successfully",
  });
});

router.delete("/blocklist/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(422).send({
      error: "An id must be supplied",
    });
  }
  await BlocklistModel.findByIdAndDelete(id);

  return res.status(200).send({
    message: "Entry deleted successfully",
  });
});

// Admin CRUD

router.get("/admin", authMiddleware, async function (req, res) {
  const user = req.user;

  if (user.role !== "superadmin") {
    return res.status(403).json({
      error: "Only superadmins can access the list of admins",
    });
  }

  const admins = await AdminModel.find({
    role: "admin",
  })
    .select("-password")
    .lean();

  return res.status(200).json({ admins });
});

router.post("/admin", authMiddleware, async function (req, res) {
  const user = req.user;
  const { full_name, email, password } = req.body;

  if (user.role !== "superadmin") {
    return res.status(403).json({
      error: "Only superadmins can access the list of admins",
    });
  }

  const admin = new AdminModel({
    full_name,
    email,
    password,
    role: "admin",
  });

  await admin.save();

  return res.status(200).json({
    admin: {
      ...admin.toObject({ versionKey: false }),
      password: undefined, // remove password
    },
  });
});

router.delete("/admin/:id", authMiddleware, async function (req, res) {
  const user = req.user;
  const { id } = req.params;

  if (user.role !== "superadmin") {
    return res.status(403).json({
      error: "Only superadmins can access the list of admins",
    });
  }

  await AdminModel.findByIdAndDelete(id);

  return res.status(200).json({ message: "Admin deleted successfully" });
});

export default router;
