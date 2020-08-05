import { parentPort, isMainThread } from "worker_threads";
import debugModule from "debug";
import { SNMPSession } from "./snmp";
import { DeviceType, SNMPMibs } from "./snmpMibs";
import DeviceModel from "../models/device.model";
import { getInfluxDB } from "../bootstrap/influx";
import { escape } from "influx";
import mongoInit from "../bootstrap/mongodb";
import { delay } from "./utils";

const debug = debugModule("IO");

function oidToBigInt(inBuff: Buffer | number, outBuff: Buffer | number) {
  if (typeof inBuff === "object" && typeof outBuff === "object") {
    return {
      inOctets: BigInt(`0x${inBuff.toString("hex").padStart(8 * 2, "00")}`),
      outOctets: BigInt(`0x${outBuff.toString("hex").padStart(8 * 2, "00")}`),
    };
  }

  return {
    inOctets: BigInt(inBuff),
    outOctets: BigInt(outBuff),
  };
}

export class IOMonitorModule {
  pollInterval = 3; // number of seconds to delay between polls
  pollIntervalMs: number;
  private intId: any;
  private quotId: any;

  constructor() {
    this.pollIntervalMs = this.pollInterval * 1000;
  }

  /* private async monitorVlan(vlanid: string, brdgPort: number, interval = 3) {
    const community = "cairo";
    const session = new SNMPSession(this.device.ip, `${community}@${vlanid}`);

    const entry = await session.table(SNMPTable.dot1dBasePortTable, brdgPort);

    const ifIndex = entry["2"];

    console.log(ifIndex);

    const ifEntry1 = await session.table(SNMPTable.ifTable, ifIndex);

    let inOctet1 = ifEntry1["10"];
    let outOctet1 = ifEntry1["16"];
    let upQuota = 0;
    let downQuota = 0;
    const ifSpeed = ifEntry1["5"];

    setInterval(async () => {
      const ifEntry2 = await session.table(SNMPTable.ifTable, ifIndex);

      let inOctet2 = ifEntry2["10"];
      let outOctet2 = ifEntry2["16"];

      let inDiff = inOctet2 - inOctet1;
      let outDiff = outOctet2 - outOctet1;

      inOctet1 = inOctet2;
      outOctet1 = outOctet2;

      if (inDiff < 0) {
        inDiff += 1 << 32;
      }

      if (outDiff < 0) {
        outDiff += 1 << 32;
      }

      downQuota = inDiff;
      upQuota = outDiff;

      const downSpeed = inDiff / (interval * 1024 * 1024);
      const upSpeed = outDiff / (interval * 1024 * 1024);

      Math.max(inDiff, outDiff);

      //console.log(inDiff, outDiff, bandwidth);
      const upMgs = upQuota / (1024 * 1024);
      const downMgs = downQuota / (1024 * 1024);

      console.log(
        `Interface ${ifIndex} has up speed ${upSpeed.toFixed(
          2
        )} MB/s and used ${upMgs.toFixed(2)} MB`
      );
      console.log(
        `Interface ${ifIndex} has down speed ${downSpeed.toFixed(
          2
        )} MB/s and used ${downMgs.toFixed(2)} MB`
      );
      console.log("----------------");
    }, interval * 1000);
  } */

