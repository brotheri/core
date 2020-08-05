// @ts-ignore
import snmp from "net-snmp";
import weak from "weak-napi";
import { SNMPSystemOID, SNMPTable } from "./snmpMibs";
import { zip } from "./utils";

interface ISNMPOptions {
  timeout: number;
}

export class SNMPSession {
  public ip: string;
  public community: string;
  private port: number;

  session: any;

  // 60 seconds
  private timeout = 60 * 1000;

  constructor(ip: string, community: string, port = 161) {
    this.ip = ip;
    this.community = community;
    this.port = port;

    this.session = snmp.createSession(this.ip, this.community, {
      port: this.port,
      version: snmp.Version2c,
      timeout: this.timeout,
      retry: 3,
    });

    weak(this, () => {
      this.session.close();
    });
  }

  async table<T = any>(
    oid: string,
    row?: number,
    options?: ISNMPOptions
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      this.session.table(oid, 25, (err: any, table: any) => {
        if (err) {
          return reject(err);
        }
        if (row && row !== -1) {
          const theRow = table[String(row)];
          if (!theRow) {
            return reject("NoSuchObject");
          }
          resolve(theRow);
        } else {
          resolve(table);
        }
      });
    });
  }

  async get<T = any>(oid: string, options?: ISNMPOptions): Promise<T> {
    return new Promise((resolve, reject) => {
      this.session.get([oid], (err: any, varbinds: any[]) => {
        if (err) {
          return reject(err);
        }
        if (snmp.isVarbindError(varbinds[0])) {
          return reject(snmp.varbindError(varbinds[0]));
        }
        resolve(varbinds[0]);
      });
    });
  }

  async walk<T = any>(oid: string, options?: ISNMPOptions): Promise<T[]> {
    return new Promise((resolve, reject) => {
      let results: T[] = [];
      this.session.subtree(
        oid,
        25,
        (varbinds: any[]) => {
          varbinds.every((varbind) => {
            if (snmp.isVarbindError(varbinds)) {
              reject(snmp.varbindError(varbinds));
              return false;
            }
            results.push(varbind);
            return true;
          });
        },
        (err: any) => {
          if (err) {
            return reject(err);
          }
          resolve(results);
        }
      );
    });
  }

  async tableCols<T = any>(
    oid: string,
    rows: string[],
    options?: ISNMPOptions
  ): Promise<any> {
    if (rows.length < 1) {
      throw new RangeError("Optional rows must be at least one row");
    }

    const rowOids = rows.map((rowOid) => {
      return `${oid}.${rowOid}`;
    });

    const rowProms = rowOids.map((rowOid) => {
      return this.walk(rowOid);
    });

    const allEntries = await Promise.all(rowProms);

    const maxLength = allEntries[0].length;

    const table = Array.from({ length: maxLength })
      .fill(0)
      .map((_, i) => {
        return allEntries.map((arr) => arr[i]);
      })
      .map((entry) => {
        return entry.reduce((acc, prop) => {
          let key = prop.oid.split(".").reverse()[1];
          acc[key] = prop.value;
          return acc;
        }, {});
      });

    return table;
  }

  public static async available(
    ip: string,
    community: string
  ): Promise<string | false> {
    return new Promise((resolve) => {
      const session = snmp.createSession(ip, community, {
        timeout: 3 * 1000, // 5 seconds
      });

      session.get([SNMPSystemOID.sysName], (err: any) => {
        session.close();
        if (err) {
          resolve(false);
        } else {
          resolve(community);
        }
      });
    });
  }
}
