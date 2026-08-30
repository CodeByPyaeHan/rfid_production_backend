const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const mongoose = require("mongoose");

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("Database connected"))
  .catch((err) => console.error("MongoDB connection error:", err));
const migrator = require("./migrator");

const test = async () => {
  // console.clear();
  await migrator.migrate();
};

test();
