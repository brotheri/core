import * as Ip from "ip";
import debugMod from "debug";
import { SNMPSession } from "./snmp";
import { snmpReachable, macBufToString, delay } from "./utils";
import {
  SNMPTable,
  DeviceType,
  SNMPSystemOID,
  CiscoMib,
  SNMPMibs,
} from "./snmpMibs";
import { extractType, getHostnameFromIp } from "./types";
import oui from "oui";
import { EventEmitter } from "events";
import DeviceModel from "../models/device.model";
import { Worker, SHARE_ENV } from "worker_threads";

const debug = debugMod("Discovery");

interface ConnectedTo {
  switch: Device;
  ifIndex: number;
}

export interface Device {
  name: string;
  vendor: string;
  mac: string;
  ip: string;
  isLikelyStatic: boolean;
  type: DeviceType;
  snmpEnabled: boolean;
  snmpCommunity: string;
  isSynonym: boolean;
  interfaces: Interface[];
  connectedTo?: ConnectedTo;
  extraData: any;
}

interface Subnet {
  ip: string;
  mask: string;
  devices: Device[];
}

interface Interface {
  ifIndex: string;
  ifDesc: string;
  ifPhysAddress: string;
  connectedDevice: Device;
}

interface Vlan {
  id: string;
  name: string;
  subnets: Subnet[];
}

export enum DiscoveryState {
  RUNNING = "running",
  IDLE = "idle",
}

class DiscoveryModule extends EventEmitter {
  private discoverInterval = 5 * 60; // every 5 minutes
  public state = DiscoveryState.IDLE;
  public lastScan: any = { nodes: [], vlans: [] };

  private synonyms: Map<string, string[]> = new Map();
  private devices: Device[] = [];
  private allVlans: Vlan[] = [];
  private vlanCache: any;
  private connections: any[][] = [];

  staticSubnets = [
    Ip.cidrSubnet("193.227.0.0/16"),
    Ip.cidrSubnet("195.246.0.0/16"),
  ];

  entryIp: string;

  private _progress = 0;
  set progress(val: number) {
    this.emit("progress", val);
    this._progress = val;
  }
  get progress() {
    return this._progress;
  }

  constructor() {
    super();
    const { SNMP_ENTRY } = process.env;
    if (typeof SNMP_ENTRY !== "string") {
      throw new Error("There is no SNMP_ENTRY in the environment");
    }

    const isIpOk = Ip.isV4Format(SNMP_ENTRY);

    if (!isIpOk) {
      throw new Error("Invalid IPv4 is given");
    }

    this.entryIp = SNMP_ENTRY;

    this.startDiscovery();
  }

  private async discoverDevices() {
    const ip = this.entryIp;

    const snmpComm = await snmpReachable(ip);

    if (!snmpComm) {
      // the entry Ip has no snmp !
      throw new Error("We can't detect SNMP on the main switch.");
    }

    const session = new SNMPSession(ip, snmpComm);

    // ARP Table
    const table = await session.table(SNMPTable.ipNetToMediaTable);
    const arpEntries = Object.values<any>(table);

    const devices = [];

    for (const entry of arpEntries) {
      const entryIp = entry["3"];
      const entryMac = macBufToString(entry["2"]);

      if (![3, 4].includes(entry["4"])) {
        // if the entry isn't static or dynamic
        continue;
      }

      if (!entryIp || !entryMac) {
        // sometimes arp evicts the ip or the mac signaling it is already invalid
        // TODO: make sure why this happens specifically
        continue;
      }

      devices.push({
        ip: entryIp,
        mac: entryMac,
      });
    }

    return devices;
  }

