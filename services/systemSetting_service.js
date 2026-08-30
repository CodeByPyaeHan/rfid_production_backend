const model = require("../models/systemSetting_model");

const getSettings = async () => {
  let settings = await model.findOne({ singleton_key: "GLOBAL" });
  if (!settings) settings = await model.create({ singleton_key: "GLOBAL" });
  return settings;
};

const updateSettings = async (data) => {
  return await model.findOneAndUpdate(
    { singleton_key: "GLOBAL" },
    { $set: data },
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true },
  );
};

module.exports = { getSettings, updateSettings };
