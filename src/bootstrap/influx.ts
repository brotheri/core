import { InfluxDB, escape } from "influx";
import monitorSchema from "../models/monitor.schema";

let _db: InfluxDB;

/*
 * @desc A singleton fn to return an InfluxDB instance
 */
export async function getInfluxDB() {
  if (_db) {
    return _db;
  }

  const { INFLUX_URI } = process.env;
  const { INFLUX_DB } = process.env;

  if (!INFLUX_DB || !INFLUX_URI) {
    throw new Error(`Misconfigured influx db stuff`);
  }

  const influx = new InfluxDB({
    host: INFLUX_URI,
    database: INFLUX_DB,
    schema: [monitorSchema],
  });

  const dbs = await influx.getDatabaseNames();

  if (!dbs.includes(INFLUX_DB)) {
    await influx.createDatabase(INFLUX_DB);
  }

  _db = influx;

  console.log("InfluxDB Started");

  return _db;
}
