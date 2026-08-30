const joi = require("joi");
const { schema } = require("../models/bookCopy_model");
const OBJECT_ID = joi.string().hex().length(24);
const STATUS_ENUM = ["ACTIVE", "INACTIVE", "GRADUATED", "SUSPENDED"];
const NOTIF_TYPES = [
  "RESERVATION_READY",
  "RESERVATION_EXPIRED",
  "RESERVATION_CANCELLED",
  "DUE_SOON",
  "OVERDUE",
  "FINE_ISSUED",
  "GENERAL",
];

const isbnSchema = joi
  .string()
  .pattern(/^(97[89][\-\s]?)?\d{1,5}[\-\s]?\d+[\-\s]?\d+[\-\s]?[\dX]$/)
  .messages({
    "string.pattern.base": "ISBN must be a valid ISBN-10 or ISBN-13 format",
  });

const yearSchema = joi
  .string()
  .pattern(/^\d{4}$/)
  .messages({
    "string.pattern.base": "Year must be a 4-digit number (e.g. 2023)",
  });

const loanPolicySchema = joi
  .string()
  .valid("LOANABLE", "NOT_LOANABLE", "STAFF_ONLY")
  .default("LOANABLE");

const copyStatusSchema = joi
  .string()
  .valid("pending_rfid", "available", "borrowed", "lost", "damaged")
  .default("pending_rfid");

const materialTypeSchema = joi
  .string()
  .valid("BOOK", "BOOK_CD", "BOOK_DVD")
  .default("BOOK");

const documentTypeSchema = joi
  .string()
  .valid("book", "thesis", "journal", "report")
  .default("book");

const catalogSchema = joi.object({
  title: joi.string().min(1).max(500).required(),
  author: joi.string().min(1).max(300).required(),
  isbn_number: isbnSchema,
  subtitle: joi.string().max(500),
  authorRole: joi.string().max(200),
  author2: joi.string().max(300),
  author3: joi.string().max(300),
  publisher: joi.string().max(300),
  pubPlace: joi.string().max(200),
  pubYear: yearSchema,
  edition: joi.string().max(100),
  pages: joi.string(),
  illustrations: joi.string().max(200),
  dimensions: joi.string().max(100),
  ebookUrl: joi.string(),
  seriesTitle: joi.string().max(300),
  generalNote: joi.string().max(2000),
  bibNote: joi.string().max(2000),
  acquisitionMethod: joi.string().max(500),
  cover_image_external_url: joi.string(),
  // Classification
  classNumber: joi.string().max(50),
  documentType: documentTypeSchema.optional(),
  materialType: materialTypeSchema.optional(),
  loanPolicy: loanPolicySchema.optional(),
  keywords: joi.array().items(joi.string().max(200)).max(50),
  language: joi.string().max(100),

  // Copy info
  copyCount: joi.number().integer().min(1).max(100).required(),
  shelfId: joi.string().hex().length(24),
  price: joi.string().min(0).max(9999999),
  acquiredDate: joi.date().iso().max("now"),
});

