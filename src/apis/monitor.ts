import { Router } from "express";
import { hostStalker } from "../modules/host-monitor";
import DeviceModel from "../models/device.model";
import authMiddleware from "../middlewares/user";
import { getInfluxDB } from "../bootstrap/influx";
import { escape } from "influx";
import pretty from "prettysize";
import { DeviceType } from "../modules/snmpMibs";

const router = Router();

router.get("/device/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;

  const influx = await getInfluxDB();

  const device: any = await DeviceModel.findById(id).lean();

  if (!device) {
    return res.status(404).json({
      error: "No device found for this id",
    });
  }

  if (
    !(
      device.type === DeviceType.Host &&
      (!!device.connectedTo || device.snmpEnabled)
    )
  ) {
    return res.status(400).json({
      error: "This device isn't monitored",
    });
  }

  const now = new Date();
  const firstDayofMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const monthQuery = `
  SELECT SUM(inOctets) AS m_i, SUM(outOctets) AS m_o FROM hostConsumption
  WHERE deviceId=${escape.stringLit(id)} AND time >= now() - 30d
  GROUP BY time(1d);
  `;

  const totalQuery = `SELECT SUM(inOctets) + SUM(outOctets) AS total FROM hostConsumption
  WHERE deviceId = ${escape.stringLit(
    id
  )} AND time >= '${firstDayofMonth.toISOString()}' AND time < now();`;

  const [monthlyRes, totalRes] = await Promise.all([
    influx.query<any>(monthQuery),
    influx.query<any>(totalQuery),
  ]);

  const monthData = monthlyRes.map((res) => {
    return {
      timestamp: res.time.toISOString(),
      downData: res.m_i !== null ? res.m_i : 0,
      upData: res.m_o !== null ? res.m_o : 0,
    };
  });

  const totalQuota = pretty(totalRes[0]?.total ?? 0, { places: 2 });

  return res.status(200).send({ device, totalQuota, monthData });
});

export default router;
