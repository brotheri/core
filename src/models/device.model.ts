import { Schema, model, SchemaTypes } from "mongoose";
import { DeviceType } from "../modules/snmpMibs";

function enumToArray(theEnum: any) {
  return Object.entries(theEnum)
    .filter((e) => !isNaN(e[0] as any))
    .map((e) => e[1]);
}

const connectedToSchema = new Schema({
  switch: {
    type: SchemaTypes.ObjectId,
    ref: "Device",
  },
  ifIndex: { type: Number },
});

const deviceSchema = new Schema(
  {
    name: { type: String },
    type: { type: String, enum: enumToArray(DeviceType) },
    mac: { type: String, required: true },
    vendor: { type: String, required: true },
    currIp: { type: String },
    connectedTo: connectedToSchema,
    snmpEnabled: { type: Boolean },
    snmpCommunity: { type: String },
    downSpeed: { type: Number },
    upSpeed: { type: Number },
    extraData: { type: SchemaTypes.Mixed },
    monitorData: { type: SchemaTypes.Mixed },
    online: { type: Boolean, default: false },
    exceedQuota: { type: Boolean, default: false },
  },
  { timestamps: true }
);

deviceSchema.pre("save", function (next) {
  // pre save hook
  next();
});

export default model("Device", deviceSchema);
