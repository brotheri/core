import { Router } from "express";
import DeviceModel from "../models/device.model";

const router = Router();

router.ws("/device/hr", (ws, _req) => {
  ws.on("message", async (data) => {
    if (typeof data !== "string") {
      return ws.send(`Please use strings as exchanged data formats`);
    }

    let obj;
    try {
      obj = JSON.parse(data);
    } catch (error) {
      return ws.send(`Please use JSON.stringify() to make the strings`);
    }

    const { deviceId } = obj;

    // TODO

    const change = DeviceModel.watch();
    change.on("change", (data) => {
      ws.send(JSON.stringify(data));
    });

    ws.on("error", (_err) => {
      console.log("closed");
      change.close();
    });
    ws.on("close", (_num) => {
      console.log("closed");
      change.close();
    });
  });
});

export default router;