  public async getSwitchVlans(entryIp: string) {
    const entryDevice = this.devices.find((dev) => dev.ip === entryIp);

    if (!entryDevice) {
      throw new Error("No Entry Device found.");
    }

    const session = new SNMPSession(entryIp, entryDevice.snmpCommunity);

    let vlanTable;
    const isCisco = entryDevice.vendor.toLowerCase().includes("cisco");
    if (this.vlanCache) {
      vlanTable = this.vlanCache;
    } else if (isCisco) {
      vlanTable = await session.table(CiscoMib.vtpVlanTable);
    } else {
      vlanTable = await session.table(SNMPTable.dot1qPortVlanTable);
    }
    this.vlanCache = vlanTable;

    let allVlans: Vlan[] = [];

    const allSubnets: Subnet[] = await this.getSubnetMasks(session);
    const vlanids = Object.keys(vlanTable).map((key) => key.split(".")[1]);

    const vlanFdps: any[] = [];
    const originalCommunity = entryDevice.snmpCommunity;

    for (const id of vlanids) {
      const newSess = new SNMPSession(
        entryDevice.ip,
        `${originalCommunity}@${id}`
      );
      vlanFdps.push(await this.getMACsOfVlan(newSess));
    }

    let i = 0;
    for (const [key, val] of Object.entries<any>(vlanTable)) {
      const vlanid = key.split(".")[1];
      const vlaname = val["4"].toString();

      const macsOfVlan = vlanFdps[i];
      const ips = macsOfVlan.map((dev: any) => {
        return this.mapMacToIp(dev.mac);
      });

      let subnets: any[] = allSubnets.filter((subnet) => {
        const sub = Ip.subnet(subnet.ip, subnet.mask);
        return ips.some((ip: string) => {
          return sub.contains(ip);
        });
      });

      subnets = subnets.map((sub) => {
        const cidrSub = Ip.subnet(sub.ip, sub.mask);
        return {
          ...sub,
          devices: this.devices
            .filter((dev) => cidrSub.contains(dev.ip))
            .map((dev) => {
              return {
                ...dev,
                extraData: undefined,
                interfaces: undefined,
                connectedTo: undefined,
              };
            }),
        };
      });

      allVlans.push({ id: vlanid, name: vlaname, subnets });
      i++;
    }

    return allVlans;
  }

  private async getVlanIds(entryDevice: Device) {
    const session = new SNMPSession(entryDevice.ip, entryDevice.snmpCommunity);

    let vlanTable;
    const isCisco = entryDevice.vendor.toLowerCase().includes("cisco");

    if (isCisco) {
      vlanTable = await session.table(CiscoMib.vtpVlanTable);
    } else {
      vlanTable = await session.table(SNMPTable.dot1qPortVlanTable);
    }

    return Object.keys(vlanTable).map((key) => {
      return key.split(".").pop() as string;
    });
  }

  private async getMACsOfVlan(session: SNMPSession) {
    const macTable = await session.table(SNMPTable.dot1dTpFdpTable);

    const macs: { port: number; mac: string }[] = [];

    for (const entry of Object.values<any>(macTable)) {
      const buf = entry[1];
      macs.push({ mac: macBufToString(buf), port: entry[2] });
    }

    return macs;
  }

  private mapMacToIp(mac: string) {
    const dev = this.devices.find((device) => {
      return mac === device.mac;
    });

    if (dev) {
      return dev.ip;
    }

    // TODO: fallback to atTable

    return "";
  }

  private async getSubnetMasks(session: SNMPSession) {
    const table = await session.table(SNMPTable.ipAddrTable);

    const subnets: Subnet[] = [];

    for (const val of Object.values<any>(table)) {
      subnets.push({
        ip: val[1],
        mask: val[3],
        devices: [],
      });
    }

    return subnets;
  }