const bookSchema = {
  importExcel: joi.object({
    title: joi.string().required().messages({
      "any.required": "Title လိုအပ်ပါသည်",
      "string.empty": "Title မဖြစ်မနေထည့်ရသည်",
      "string.base": "Title လိုအပ်ပါသည်",
    }),
    author: joi.string().allow(null),
    isbn_number: joi
      .string()
      .pattern(/^[0-9Xx\- ]+$/)
      .allow(null),

    publisher: joi.string().allow(null),
    pubYear: joi
      .alternatives()
      .try(joi.number().integer(), joi.string())
      .allow(null),

    classNumber: joi.string().allow(null),
    shelfLocation: joi.string().allow(null),

    materialType: joi.string().valid("BOOK", "BOOK_CD", "BOOK_DVD"),
    loanPolicy: joi.string().valid("LOANABLE", "NOT_LOANABLE", "STAFF_ONLY"),

    accession_number: joi.string().allow(null),
    price: joi.string().allow(null),
    acquiredDate: joi.date().allow(null),

    // marc fields
    subtitle: joi.string().allow(null),
    authorRole: joi.string().allow(null),
    author2: joi.string().allow(null),
    author3: joi.string().allow(null),
    pages: joi.string().allow(null),
    edition: joi.string().allow(null),
    illustrations: joi.string().allow(null),
    dimensions: joi.string().allow(null),
    seriesTitle: joi.string().allow(null),
    genNote: joi.string().allow(null),
    note: joi.string().allow(null),
    bibNote: joi.string().allow(null),
    ebook_url: joi.string().allow(null),
    keywords: joi.string().allow(null),
    acquired_method: joi.string().allow(null),
    documentType: joi.string(),
    copyCount: joi.number(),
  }),

  create: catalogSchema,

  update: catalogSchema.fork(["copyCount"], (schema) => schema.optional()),
  addCopy: joi.object({
    copyCount: joi.number().integer().min(1).max(100).required(),
    shelfId: joi.string().hex().length(24),
    price: joi.string().max(15),
    acquiredDate: joi.date().iso().max("now"),
  }),
  getAllForLibrarian: joi.object({
    page: joi.number().integer().min(1).default(1),
    limit: joi.number().integer().min(1).max(100).default(20),
    search: joi.string().trim().max(200).optional().allow(""),
    search_by: joi
      .string()
      .valid("title", "author", "isbn", "call_number", "keyword")
      .optional()
      .allow(""),
    documentType: documentTypeSchema.optional().allow(""),
    loanPolicy: loanPolicySchema.optional().allow(""),
    includeDeleted: joi.boolean().truthy("true").falsy("false").default(false),
  }),
  getAllForPortal: joi.object({
    page: joi.number().integer().min(1).default(1),
    limit: joi.number().integer().min(1).max(100).default(20),
    search: joi.string().trim().max(200).optional().allow(""),
    search_by: joi
      .string()
      .valid("title", "author", "isbn", "call_number", "keyword")
      .optional()
      .allow(""),
    availability: joi
      .string()
      .valid("available", "borrowed")
      .optional()
      .allow(""),
  }),
  isbnParamSchema: joi.object({
    isbn: joi.string().min(10).max(20).required(),
  }),
};

const bookCopySchema = {
  update: joi.object({
    shelfId: joi.string().hex().length(24),
    price: joi.string().max(15),
    acquired_method: joi.string().max(30).optional().allow(null, ""),
    acquired_date: joi.date().iso().max("now"),
    status: copyStatusSchema.optional(),
  }),
};

const shelfSchema = {
  create: joi.object({
    shelf_code: joi.string().trim().min(1).max(20).required().messages({
      "string.empty": "Shelf Code ထည့်ပေးပါ",
      "string.min": "Shelf Code အနည်းဆုံး ၁ လုံးရှိရပါမယ်",
      "any.required": "Shelf Code သည် မဖြစ်မနေ လိုအပ်ပါသည်။",
    }),
    description: joi.string().max(255).allow("", null).optional(),
  }),

  update: joi.object({
    shelf_code: joi.string().trim().min(1).max(20).optional(),
    description: joi.string().max(255).allow("", null).optional(),
    is_deleted: joi.boolean().optional(),
  }),
};

