import { Schema, model } from "mongoose";

export interface ISNMPCommunity {
  community: string;
}

const communitySchema = new Schema(
  {
    community: { type: String, required: true, index: true },
  },
  { timestamps: true }
);

export default model("Community", communitySchema);