  private async getSwitchAFT(sw: Device) {
    try {
      const sess = new SNMPSession(sw.ip, sw.snmpCommunity);

      const { ifTable, dot1dBase } = sw.extraData;

      const isCiscoSwitch = sw.vendor.toLowerCase().includes("cisco");
      let dot1Fdp;

      if (!isCiscoSwitch) {
        dot1Fdp = await sess.table(SNMPTable.dot1dTpFdpTable);
      } else {
        const vlanids = await this.getVlanIds(sw);

        let dot1Fds = [];
        for (const vlanid of vlanids) {
          const newSess = new SNMPSession(
            sw.ip,
            `${sw.snmpCommunity}@${vlanid}`
          );
          const data = await newSess.tableCols(SNMPTable.dot1dTpFdpTable, [
            "1.1",
            "1.2",
          ]);
          dot1Fds.push(data);
        }

        dot1Fdp = dot1Fds.reduce((acc, dot1Fd) => {
          return {
            ...acc,
            ...dot1Fd.value,
          };
        }, {});
      }

      for (const [key, val] of Object.entries<any>(dot1Fdp)) {
        if (Object.keys(val).length === 0) {
          delete dot1Fdp[key];
        }
      }

      const connected = [];

      const ifPhysAddress = ifTable
        .map((row: any) => row["6"])
        .filter((buf: Buffer) => buf.length === 6)
        .map((buf: Buffer) => macBufToString(buf));

      for (const fdEntry of Object.values<any>(dot1Fdp)) {
        if (fdEntry["3"] === 4) {
          // this is a self port
          continue;
        }

        const mac = macBufToString(fdEntry["1"]);
        const basePort = fdEntry["2"];

        const bridge = Object.values<any>(dot1dBase).find((port) => {
          return port["1"] === basePort;
        });

        if (!bridge) {
          // this fd entry doesn't have a direct bridge port
          continue;
        }

        const ifEntry = ifTable.find((ifRow: any) => {
          return ifRow["1"] === bridge["2"];
        });

        connected.push({
          mac,
          ifPort: ifEntry["1"],
          ifName: ifEntry["2"].toString(),
          basePort: bridge["1"],
        });
      }

      return { connected, ifPhysAddress: [...new Set(ifPhysAddress)] };
    } catch (error) {
      console.error(`Error at ip: ${sw.ip}`);
      console.error(error);
      return { connected: [], ifPhysAddress: [], stp: [] };
    }
  }

  private async switchToSwitchCon() {
    const switches = this.devices.filter((dev) => {
      return (
        [
          DeviceType.Switch_L2,
          DeviceType.Switch_L3_Bridge,
          DeviceType.Switch_L4,
        ].includes(dev.type) && !dev.isSynonym
      );
    });

    const switchData = switches.map((sw) => sw.extraData);

    for (let i = 0; i < switches.length; i++) {
      for (let j = 0; j < switches.length; j++) {
        if (i === j) {
          continue;
        }

        const swi = switches[i];
        const swj = switches[j];
        const Si_Data: any = switchData[i];
        const Sj_Data: any = switchData[j];

        const alreadyConnected = this.areAlreadyConnected(swi, swj);

        if (alreadyConnected) {
          continue;
        }

        const Sj_existsIn_Si = Si_Data.aft.connected.find((entry: any) => {
          return Sj_Data.aft.ifPhysAddress.some((phys: any) => {
            return phys === entry.mac;
          });
        });

        const Si_existsIn_Sj = Sj_Data.aft.connected.find((entry: any) => {
          return Si_Data.aft.ifPhysAddress.some((phys: any) => {
            return phys === entry.mac;
          });
        });

        if (!Si_existsIn_Sj || !Sj_existsIn_Si) {
          continue;
        }

        this.connections.push([switches[i], switches[j]]);
      }
    }

    return this.connections;
  }

  /* private async getSwitchStp(dev: Device) {
    const session = new SNMPSession(dev.ip, dev.snmpCommunity);

    const ownBridgeId = await session.get(SNMPMibs.dot1dBaseBridgeAddress);
    const ownBridgeAddress = macBufToString(ownBridgeId.value);

    const isCiscoSwitch = dev.vendor.toLowerCase().includes("cisco");
    let dot1dStp;

    if (!isCiscoSwitch) {
      dot1dStp = await session.table(SNMPTable.dot1dStpPortTable);
    } else {
      const vlans = await this.getSwitchVlans(dev.ip);
      const vlanids: string[] = vlans.map((vlan: Vlan) => vlan.id);

      const dot1dStpProms = vlanids.map((vlanid) => {
        session.community = dev.snmpCommunity + "@" + vlanid;
        return session.table(SNMPTable.dot1dStpPortTable);
      });

      let dot1dStps = await Promise.all(dot1dStpProms);

      dot1dStp = dot1dStps.reduce((acc, dot1Stp) => {
        return {
          ...acc,
          ...dot1Stp,
        };
      }, {});
    }

    const stp: any[] = Object.values<any>(dot1dStp)
      .map((obj) => {
        if (!obj["8"]) {
          return;
        }

        return {
          stpPort: obj["1"],
          stpPortState: obj["3"],
          designatedBridge: macBufToString(obj["8"].slice(2)),
          designatedPort: parseInt(obj["9"].slice(1, 2).toString("hex"), 16),
        };
      })
      .filter((x) => {
        return !!x;
      });

    return {
      ownBridgeAddress,
      table: stp,
    };
  } */

