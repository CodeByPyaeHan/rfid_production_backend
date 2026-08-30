const institutionService = require("../services/institution_service");

async function validateInstitutionAuth(req, res, next) {
  const code = req.headers["x-institution-code"];
  const key = req.headers["x-institution-key"];
  if (!code || !key) {
    const e = new Error("Missing institution credentials.");
    e.status = 401;
    return next(e);
  }

  const institution = await institutionService.getByCode(code);
  if (!institution || institution.shared_secret !== key) {
    const e = new Error("Invalid institution credentials.");
    e.status = 401;
    return next(e);
  }
  req.callingInstitution = institution;
  next();
}

module.exports = { validateInstitutionAuth };
