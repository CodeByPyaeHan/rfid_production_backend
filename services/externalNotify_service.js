const axios = require("axios");

const notifyHomeInstitution = (institution, payload) => {
  axios
    .post(`${institution.api_url}/api/external/notify-checkout`, payload, {
      headers: {
        "x-institution-code": process.env.INSTITUTION_CODE,
        "x-institution-key": institution.shared_secret,
      },
      timeout: 5000,
    })
    .catch((err) =>
      console.error(
        `[ExternalNotify] Failed to notify ${institution.code}:`,
        err.message,
      ),
    );
};

module.exports = { notifyHomeInstitution };