  private areAlreadyConnected(dev1: Device, dev2: Device) {
    return this.connections.some(([conn1, conn2]) => {
      if (dev1.ip === conn2.ip && dev2.ip === conn1.ip) {
        return true;
      }
      if (dev2.ip === conn1.ip && dev1.ip === conn2.ip) {
        return true;
      }
      return false;
    });
  }

  private async getSwitchBasePort(dev: Device) {
    const isCiscoSwitch = dev.vendor.toLowerCase().includes("cisco");
    let dot1dBase;

    if (!isCiscoSwitch) {
      const session = new SNMPSession(dev.ip, dev.snmpCommunity);

      dot1dBase = await session.table(SNMPTable.dot1dBasePortTable);
    } else {
      const vlanids = await this.getVlanIds(dev);

      let dot1dBases = [];
      for (const vlanid of vlanids) {
        const session = new SNMPSession(
          dev.ip,
          `${dev.snmpCommunity}@${vlanid}`
        );
        const data = await session.tableCols(SNMPTable.dot1dBasePortTable, [
          "1.1",
          "1.2",
        ]);
        dot1dBases.push(data);
        await delay(100);
      }

      dot1dBase = dot1dBases.reduce((acc, dot1dBase) => {
        return {
          ...acc,
          ...dot1dBase.value,
        };
      }, {});
    }

    return dot1dBase;
  }

  private async buildSpanningTree() {
    const switches = this.devices.filter((dev) => {
      return (
        [
          DeviceType.Switch_L2,
          DeviceType.Switch_L3_Bridge,
          DeviceType.Switch_L4,
        ].includes(dev.type) && !dev.isSynonym
      );
    });

    for (const currSw of switches) {
      const { stp, dot1dBase, ifTable } = currSw.extraData;

      if (currSw.ip === "172.28.0.210") {
        debugger;
      }

      const connectedPorts: any[] = stp.table.filter((entry: any) => {
        return (
          entry.designatedBridge !== stp.ownBridgeAddress &&
          ![1, 2, 6].includes(entry.stpPortState)
        );
      });

      connectedPorts.map((entry: any) => {
        const otherSw = this.devices.find(
          (dev) => dev.mac === entry.designatedBridge
        );
        if (!otherSw) {
          debugger;
          return;
        }

        const stpPort = entry.stpPort;
        const base = Object.values<any>(dot1dBase).find(
          (entry) => entry["1"] === stpPort
        );
        if (!base) {
          debugger;
        }

        const ifEntry = ifTable[base["2"]];

        if (
          !this.areAlreadyConnected(otherSw, currSw) &&
          otherSw.mac !== currSw.mac
        ) {
          this.connections.push([otherSw, currSw]);

          currSw.interfaces.push({
            connectedDevice: otherSw,
            ifIndex: ifEntry["1"],
            ifDesc: ifEntry["2"].toString(),
            ifPhysAddress: macBufToString(ifEntry["6"]),
          });

          if (otherSw.type !== DeviceType.Host) {
            const otherPort = entry.designatedPort;
            const otherBase = Object.values<any>(
              otherSw.extraData.dot1dBase
            ).find((entry) => entry["1"] === otherPort);

            const otherIfEntry = otherSw.extraData.ifTable[otherBase["2"]];
            otherSw.interfaces.push({
              connectedDevice: currSw,
              ifIndex: otherIfEntry["1"],
              ifDesc: otherIfEntry["2"].toString(),
              ifPhysAddress: macBufToString(otherIfEntry["6"]),
            });
          }
        }
      });
    }
    debugger;
  }