  private async monitorHosts() {
    const influx = await getInfluxDB();

    const toBeMonitored = await DeviceModel.find({
      type: DeviceType.Host,
      connectedTo: { $ne: null },
      online: true,
    })
      .populate("connectedTo.switch")
      .lean();

    const proms = toBeMonitored.map(async (device: any) => {
      try {
        const { connectedTo } = device;
        const parent = connectedTo.switch;
        const ifIndex = connectedTo.ifIndex;

        if (!parent) {
          throw new Error(
            `We couldn't detect the switch connected to this device`
          );
        }

        const supportHC = parent.extraData.supportHC;

        const inOid = supportHC ? SNMPMibs.ifHCInOctets : SNMPMibs.ifInOctets;
        const outOid = supportHC
          ? SNMPMibs.ifHCOutOctets
          : SNMPMibs.ifOutOctets;

        const maxCounter = supportHC
          ? BigInt(Math.pow(2, 64))
          : BigInt(Math.pow(2, 32));

        const session = new SNMPSession(parent.currIp, parent.snmpCommunity);

        let [inOct1, outOct1] = await Promise.all([
          session.get(inOid.concat(`.${ifIndex}`)),
          session.get(outOid.concat(`.${ifIndex}`)),
        ]);

        const { inOctets: inOctets1, outOctets: outOctets1 } = oidToBigInt(
          inOct1.value,
          outOct1.value
        );

        await delay(this.pollIntervalMs);

        let [inOct2, outOct2] = await Promise.all([
          session.get(inOid.concat(`.${ifIndex}`)),
          session.get(outOid.concat(`.${ifIndex}`)),
        ]);

        const { inOctets: inOctets2, outOctets: outOctets2 } = oidToBigInt(
          inOct2.value,
          outOct2.value
        );

        let inDiff, outDiff;

        if (inOctets2 < inOctets1) {
          inDiff = maxCounter - inOctets1 + inOctets2;
        } else {
          inDiff = inOctets2 - inOctets1;
        }

        if (outOctets2 < outOctets1) {
          outDiff = maxCounter - outOctets1 + outOctets2;
        } else {
          outDiff = outOctets2 - outOctets1;
        }

        const downSpeed = Number(inDiff / BigInt(this.pollInterval));
        const upSpeed = Number(outDiff / BigInt(this.pollInterval));

        // save to influx now

        // inSum += Number(inDiff);
        // outSum += Number(outDiff);
        //console.log(pretty(inSum), pretty(outSum));

        await DeviceModel.findByIdAndUpdate(
          device._id.toString(),
          {
            downSpeed,
            upSpeed,
          },
          { upsert: true }
        );

        influx.writeMeasurement("hostConsumption", [
          {
            tags: { deviceId: device._id.toString() },
            fields: { inOctets: Number(inDiff), outOctets: Number(outDiff) },
          },
        ]);
      } catch (error) {
        debug(`Error at ${device.currIp}`, error);
      }
    });

    await Promise.all(proms);
  }

  private async monitorQuota() {
    const influx = await getInfluxDB();

    const now = new Date();
    const firstDayofMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const toBeMonitored: any[] = await DeviceModel.find({
      type: DeviceType.Host,
      connectedTo: { $ne: null },
      online: true,
    }).lean();

    toBeMonitored.forEach(async (dev) => {
      const deviceId = dev._id.toString();

      const totalQuery = `
      SELECT SUM(inOctets) + SUM(outOctets) AS total FROM hostConsumption
      WHERE deviceId = ${escape.stringLit(
        deviceId
      )} AND time >= '${firstDayofMonth.toISOString()}' AND time < now();`;

      const totalRes: any = await influx.query(totalQuery);

      const totalBytes = totalRes[0]?.total ?? 0;

      // 10 GB
      if (totalBytes > 1e10) {
        await DeviceModel.findByIdAndUpdate(
          deviceId,
          {
            exceedQuota: true,
          },
          { upsert: true }
        ).lean();
      }
    });
  }

  // Public APIs

  start() {
    if (this.intId) {
      return false;
    }
    console.log(`Starting the I/O monitoring now.`);

    this.monitorHosts();
    this.intId = setInterval(
      this.monitorHosts.bind(this),
      this.pollIntervalMs + 50
    );
    this.quotId = setInterval(
      this.monitorQuota.bind(this),
      1 * 60 * 1000 // this 50 millseconds are for making sure last read has persisted
    );
    return true;
  }

  stop() {
    if (!this.intId) {
      return false;
    }
    console.log(`Stopping the I/O monitoring now.`);

    clearInterval(this.intId);
    clearInterval(this.quotId);
    this.intId = null;
    this.quotId = null;
    return true;
  }
}

export const ioMonitorer = new IOMonitorModule();

if (!isMainThread) {
  // intialize mongo immediately
  (async () => {
    await mongoInit();
  })();
}

if (parentPort) {
  parentPort.on("message", async (event) => {
    const { type, data } = event;
    if (type === "START") {
      ioMonitorer.start();
    } else if (type === "STOP") {
      ioMonitorer.stop();
    }
  });
}