const userSchema = {
  add: joi.object({
    role: joi.string().valid("STUDENT", "STAFF").uppercase().required(),
    name: joi.string().required().min(3).max(20),
    email: joi.string().email(),
    nrc_number: joi.string().trim().max(20).allow("", null),
    address: joi.string().trim().max(300).allow("", null),
    phone: joi
      .string()
      .trim()
      .pattern(/^[0-9+\-\s]{6,20}$/)
      .allow("", null)
      .messages({
        "string.pattern.base": "Phone number format is invalid.",
      }),

    status: joi.string().valid(...STATUS_ENUM),
    department: joi.when("role", {
      is: "STAFF",
      then: OBJECT_ID.required(),
      otherwise: joi.forbidden(),
    }),

    designation: joi.when("role", {
      is: "STAFF",
      then: joi.string().min(3).max(50).required(),
      otherwise: joi.forbidden(),
    }),

    roll_number: joi.when("role", {
      is: "STUDENT",
      then: joi.string().min(2).max(30).required(),
      otherwise: joi.forbidden(),
    }),
    major: joi.when("role", {
      is: "STUDENT",
      then: OBJECT_ID.required(),
      otherwise: joi.forbidden(),
    }),

    semester: joi.when("role", {
      is: "STUDENT",
      then: OBJECT_ID.required(),
      otherwise: joi.forbidden(),
    }),

    degree_level: joi.when("role", {
      is: "STUDENT",
      then: joi.string().valid("BACHELOR", "MASTER"),
      otherwise: joi.forbidden(),
    }),
    nrc_number: joi.string().trim().max(20).allow("", null),
    address: joi.string().trim().max(300).allow("", null),
    father_name: joi.when("role", {
      is: "STUDENT",
      then: joi.string().trim().max(100).allow("", null),
      otherwise: joi.forbidden(),
    }),
    national_reg_no: joi.when("role", {
      is: "STAFF",
      then: joi.string().trim().max(50).allow("", null),
      otherwise: joi.forbidden(),
    }),
  }),
  edit: joi.object({
    role: joi.string().valid("STUDENT", "STAFF").uppercase().required(),
    name: joi.string().min(3).max(20),
    email: joi.string().email(),
    nrc_number: joi.string().trim().max(20).allow("", null),
    address: joi.string().trim().max(300).allow("", null),
    phone: joi
      .string()
      .trim()
      .pattern(/^[0-9+\-\s]{6,20}$/)
      .allow("", null)
      .messages({
        "string.pattern.base": "Phone number format is invalid.",
      }),
    status: joi.string().valid(...STATUS_ENUM),
    department: joi.when("role", {
      is: "STAFF",
      then: OBJECT_ID,
      otherwise: joi.forbidden(),
    }),

    designation: joi.when("role", {
      is: "STAFF",
      then: joi.string().min(3).max(50),
      otherwise: joi.forbidden(),
    }),

    roll_number: joi.when("role", {
      is: "STUDENT",
      then: joi.string().min(2).max(30),
      otherwise: joi.forbidden(),
    }),

    major: joi.when("role", {
      is: "STUDENT",
      then: joi.string().min(2).max(50),
      otherwise: joi.forbidden(),
    }),

    semester: joi.when("role", {
      is: "STUDENT",
      then: OBJECT_ID,
      otherwise: joi.forbidden(),
    }),

    degree_level: joi.when("role", {
      is: "STUDENT",
      then: joi.string().valid("BACHELOR", "MASTER"),
      otherwise: joi.forbidden(),
    }),
    nrc_number: joi.string().trim().max(20).allow("", null),
    address: joi.string().trim().max(300).allow("", null),
    father_name: joi.when("role", {
      is: "STUDENT",
      then: joi.string().trim().max(100).allow("", null),
      otherwise: joi.forbidden(),
    }),
    national_reg_no: joi.when("role", {
      is: "STAFF",
      then: joi.string().trim().max(50).allow("", null),
      otherwise: joi.forbidden(),
    }),
  }),
  authAdd: joi.object({
    username: joi
      .string()
      .pattern(/^@[a-zA-Z0-9._]+$/)
      .min(4)
      .max(21)
      .lowercase()
      .required()
      .messages({
        "string.pattern.base":
          "Username must start with '@' and contain only letters, numbers, '.' or '_'.",
      }),

    name: joi.string().required().min(3).max(20),
    email: joi.string().email(),
    phone: joi
      .string()
      .trim()
      .pattern(/^[0-9+\-\s]{6,20}$/)
      .allow("", null),
    password: joi.string().min(8).max(20).required(),
    role: joi.string().valid("ADMIN", "LIBRARIAN").uppercase().required(),
    status: joi.string().valid(...STATUS_ENUM),
  }),
  authUpdate: joi.object({
    name: joi.string().min(3).max(20),
    email: joi.string().email(),
    phone: joi
      .string()
      .trim()
      .pattern(/^[0-9+\-\s]{6,20}$/)
      .allow("", null),
    role: joi.string(),
    role: joi.string().valid("ADMIN", "LIBRARIAN").uppercase(),
    status: joi.string().valid(...STATUS_ENUM),
  }),
  resetPassword: joi.object({
    newPassword: joi.string().min(8).max(20).required(),
  }),
};

