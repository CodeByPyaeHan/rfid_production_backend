function buildUserCardPayload(username) {
  const code = process.env.INSTITUTION_CODE || "LOCAL";
  const str = String(username || "").trim();
  const clean = str.startsWith("@") ? str.slice(1) : str;
  return `@${code}_${clean}`;
}

function parseUserCardPayload(raw) {
  const str = String(raw || "").trim();

  if (!str.startsWith("@") || str.indexOf("_") === -1) {
    return {
      institutionCode: null,
      username: str.startsWith("@") ? str : `@${str}`,
    };
  }

  const withoutAt = str.slice(1);
  const idx = withoutAt.indexOf("_");

  const institutionCode = withoutAt.slice(0, idx).toUpperCase();
  const username = `@${withoutAt.slice(idx + 1)}`;

  return { institutionCode, username };
}

module.exports = { buildUserCardPayload, parseUserCardPayload };
