import pretty from "prettysize";
import { timePrefixConverter } from "@relocke/unit-prefix-converter";
import debugModule from "debug";

import { SNMPSession } from "./snmp";
import { discoverer, Device } from "./discovery";
import { HostResourceMib, DeviceType } from "./snmpMibs";
import DeviceModel from "../models/device.model";
import BlocklistModel from "../models/blocklist.model";

const debug = debugModule("HOST");

class HostMonitorModule {
  private pollInterval = 3 * 60; // 3 minutes in seconds
  private pollIntervalMs: number;
  private intId: any = null;

  constructor() {
    this.pollIntervalMs = this.pollInterval * 1000;
  }

  private async monitor() {
    let blocklist: any[] = await BlocklistModel.find().lean();
    blocklist = blocklist.map((x) => x.name);

    const toBeMonitored: any[] = await DeviceModel.find({
      type: DeviceType.Host,
      snmpEnabled: true,
      online: true,
    }).lean();

    const proms = toBeMonitored.map(async (device) => {
      try {
        const session = new SNMPSession(device.currIp, device.snmpCommunity);
        let allData: any[] = [];

        try {
          allData = await Promise.all([
            session.get(HostResourceMib.hrSystemUptime),
            session.get(HostResourceMib.hrMemorySize),
            session.table(HostResourceMib.hrStorageTable),
            session.table(HostResourceMib.hrSWRunTable),
            session.table(HostResourceMib.hrSWRunPerfTable),
            session.table(HostResourceMib.hrSWInstalledTable),
          ]);
        } catch (error) {
          debug(`SNMP/${device.currIp}`, error);
          return;
        }

        const [
          sysUpTime,
          sysMem,
          storageTable,
          swRunning,
          swPerf,
          swInstalled,
        ] = allData;

        const allInstalledProgs: string[] = Object.values<any>(swInstalled).map(
          (entry) => {
            return entry["2"].toString().toLowerCase();
          }
        );

        const installedblocked = allInstalledProgs.filter((str) => {
          return blocklist.some((blocked) => {
            return str.includes(blocked.toLowerCase());
          });
        });

        const allRunningProgs = Object.values<any>(swRunning)
          .filter((entry) => {
            return [4, 1].includes(entry["6"]);
          })
          .map((entry) => {
            const perf = swPerf[entry["1"]];
            return {
              name: entry["2"].toString().toLowerCase() as string,
              cpuPerf: perf["1"] / 100,
              memPerf: perf["2"],
            };
          });

        const runningBlocked = allRunningProgs
          .filter((running) => {
            return blocklist.some((blocked) => {
              return running.name.includes(blocked.toLowerCase());
            });
          })
          .map((prog) => prog.name);

        const blockedPrograms = Array.from(
          new Set([...installedblocked, ...runningBlocked])
        );

        const mostCpu = allRunningProgs
          .sort((a, b) => b.cpuPerf - a.cpuPerf)
          .slice(1, 10);

        const mostMem = allRunningProgs
          .sort((a, b) => b.memPerf - a.memPerf)
          .slice(1, 10)
          .map((inst) => {
            inst.memPerf = pretty(inst.memPerf * 1000);
            return inst;
          });

        const sysMemory = pretty(sysMem.value * 1000);

        const partitions = Object.values<any>(storageTable)
          .filter((entry) => {
            return entry["2"].endsWith(".4");
          })
          .map((entry) => {
            const units = entry["4"];
            return {
              name: entry["3"].toString().split(`\\`).shift(),
              size: pretty(entry["5"] * units),
              used: pretty(entry["6"] * units),
              util: (entry["6"] / entry["5"]) * 100,
            };
          });

        await DeviceModel.findOneAndUpdate(
          {
            mac: device.mac,
          },
          {
            monitorData: {
              upTime: timePrefixConverter(sysUpTime.value, "cs", "min"),
              topCPU: mostCpu,
              topMem: mostMem,
              ram: sysMemory,
              blockedPrograms,
              partitions,
            },
          },
          { upsert: true }
        );
      } catch (error) {
        debug(`Error at ${device.currIp}`, error);
      }
    });

    await Promise.all(proms);
  }

  // Public APIs

  start() {
    if (this.intId) {
      return;
    }
    this.monitor();
    console.log("Starting the host monitoring now.");

    this.intId = setInterval(() => {
      this.monitor();
    }, this.pollIntervalMs);
  }

  stop() {
    if (!this.intId) {
      return;
    }
    console.log("Stopping the host monitoring now.");
    clearInterval(this.intId);
    this.intId = null;
  }
}

export const hostStalker = new HostMonitorModule();