const userImportRowSchema = joi.object({
  role: joi.string().valid("STUDENT", "STAFF").required(),
  name: joi.string().min(2).max(100).required(),
  email: joi.string().email().allow("", null),
  phone: joi.string().trim().max(20).allow("", null),
  nrc_number: joi.string().trim().max(20).allow("", null),
  address: joi.string().trim().max(300).allow("", null),
  roll_number: joi.when("role", {
    is: "STUDENT",
    then: joi.string().min(1).required(),
    otherwise: joi.optional(),
  }),
  major: joi.when("role", {
    is: "STUDENT",
    then: joi.string().min(1).required(),
    otherwise: joi.optional(),
  }),
  semester: joi.when("role", {
    is: "STUDENT",
    then: joi.string().min(1).required(),
    otherwise: joi.optional(),
  }),
  father_name: joi.string().trim().max(100).allow("", null),
  department: joi.when("role", {
    is: "STAFF",
    then: joi.string().min(1).required(),
    otherwise: joi.optional(),
  }),
  designation: joi.when("role", {
    is: "STAFF",
    then: joi.string().min(1).required(),
    otherwise: joi.optional(),
  }),
  national_reg_no: joi.string().trim().max(50).allow("", null),
});

const departmentSchema = {
  create: joi.object({
    name: joi.string().min(2).max(100).required(),
    short_name: joi.string().min(1).max(15).required(),
    department_code: joi.string().trim().max(20).allow("", null),
  }),
  update: joi
    .object({
      name: joi.string().min(2).max(100),
      short_name: joi.string().min(1).max(15).required(),
      department_code: joi.string().trim().max(20).allow("", null),
    })
    .min(1),
};

const semesterSchema = {
  create: joi.object({
    name: joi.string().min(2).max(100).required(),
    short_name: joi.string().min(1).max(10).required(),
    order: joi.number().integer().min(1).required(),
    degree_level: joi
      .string()
      .valid("BACHELOR", "MASTER", "PHD")
      .default("BACHELOR"),
  }),
  update: joi
    .object({
      name: joi.string().min(2).max(100),
      short_name: joi.string().min(1).max(10),
      order: joi.number().integer().min(1),
      degree_level: joi.string().valid("BACHELOR", "MASTER", "PHD"),
    })
    .min(1),
};

const inOutLogSchema = {
  create: joi.object({
    identifier: joi.string().trim().min(1).required(),
    log_type: joi.string().valid("IN", "OUT").required(),
  }),
};

const budgetSchema = {
  create: joi.object({
    fiscal_year: joi.number().integer().min(2000).max(2100).required(),
    total_amount: joi.number().min(0).required(),
    notes: joi.string().trim().max(500).allow("", null),
  }),
  update: joi
    .object({
      total_amount: joi.number().min(0),
      notes: joi.string().trim().max(500).allow("", null),
    })
    .min(1),
};

const financeSchema = {
  purchaseCreate: joi.object({
    budget_id: OBJECT_ID.required(),
    book_id: OBJECT_ID.required(),
    quantity: joi.number().integer().min(1).required(),
    unit_price: joi.number().min(0).required(),
    vendor_name: joi.string().trim().min(1).max(200).required(),
    purchase_date: joi.date().max("now").required(),
    // ★ total_price NOT accepted — always server-computed
  }),
  purchaseUpdate: joi
    .object({
      book_id: OBJECT_ID,
      quantity: joi.number().integer().min(1),
      unit_price: joi.number().min(0),
      vendor_name: joi.string().trim().min(1).max(200),
      purchase_date: joi.date().max("now"),
    })
    .min(1),

  expenditureCreate: joi.object({
    budget_id: OBJECT_ID.required(),
    amount: joi.number().min(0).required(),
    description: joi.string().trim().max(500).allow("", null),
    expense_date: joi.date().max("now").required(),
    // ★ category NOT accepted from client — server hardcodes "OTHERS"
  }),
  expenditureUpdate: joi
    .object({
      amount: joi.number().min(0),
      description: joi.string().trim().max(500).allow("", null),
      expense_date: joi.date().max("now"),
    })
    .min(1),
};

