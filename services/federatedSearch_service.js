const axios = require("axios");
const institutionService = require("./institution_service");

const TIMEOUT_MS = 4000;

const searchAcrossInstitutions = async (query) => {
  const institutions = await institutionService.getAllActiveWithSecret();

  const settled = await Promise.allSettled(
    institutions.map((inst) =>
      axios
        .get(`${inst.api_url}/api/external/search-catalog`, {
          params: { q: query },
          headers: {
            "x-institution-code": process.env.INSTITUTION_CODE,
            "x-institution-key": inst.shared_secret,
          },
          timeout: TIMEOUT_MS,
        })
        .then((res) => ({
          institution_code: inst.code,
          institution_name: inst.full_name,
          results: res.data.result || [],
        })),
    ),
  );

  const results = [];
  const failed = [];
  settled.forEach((r, idx) => {
    if (r.status === "fulfilled") results.push(r.value);
    else
      failed.push({
        institution_code: institutions[idx].code,
        institution_name: institutions[idx].full_name,
        reason: "unreachable_or_timeout",
      });
  });

  return { results, failed };
};

module.exports = { searchAcrossInstitutions };