  private async directLinkAnalysis() {
    const subnets: any[] = [];

    for (const subnet of subnets) {
      const sub = Ip.subnet(subnet.ip, subnet.mask);
      const sws = this.devices.filter((dev) => {
        return (
          [
            DeviceType.Switch_L3_Bridge,
            DeviceType.Switch_L2,
            DeviceType.Switch_L4,
          ].includes(dev.type) && sub.contains(dev.ip)
        );
      });

      const hosts = this.devices.filter((dev) => {
        return dev.type === DeviceType.Host && sub.contains(dev.ip);
      });

      for (const currSw of sws) {
        /* const connectedHosts = hosts.filter((host) => {
          return (
            !currSw.isSynonym &&
            !!data.aft.connected.find((conn: any) => host.mac === conn.mac)
          );
        });
        connectedHosts.map((dev) => {
          if (
            !this.areAlreadyConnected(dev, currSw) &&
            dev.mac !== currSw.mac
          ) {
            this.connections.push([dev, currSw]);
            dev;
          }
        }); */
      }
    }
  }

  private async linkHosts() {
    const hosts = this.devices.filter((dev) => {
      return dev.type === DeviceType.Host;
    });

    const sws = this.devices.filter((dev) => {
      return [
        DeviceType.Switch_L2,
        DeviceType.Switch_L3_Bridge,
        DeviceType.Switch_L4,
      ].includes(dev.type);
    });

    hosts.map((dev) => {
      const mac = dev.mac;

      for (const sw of sws) {
        const port = sw.extraData.aft.connected.find((conn: any) => {
          return conn.mac === mac;
        });

        if (!port) {
          continue;
        }

        const hasAnotherMac = sw.extraData.aft.connected.some((conn: any) => {
          return port.ifPort === conn.ifPort && conn.mac !== mac;
        });

        // A => B => h1
        //        => h2

        if (!hasAnotherMac) {
          sw.interfaces.push({
            connectedDevice: dev,
            ifDesc: port.ifDesc,
            ifIndex: port.ifPort,
            ifPhysAddress: mac,
          });
          dev.connectedTo = {
            switch: sw,
            ifIndex: port.ifPort,
          };
          break;
        }
      }
    });
  }

  private async getDeviceType(device: {
    ip: string;
    snmpCommunity: string | false;
  }): Promise<DeviceType> {
    if (!device.snmpCommunity) {
      return DeviceType.Host;
    }

    const session = new SNMPSession(device.ip, device.snmpCommunity);

    try {
      const typeVarBind = await session.get<{ value: number }>(
        SNMPSystemOID.sysService
      );
      return await extractType(typeVarBind.value, session);
    } catch (e) {
      const nameVar = await session.get<{ value: Buffer }>(
        SNMPSystemOID.sysName
      );
      if (nameVar.value.toString().includes("TL-WA901ND")) {
        return DeviceType.Router;
      }
      return DeviceType.Host;
    }
  }

  private async getDeviceName(device: {
    ip: string;
    snmpCommunity: string | false;
  }) {
    if (!device.snmpCommunity) {
      try {
        const names = await getHostnameFromIp(device.ip);
        return names.join(", ");
      } catch (error) {
        return device.ip;
      }
    }

    const session = new SNMPSession(device.ip, device.snmpCommunity);

    const data = await session.get(SNMPSystemOID.sysName);

    return data.value.toString();
  }

  private async getDeviceData(device: {
    ip: string;
    mac: string;
  }): Promise<Device> {
    const isStatic = this.staticSubnets.some((subnet) =>
      subnet.contains(device.ip)
    );

    /* const dbDev: any = await DeviceModel.findOne({
      mac: device.mac,
    }).lean();

    if (dbDev) {
      return {
        ip: device.ip,
        mac: device.mac,
        isLikelyStatic: isStatic,
        name: device.ip,
        vendor: (oui(device.mac) || "Unknown Device").split("\n").shift(),
        type: dbDev.type,
        isSynonym: false,
        snmpCommunity: dbDev.snmpCommunity,
        snmpEnabled: dbDev.snmpEnabled,
        interfaces: [],
        extraData: {},
      };
    } */

    const snmpComm = await snmpReachable(device.ip);

    const dev = { ip: device.ip, snmpCommunity: snmpComm };

    const type = await this.getDeviceType(dev);
    const name = await this.getDeviceName(dev);

    return {
      ip: device.ip,
      mac: device.mac,
      isLikelyStatic: isStatic,
      name,
      vendor: (oui(device.mac) || "Unknown Device").split("\n").shift(),
      type,
      isSynonym: false,
      snmpCommunity: snmpComm as string,
      snmpEnabled: !!snmpComm,
      interfaces: [],
      extraData: {},
    };
  }