const borrowRuleSchema = {
  create: joi.object({
    role: joi.string().valid("STAFF", "STUDENT", "GUEST").required(),
    semester: joi.when("role", {
      is: "STUDENT",
      then: OBJECT_ID,
      otherwise: joi.forbidden(),
    }),
    department: joi.when("role", {
      is: "STAFF",
      then: OBJECT_ID,
      otherwise: joi.forbidden(),
    }),
    max_books: joi.number().integer().min(1).required(),
    loan_period_days: joi.number().integer().min(1).required(),
    reserve_limit: joi.number().integer().min(0).required(),
    max_renewals: joi.number().integer().min(0).required(),
    hold_period_days: joi.number().integer().min(1).required(),
  }),
  update: joi
    .object({
      max_books: joi.number().integer().min(1),
      loan_period_days: joi.number().integer().min(1),
      reserve_limit: joi.number().integer().min(0),
      max_renewals: joi.number().integer().min(0),
      hold_period_days: joi.number().integer().min(1),
    })
    .min(1),
};

const fineRuleSchema = {
  create: joi.object({
    fine_type: joi.string().valid("OVERDUE", "LOST", "DAMAGED").required(),
    role: joi.string().valid("STAFF", "STUDENT", "GUEST"),
    semester: joi.when("role", {
      is: "STUDENT",
      then: OBJECT_ID,
      otherwise: joi.forbidden(),
    }),
    department: joi.when("role", {
      is: "STAFF",
      then: OBJECT_ID,
      otherwise: joi.forbidden(),
    }),

    rate_per_day: joi.when("fine_type", {
      is: "OVERDUE",
      then: joi.number().min(0).required(),
      otherwise: joi.forbidden(),
    }),
    flat_amount: joi.when("fine_type", {
      is: joi.valid("LOST", "DAMAGED"),
      then: joi.number().min(0).required(),
      otherwise: joi.forbidden(),
    }),
    grace_period_days: joi.when("fine_type", {
      is: "OVERDUE",
      then: joi.number().integer().min(0).default(0),
      otherwise: joi.forbidden(),
    }),
    max_fine_cap: joi.when("fine_type", {
      is: "OVERDUE",
      then: joi.number().min(0),
      otherwise: joi.forbidden(),
    }),
  }),
  update: joi
    .object({
      // ★ fine_type/role/semester/department NOT editable
      rate_per_day: joi.number().min(0),
      flat_amount: joi.number().min(0),
      grace_period_days: joi.number().integer().min(0),
      max_fine_cap: joi.number().min(0),
    })
    .min(1),
};

const circulationSchema = {
  checkout: joi.object({
    copy_id: OBJECT_ID.required(),
    user_id: OBJECT_ID.required(),
    due_date: joi.date().min("now").required(),
  }),
  processReturn: joi.object({
    condition: joi.string().valid("GOOD", "DAMAGED", "LOST").required(),
  }),
  rfidCheckout: joi.object({
    copy_identifier: joi.string().trim().min(1).required(),
    user_identifier: joi.string().trim().min(1).required(),
  }),
};

const fineTransactionSchema = {
  pay: joi.object({
    amount_collected: joi.number().min(0.01).required(),
    payment_method: joi.string().valid("CASH", "ONLINE").required(), // ★ WAIVER — system-only, not client-selectable
  }),
};

const reservationSchema = {
  create: joi.object({ book_id: OBJECT_ID.required() }),
  manualCreate: joi.object({
    book_id: OBJECT_ID.required(),
    user_id: OBJECT_ID.required(),
  }),
};

const notificationTemplateSchema = {
  upsert: joi.object({
    name: joi.string().trim().min(1).max(200).required(),
    title_template: joi.string().trim().min(1).max(300).required(),
    body_template: joi.string().trim().min(1).max(1000).required(),
    is_active: joi.boolean().default(true),
  }),
};

