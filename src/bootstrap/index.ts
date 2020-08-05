import { config } from "dotenv";
import mongoInit from "./mongodb";
import { getInfluxDB } from "./influx";

export default [async () => config(), mongoInit, getInfluxDB];
