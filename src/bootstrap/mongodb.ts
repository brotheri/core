import mongoose from "mongoose";

export default async function () {
  mongoose.Promise = global.Promise;

  const uri = process.env.MONGO_URI || "";
  const dbName = process.env.DATABASE_NAME || "";

  await mongoose.connect(uri, {
    dbName,
    useCreateIndex: true,
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useFindAndModify: false,
  });

  console.log("MongoDB Started");
}
