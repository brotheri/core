import mongoose from "mongoose";
import { config } from "dotenv";
import SNMPCommunity from "../models/community.model";

(async function () {
  config();

  const mongo_uri = process.env.MONGO_URI || "";

  await mongoose.connect(mongo_uri, { useNewUrlParser: true, useCreateIndex: true, useUnifiedTopology: true });

  const community = process.argv[2] || "cairo";

  const snmpComm = new SNMPCommunity({
    community,
  });

  await snmpComm.save();

  console.log(`Created a dynamic snmp community '${community}'`);

  await mongoose.disconnect();
})();
