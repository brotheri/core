import { Socket as TCPSocket } from "net";
import SNMPCommunity, { ISNMPCommunity } from "../models/community.model";
import { SNMPSession } from "./snmp";

interface IReachableOptions {
  ip: string;
  port: number;
  timeout?: number;
  toCheck: "host" | "port";
}

export async function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function oneSuccess<T = any>(promises: Promise<T>[]): Promise<T> {
  return Promise.all(
    promises.map((p) => {
      // If a request fails, count that as a resolution so it will keep
      // waiting for other possible successes. If a request succeeds,
      // treat it as a rejection so Promise.all immediately bails out.
      return p.then(
        (val) => Promise.reject(val),
        (err) => Promise.resolve(err)
      );
    })
  ).then(
    // If '.all' resolved, we've just got an array of errors.
    (errors) => Promise.reject(errors),
    // If '.all' rejected, we've got the result we wanted.
    (val) => Promise.resolve(val)
  );
}

/**
 * @description
 * This function checks if the port on the remote ip is alive and listening OR if the host is ip.
 */
export const reachable = async function (
  opts: IReachableOptions
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new TCPSocket();

    function onError(err: any) {
      if (err && err.code === "ECONNREFUSED" && opts.toCheck === "host") {
        resolve(true);
      }
      socket.destroy();
      resolve(false);
    }

    socket.setTimeout(opts.timeout || 3000);
    socket.once("error", onError);
    socket.once("timeout", onError);

    socket.connect(opts.port, opts.ip, () => {
      socket.end();
      resolve(true);
    });
  });
};

/**
 * @description
 * Try as many community strings as possible and resolve with the successful one
 */
export const snmpReachable = async function (
  ip: string
): Promise<string | false> {
  try {
    const allCommunities: ISNMPCommunity[] = await SNMPCommunity.find()
      .select("community")
      .lean();

    const allSessionsPromise = allCommunities.map((doc) => {
      return SNMPSession.available(ip, doc.community);
    });

    const theCommunity = await oneSuccess(allSessionsPromise);

    if (!theCommunity) {
      // all communities failed us
      return false;
    }

    return theCommunity;
  } catch (err) {
    return false;
  }
};

/**
 * @description
 * This transforms a 6 bytes buffer into the standard human-readable MAC format
 */
export function macBufToString(buf: Buffer) {
  if (!buf) {
    return "";
  }
  let mac = "";
  for (let i = 0; i < 5; i++) {
    const byte = buf[i];
    mac += byte.toString(16).padStart(2, "0") + ":";
  }
  mac += buf[5].toString(16).padStart(2, "0");
  return mac;
}

/**
 * @description
 * This is the standard zip function
 */
export function zip(...arrs: any[]) {
  const resultLength = Math.min(...arrs.map((a) => a.length));
  return new Array(resultLength).fill(0).map((_, i) => arrs.map((a) => a[i]));
}
