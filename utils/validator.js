const { bookSchema } = require("./schema");
const jwt = require("jsonwebtoken");
const UserService = require("../services/user_service");

module.exports = {
  validateBody: (Schema) => {
    return (req, res, next) => {
      const ret = Schema.validate(req.body);
      if (ret.error) {
        console.error("the error is ", ret.error);
        next(new Error(ret.error.details[0].message));
      } else {
        next();
      }
    };
  },

  validateRow: (row, rowNumber) => {
    const { error, value } = bookSchema.importExcel.validate(row, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      return {
        isValid: false,
        errors: error.details.map((d) => `Row ${rowNumber}: ${d.message}`),
      };
    }

    return {
      isValid: true,
      value,
    };
  },

  validateToken: async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      const err = new Error("Access token missing.");
      err.status = 401;
      err.code = "TOKEN_MISSING";
      return next(err);
    }

    const token = authHeader.split(" ")[1];

    try {
      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      const userId = decoded.userId;

      const user = await UserService.getById(userId);
      if (!user) {
        const err = new Error("User not found.");
        err.status = 401;
        err.code = "USER_NOT_FOUND";
        return next(err);
      }

      req.userId = userId;
      req.user = user;

      next();
    } catch (err) {
      if (
        err.name !== "TokenExpiredError" &&
        err.name !== "JsonWebTokenError"
      ) {
        return next(err);
      }

      const isExpired = err.name === "TokenExpiredError";
      const e = new Error(
        isExpired ? "Access token expired." : "Invalid access token.",
      );
      e.status = 401;
      e.code = isExpired ? "TOKEN_EXPIRED" : "INVALID_TOKEN";

      next(e);
    }
  },

  validateManager: () => {
    return (req, res, next) => {
      const role = req.user?.role?.toUpperCase();
      if (role === "ADMIN" || role === "LIBRARIAN") {
        next();
      } else {
        next(new Error("You have no permission to use this route"));
      }
    };
  },

  validateRole: (...roles) => {
    return (req, res, next) => {
      const userRole = req.user?.role?.toUpperCase();
      const allowedRoles = roles.map((r) => r.toUpperCase());

      if (req.user && allowedRoles.includes(userRole)) {
        next();
      } else {
        next(new Error("You have no permission to use this route"));
      }
    };
  },
};
