const cookieParser = require("cookie-parser");
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const mongoose = require("mongoose");
const http = require("http");

const catalogRoutes = require("./routes/catalog_route");
const shelfRoutes = require("./routes/shelf_route");
const userRoute = require("./routes/user_route");
const departmentRoute = require("./routes/department_route");
const semesterRoute = require("./routes/semester_route");
const userInOutLogRoute = require("./routes/userInOutLog_router");
const deviceRoute = require("./routes/device_route");
const scanLogRoute = require("./routes/scanLog_route");
const authRoute = require("./routes/auth_route");
const budgetRoute = require("./routes/budget_route");
const financeRoute = require("./routes/finance_route");
const borrowRuleRoute = require("./routes/borrowRule_route");
const fineRuleRoute = require("./routes/fineRule_route");
const circulationRoute = require("./routes/circulation_route");

// Jobs & Socket Imports
const { startReservationExpiryJob } = require("./jobs/reservationExpiry_job");
const { startDueSoonReminderJob } = require("./jobs/dueSoonReminder_job");
const { startOverdueReminderJob } = require("./jobs/overdueReminder_job");
const { initSocket } = require("./sockets/socketServer");
const mqttService = require("./services/mqtt_service");

const { formatDuplicateKeyMessage } = require("./utils/duplicateKeyError");

const app = express();
app.set("trust proxy", true);
app.use(cookieParser());

app.use(
  cors({
    origin: ["https://ucsmgy.work", "http://ucsmgy.portal"],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "x-kiosk-key"],
  }),
);
app.use(express.json());
app.use("/api/auth/", authRoute);
app.use("/api/catalog", catalogRoutes);
app.use("/api/shelves", shelfRoutes);
app.use("/api/users", userRoute);
app.use("/api/dept", departmentRoute);
app.use("/api/sem", semesterRoute);
app.use("/api/inoutlogs", userInOutLogRoute);
app.use("/api/device/", deviceRoute);
app.use("/api/scanlogs/", scanLogRoute);

// finance
app.use("/api/budgets", budgetRoute);
app.use("/api/finance/", financeRoute);

// rule
app.use("/api/borrow-rules", borrowRuleRoute);
app.use("/api/fine-rules", fineRuleRoute);

// circulation +fine +file transaction
app.use("/api/circulation", circulationRoute);
app.use("/api/fines", require("./routes/fine_route"));
app.use("/api/fine-transactions", require("./routes/fineTransaction_route"));

app.use("/api/reservations", require("./routes/reservation_route"));
app.use("/api/notifications", require("./routes/notification_route"));
app.use(
  "/api/notification-templates",
  require("./routes/notificationTemplate_route"),
);

app.use("/api/audit-logs", require("./routes/auditLog_route"));
app.use("/api/dashboard", require("./routes/dashboard_route"));
app.use("/api/admin/dashboard", require("./routes/adminDashboard_route"));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/api/catalog/books", require("./routes/bookCover_route"));
app.use("/api/library-rules", require("./routes/libraryRule_route"));
app.use("/api/rfid", require("./routes/rfid_routes"));
app.use("/api/settings", require("./routes/systemSetting_route"));
app.use("/api/majors", require("./routes/major_route"));
app.use("/api/reports", require("./routes/reports_route"));

app.use("/api/institutions", require("./routes/institution_route"));
app.use("/api/external", require("./routes/external_route"));
app.use("/api/federated-search", require("./routes/federatedSearch_route"));

app.use((err, req, res, next) => {
  if (err.code === 11000) {
    console.error(err);
    return res.status(409).json({
      success: false,
      message: formatDuplicateKeyMessage(err),
    });
  }

  const status = err.status || 500;

  console.error(err);
  res.status(status).json({
    success: false,
    message: err.message || "Something went wrong",
  });
});

const server = http.createServer(app);
initSocket(server);
const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("Connected to MongoDB");

    startReservationExpiryJob();
    startDueSoonReminderJob();
    startOverdueReminderJob();

    mqttService.init();

    server.listen(PORT, () => {
      console.log(`Server + Socket.io running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err);
  });
module.exports = app;