const authSchema = {
  rfidLogin: joi.object({ identifier: joi.string().trim().min(1).required() }),
  setInitialPassword: joi.object({
    newPassword: joi.string().min(6).max(50).required(),
  }),
  updateMe: joi
    .object({
      email: joi.string().email().allow("", null),
      phone: joi.string().trim().max(20).allow("", null),
    })
    .min(1),
};

const libraryRuleSchema = {
  create: joi.object({
    title: joi.string().trim().min(1).max(200).required(),
    description: joi.string().trim().min(1).max(1000).required(),
    category: joi
      .string()
      .valid("CONDUCT", "SAFETY", "PROPERTY_CARE", "TECHNOLOGY", "GENERAL")
      .default("GENERAL"),
    display_order: joi.number().integer().min(0).default(0),
    is_active: joi.boolean().default(true),
  }),
  update: joi
    .object({
      title: joi.string().trim().min(1).max(200),
      description: joi.string().trim().min(1).max(1000),
      category: joi
        .string()
        .valid("CONDUCT", "SAFETY", "PROPERTY_CARE", "TECHNOLOGY", "GENERAL"),
      display_order: joi.number().integer().min(0),
      is_active: joi.boolean(),
    })
    .min(1),
};

const rfidSchema = {
  writeTag: joi.object({
    type: joi.string().valid("user", "book").required(),
    targetId: joi.string().trim().min(1).max(64).required(),
  }),
  cancelBook: joi.object({
    copy_id: joi.string().required(),
  }),
};

const systemSettingSchema = {
  update: joi
    .object({
      university_name: joi.string().trim().min(1).max(200),
      academic_year: joi
        .string()
        .trim()
        .pattern(/^\d{4}-\d{4}$/)
        .messages({
          "string.pattern.base": "Academic year must be in YYYY-YYYY format.",
        }),
      active_template_id: joi.number().integer().min(1).max(5),
    })
    .min(1),
};

const bulkCardSchema = {
  fetch: joi.object({
    user_ids: joi
      .array()
      .items(joi.string().hex().length(24))
      .min(1)
      .max(200)
      .required(),
  }),
};

const majorSchema = {
  create: joi.object({
    name: joi.string().min(2).max(100).required(),
    short_name: joi.string().min(1).max(15).required(),
    description: joi.string().trim().max(300).allow("", null),
  }),
  update: joi
    .object({
      name: joi.string().min(2).max(100),
      short_name: joi.string().min(1).max(15),
      description: joi.string().trim().max(300).allow("", null),
    })
    .min(1),
};

const institutionSchema = {
  create: joi.object({
    code: joi.string().trim().min(2).max(15).required(),
    full_name: joi.string().trim().min(2).max(200).required(),
    api_url: joi.string().uri().required(),
    shared_secret: joi.string().min(16).required(),
    is_active: joi.boolean().default(true),
  }),
  update: joi
    .object({
      full_name: joi.string().trim().min(2).max(200),
      api_url: joi.string().uri(),
      shared_secret: joi.string().min(16),
      is_active: joi.boolean(),
    })
    .min(1),
};

const externalApiSchema = {
  verifyUser: joi.object({ username: joi.string().required() }),
  notifyCheckout: joi.object({
    username: joi.string().required(),
    book_title: joi.string().required(),
    due_date: joi.date().required(),
  }),
};

const guestCheckoutSchema = {
  verify: joi.object({
    institution_id: OBJECT_ID.required(),
    identifier: joi.string().required(),
  }),
  create: joi.object({
    institution_id: OBJECT_ID.required(),
    identifier: joi.string().required(),
    copy_id: OBJECT_ID.required(),
  }),
};

module.exports = {
  bookSchema,
  bookCopySchema,
  shelfSchema,
  userSchema,
  departmentSchema,
  semesterSchema,
  inOutLogSchema,
  budgetSchema,
  financeSchema,
  borrowRuleSchema,
  fineRuleSchema,
  circulationSchema,
  fineTransactionSchema,
  reservationSchema,
  notificationTemplateSchema,
  authSchema,
  libraryRuleSchema,
  rfidSchema,
  systemSettingSchema,
  bulkCardSchema,
  majorSchema,
  userImportRowSchema,
  institutionSchema,
  externalApiSchema,
  guestCheckoutSchema,
};