  private async getSwitchData(device: Device) {
    const ip = device.ip;
    let synIp = "";

    for (const [key, val] of this.synonyms.entries()) {
      if (val.includes(ip)) {
        synIp = key;
        break;
      }
    }

    if (synIp) {
      const data = this.devices.find((dev) => {
        return dev.ip === synIp;
      })?.extraData;

      return data;
    }

    const sess = new SNMPSession(device.ip, device.snmpCommunity);

    const [ifTable, dot1dBase] = await Promise.all([
      sess.tableCols(SNMPTable.ifTable, ["1.1", "1.2", "1.6"]),
      this.getSwitchBasePort(device),
    ]);

    let ifXTable: any = {};
    try {
      ifXTable = await sess.get("1.3.6.1.2.1.31.1.5.0");
    } catch (e) {
      ifXTable = {};
    }

    device.extraData = {
      ifTable: ifTable,
      dot1dBase: dot1dBase,
    };

    const [aft] = await Promise.all([
      this.getSwitchAFT(device),
      //this.getSwitchStp(device),
    ]);

    return {
      ifTable: ifTable,
      dot1dBase: dot1dBase,
      aft,
      supportHC: !!ifXTable.value,
    };
  }

  private async detectMultipleIps() {
    const entryDevice = this.devices.find((dev) => dev.ip === this.entryIp);

    if (!entryDevice) {
      throw new Error("Cant find the entry device in them all");
    }

    const session = new SNMPSession(entryDevice.ip, entryDevice.snmpCommunity);

    // Make sure to not loop back on this device through another ip
    const mainSwAddrTable = await session.walk("1.3.6.1.2.1.4.20.1.1");

    const syn = mainSwAddrTable.map((entry) => entry.value);

    this.synonyms.set(entryDevice.ip, syn);

    syn
      .map((ip) => {
        return this.devices.find((dev) => {
          return dev.ip === ip && dev.ip !== this.entryIp;
        });
      })
      .forEach((dev) => {
        if (!dev) return;
        dev.isSynonym = true;
      });

    const ifTable = await session.tableCols(SNMPTable.ifTable, [
      "1.1",
      "1.2",
      "1.6",
    ]);

    await delay(500);

    const dot1dBase = await this.getSwitchBasePort(entryDevice);

    entryDevice.extraData = {
      ifTable,
      dot1dBase,
    };

    const aft = await this.getSwitchAFT(entryDevice);

    entryDevice.extraData = {
      ...entryDevice.extraData,
      aft,
    };
  }

  private async persistDevices() {
    // update all devices to be offline
    await DeviceModel.updateMany(
      {},
      {
        online: false,
      },
      {
        multi: true,
      }
    );

    const hosts = this.devices.filter((dev) => dev.type === DeviceType.Host);
    const others = this.devices.filter((dev) => dev.type !== DeviceType.Host);

    const othersProm = others.map(async function (device) {
      if (device.isSynonym) {
        return false;
      }

      const doc = await DeviceModel.findOneAndUpdate(
        { mac: device.mac },
        {
          mac: device.mac,
          type: device.type,
          name: device.name,
          vendor: device.vendor,
          currIp: device.ip,
          extraData: device.extraData,
          snmpEnabled: device.snmpEnabled,
          snmpCommunity: device.snmpCommunity,
          online: true,
        },
        {
          upsert: true,
        }
      ).lean();

      return true;
    });

    await Promise.all(othersProm);

    const hostsProm = hosts.map(async function (device) {
      if (device.isSynonym) {
        return false;
      }
      let connection = undefined;

      if (device.connectedTo) {
        const doc = await DeviceModel.findOne({
          mac: device.connectedTo.switch.mac,
        });
        if (!doc) {
          return;
        }
        connection = {
          switch: doc._id,
          ifIndex: device.connectedTo.ifIndex,
        };
      }

      await DeviceModel.findOneAndUpdate(
        { mac: device.mac },
        {
          mac: device.mac,
          type: device.type,
          name: device.name,
          vendor: device.vendor,
          currIp: device.ip,
          extraData: device.extraData,
          connectedTo: connection,
          snmpEnabled: device.snmpEnabled,
          snmpCommunity: device.snmpCommunity,
          online: true,
        },
        { upsert: true }
      );

      return true;
    });

    await Promise.all(hostsProm);
  }

