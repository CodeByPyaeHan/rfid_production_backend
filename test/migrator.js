const fs = require("fs");
const UserService = require("../services/user_service");
const DeviceService = require("../services/device_service");
const { ENCODER } = require(`../${process.env.FACADE_PATH}`);
const storage = (fileName) => `./data/${fileName}.json`;
const readFile = (fileName) => JSON.parse(fs.readFileSync(storage(fileName)));

const migrateUser = async () => {
  let users = readFile("users");
  for (let user of users) {
    user.password = ENCODER.encode(user.password);

    if (user.role === "ADMIN" || user.role === "LIBRARIAN") {
      user.status = "ACTIVE";
    }
    await UserService.add(user);
  }
};

const migrateDevice = async () => {
  let devices = readFile("devices");
  for (let device of devices) {
    await DeviceService.add(device);
  }
};

const migrate = async () => {
  await migrateUser();
  // await migrateDevice();
  console.log("Migration Done!");
};

module.exports = {
  migrate,
};
