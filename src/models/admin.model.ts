import { Schema, model, Document } from "mongoose";
import { hash } from "bcryptjs";

// interface for the db model
interface IAdmin {
  full_name: string;
  email: string;
  password: string;
  lastLoginAttempt: Date;
}

const adminSchema = new Schema<IAdmin>(
  {
    full_name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["superadmin", "admin"], default: "admin" },
    lastLoginAttempt: { type: Date },
  },
  { timestamps: true }
);

adminSchema.pre<Admin>("save", async function (next) {
  if (this.isNew || this.isModified("password")) {
    const hashedPassword = await hash(this.password, 10);
    this.password = hashedPassword;
  }
  next();
});

// interface for autocomplete with mongo properties
interface Admin extends IAdmin, Document {}

export default model<Admin>("Admin", adminSchema);
