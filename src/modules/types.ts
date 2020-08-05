import { macBufToString } from "./utils";
import { SNMPTable, SNMPSystemOID, DeviceType } from "./snmpMibs";
import { SNMPSession } from "./snmp";
import { promises as dnsPromise } from "dns";

export async function extractType(sysService: number, session: SNMPSession) {
  // 1...7 OSI Layers
  // 0...6 String Indexes
  const layers = sysService.toString(2).padStart(7, "0").split("").reverse();

  const l2 = layers[1] === "1";
  const l3 = layers[2] === "1";
  const l4 = layers[3] === "1";
  const l7 = layers[6] === "1";
  if (session.ip === "10.37.10.165") {
    debugger;
  }
  try {
    await session.get(SNMPSystemOID.prtMIB);
    return DeviceType.Printer;
  } catch (error) {}

  if (l2 && l3) {
    try {
      //* testing bridge mibs
      const { value: numPorts, oid } = await session.get(
        SNMPSystemOID.dot1DBaseNumPorts
      );

      if (numPorts === 0) {
        throw "no bridges";
      }

      const [ifPhys, ifType] = await Promise.all([
        session.walk("1.3.6.1.2.1.2.2.1.6"),
        session.walk("1.3.6.1.2.1.2.2.1.3"),
      ]);

      const uniq = new Set<string>();

      const hasRepeatedMac = ifPhys.some((varbind, i) => {
        const type = ifType[i].value;
        const entry = varbind.value;
        if (type !== 6 || entry.length !== 6) {
          return false;
        }
        const mac = macBufToString(entry);
        if (uniq.has(mac)) {
          return true;
        }
        return false;
      });

      if (hasRepeatedMac) {
        return DeviceType.Router;
      }

      return DeviceType.Switch_L3_Bridge;
    } catch (error) {
      if (l7) {
        return DeviceType.SR_L7_Bridge;
      } else {
        return DeviceType.Router;
      }
    }
  }

  if (l2 && !l3) {
    try {
      //* testing bridge mib
      const { value: numPorts } = await session.get(
        SNMPSystemOID.dot1DBaseNumPorts
      );
      if (numPorts === 0) {
        throw "no bridges";
      }

      return DeviceType.Switch_L2;
    } catch (error) {
      return DeviceType.Host;
    }
  }

  if (!l2 && l3) {
    if (l4) {
      return DeviceType.Switch_L4;
    } else {
      if (l7) {
        return DeviceType.SR_L7_Bridge;
      } else {
        return DeviceType.Router;
      }
    }
  }

  return DeviceType.Host;
}

export function getHostnameFromIp(ip: string): Promise<string[]> {
  return dnsPromise.reverse(ip);
}
