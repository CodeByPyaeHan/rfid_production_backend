const axios = require("axios");
const institutionService = require("./institution_service");
function httpError(msg, status) {
  const e = new Error(msg);
  e.status = status;
  return e;
}

const verifyExternalUser = async (institutionId, identifier) => {
  const institution = await institutionService.getByIdWithSecret(institutionId);
  if (!institution || institution.is_deleted || !institution.is_active)
    throw httpError("Institution not found or inactive.", 404);

  try {
    const res = await axios.post(
      `${institution.api_url}/api/external/verify-user`,
      { username: identifier },
      {
        headers: {
          "x-institution-code": process.env.INSTITUTION_CODE,
          "x-institution-key": institution.shared_secret,
        },
        timeout: 5000,
      },
    );
    return { institution, ...res.data.result };
  } catch (err) {
    throw httpError(
      `Could not verify with ${institution.full_name}: ${err.response?.data?.message || err.message}`,
      502,
    );
  }
};

module.exports = { verifyExternalUser };
