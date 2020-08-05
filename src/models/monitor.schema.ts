import { FieldType } from "influx";

export default {
  // name of table
  measurement: "hostConsumption",
  // attributes in table
  fields: {
    inOctets: FieldType.INTEGER,
    outOctets: FieldType.INTEGER,
  },
  tags: ["deviceId"],
};
