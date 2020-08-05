import mongoose from "mongoose";
import { config } from "dotenv";
import Admin from "../models/admin.model";

(async function () {
  config();

  const mongo_uri = process.env.MONGO_URI || "";

  await mongoose.connect(mongo_uri, {
    useNewUrlParser: true,
    useCreateIndex: true,
    useUnifiedTopology: true,
  });

  const email = process.argv[2] || "admin@cufe.com";
  const password = process.argv[3] || "admin123";
  const full_name = process.argv[4] || "Network Administrator";

  const userData = {
    full_name,
    email,
    password: password,
    role: "superadmin",
  };

  const admin = new Admin(userData);

  await admin.save();

  console.log(`Created an admin, his details are as follows:
  Full Name: ${full_name}
  Email: ${email}
  Password: ${password} (store it carefully because it is hashed now)`);

  await mongoose.disconnect();
})();
