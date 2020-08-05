import { Schema, model } from "mongoose";

const linkSchema = new Schema(
  {
    from: { type: Schema.Types.ObjectId, ref: "Device" },
    to: { type: Schema.Types.ObjectId, ref: "Device" },
    speed: { type: String }
  },
  { timestamps: true }
);

linkSchema.pre("save", function(next) {
  console.log("model is: ", this.toJSON());
  next();
});

export default model("Link", linkSchema);