  private async topologyDiscovery() {
    try {
      if (this.state === DiscoveryState.RUNNING) {
        // already in the middle of a scan
        return;
      }

      const discId = Math.round(Math.random() * 10000);
      console.time(`Discovery ${discId}`);
      this.state = DiscoveryState.RUNNING;

      this.progress = 0;
      this.emit("starting");

      console.time("deviceDiscovery");
      const devices = await this.discoverDevices();
      console.timeEnd("deviceDiscovery");

      this.progress = 20;

      console.time("deviceData");
      this.devices = await Promise.all(
        devices.map(this.getDeviceData.bind(this))
      );
      console.timeEnd("deviceData");

      this.progress = 40;

      console.time("multipleIps");
      await this.detectMultipleIps();
      console.timeEnd("multipleIps");

      console.time("switchData");
      const networkDevices = this.devices.filter((dev) => {
        return [
          DeviceType.Switch_L2,
          DeviceType.Switch_L3_Bridge,
          DeviceType.Switch_L4,
        ].includes(dev.type);
      });

      const swData = await Promise.all(
        networkDevices.map(this.getSwitchData.bind(this))
      );

      swData.forEach((data, i) => {
        const sw = networkDevices[i];
        sw.extraData = data;
      });
      console.timeEnd("switchData");

      this.progress = 60;

      console.time("linkHosts");
      await this.linkHosts();
      console.timeEnd("linkHosts");

      this.progress = 80;

      console.time("persistDevices");
      await this.persistDevices();
      console.timeEnd("persistDevices");

      console.time("vlanDiscovery");
      this.allVlans = await this.getSwitchVlans(this.entryIp);
      console.timeEnd("vlanDiscovery");

      //console.log(this.devices.map((dev) => dev.ip).join(" "));

      const nodes: any[] = await Promise.all(
        this.devices.map(async (dev, i) => {
          const doc = await DeviceModel.findOne(
            {
              mac: dev.mac,
            },
            { _id: 1 }
          ).lean();
          return {
            ...dev,
            id: i + 1,
            monitored:
              dev.type === DeviceType.Host &&
              (!!dev.connectedTo || dev.snmpEnabled),
            // remove these properties
            extraData: undefined,
            interfaces: undefined,
            connectedTo: undefined,
            // add these properties
            _id: doc?._id.toString(),
          };
        })
      );

      console.log(
        `Discovered ${this.devices.length} at ${new Date().toLocaleString()}`
      );
      console.timeEnd(`Discovery ${discId}`);

      this.state = DiscoveryState.IDLE;
      this.progress = 100;
      this.lastScan = {
        nodes,
        vlans: this.allVlans,
        timestamp: new Date().toISOString(),
      };
      this.emit("ended", { nodes, vlans: this.allVlans });
    } catch (error) {
      console.error(error);
      this.state = DiscoveryState.IDLE;
    }
  }

  private spawnWorker() {
    const worker = new Worker(__dirname + "/monitoring.js", {
      env: SHARE_ENV,
    });
    worker.postMessage({ type: "START" });
    worker.once("error", (err) => {
      debug("Worker", err);
      this.spawnWorker();
    });
    (global as any).monitorWorker = worker;
  }

  public async startDiscovery() {
    try {
      // kickstart discovery at the start the of server
      await this.topologyDiscovery();
    } catch (error) {
      debug("Failure at the first discovery", error);
      this.state = DiscoveryState.IDLE;
    }

    this.spawnWorker();

    // repeat over 5min period
    const intervalId = setInterval(
      this.topologyDiscovery.bind(this),
      5 * 60 * 1000 // 5 minutes
    );
  }
}

export const discoverer = new DiscoveryModule();
