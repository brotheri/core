import { Schema, Document, model } from "mongoose";

export interface IBlocklistEntry {
  community: string;
}

const blockListSchema = new Schema<IBlocklistEntry>(
  {
    name: { type: String, required: true, index: true, unique: true },
  },
  { timestamps: true }
);

interface BlockList extends IBlocklistEntry, Document {}

export default model<BlockList>("BlockList", blockListSchema);
