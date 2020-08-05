import { Router } from "express";
import authMiddle from "../middlewares/user";
import { discoverer, DiscoveryState } from "../modules/discovery";
import deviceModel from "../models/device.model";
import { getInfluxDB } from "../bootstrap/influx";
import { InfluxDB, escape } from "influx";
import pretty from "prettysize";

let _influx: InfluxDB;

const router = Router();

router.get("/vlans", authMiddle, async (_req, res) => {
  try {
    if (discoverer.lastScan.nodes.length > 0) {
      const vlans = discoverer.lastScan.vlans;
      return res.status(200).json({ vlans });
    }

    return res
      .status(200)
      .json({ state: discoverer.state, value: discoverer.progress });
  } catch (error) {
    console.error(error.stack);
    return res.status(500).json({
      error: error.toString(),
    });
  }
});

router.get("/devices", authMiddle, async (_req, res) => {
  if (discoverer.lastScan.nodes.length > 0) {
    return res.status(200).json(discoverer.lastScan);
  }

  return res
    .status(200)
    .json({ state: discoverer.state, value: discoverer.progress });
});

router.get("/dashboard", authMiddle, async (_req, res) => {
  if (!discoverer.lastScan.nodes.length) {
    return res
      .status(200)
      .json({ state: discoverer.state, value: discoverer.progress });
  }

  if (!_influx) {
    _influx = await getInfluxDB();
  }

  const devsWithBlockedProgs = await deviceModel
    .find({ "monitorData.blockedPrograms": { $exists: true, $ne: [] } })
    .lean();

  let exceeders: any[] = await deviceModel
    .find({
      exceedQuota: true,
    })
    .lean();

  const now = new Date();
  const firstDayofMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  exceeders = await Promise.all(
    exceeders.map(async (dev) => {
      const id = dev._id.toString();

      const query = `SELECT SUM(inOctets) + SUM(outOctets) AS total FROM hostConsumption
    WHERE deviceId = ${escape.stringLit(
      id
    )} AND time >= '${firstDayofMonth.toISOString()}' AND time < now();`;

      const res: any = await _influx.query(query);

      dev.totalQuota = pretty(res[0]?.total || 0, { places: 2 });

      return dev;
    })
  );

  return res.status(200).json({
    deviceCount: discoverer.lastScan.nodes?.length,
    vlanCount: discoverer.lastScan.vlans?.length,
    exceeders,
    devsWithBlockedProgs,
    lastScanTimestamp: discoverer.lastScan?.timestamp,
  });
});

export default router;
