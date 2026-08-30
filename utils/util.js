const Redis = require("async-redis").createClient();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const Msg = (res, message = "", result = {}) => {
  res.status(200).json({ con: true, message, result });
};

const escapeRegex = (text) => {
  let escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return escaped.replace(/\\\(/g, "\\s*\\(").replace(/\\\)/g, "\\s*\\)");
};

const RDB = {
  set: async (key, val) => await Redis.set(key.toString(), JSON.stringify(val)),
  get: async (key) => JSON.parse(await Redis.get(key.toString())),
  del: async (key) => await Redis.del(key.toString()),
  keys: async (pattern) => await Redis.keys(pattern.toString()),
};

const TOKEN = {
  makeToken: (payload) =>
    jwt.sign({ payload }, process.env.SECRET_KEY, { expiresIn: "10h" }),
};

const ENCODER = {
  encode: (password) => bcrypt.hashSync(password, 10),
  compare: (pass, hash) => bcrypt.compareSync(pass, hash),
};

module.exports = { Msg, escapeRegex, RDB, TOKEN, ENCODER };
