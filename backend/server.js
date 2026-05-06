require("dotenv").config();

// ── Validate required env vars at startup ─────────────────────
const REQUIRED_ENV = [
  "MONGODB_URI",
  "JWT_SECRET",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "FIREBASE_PROJECT_ID",
];
const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missingEnv.length) {
  console.error("❌ Missing required environment variables:", missingEnv.join(", "));
  process.exit(1);
}

const express    = require("express");
const mongoose   = require("mongoose");
const cors       = require("cors");
const helmet     = require("helmet");
const compression = require("compression");
const rateLimit  = require("express-rate-limit");
const bcrypt     = require("bcrypt");
const jwt        = require("jsonwebtoken");
const multer     = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const http       = require("http");
const WebSocket  = require("ws");
const admin      = require("firebase-admin");
const validator  = require("validator");

// ══════════════════════════════════════════════════════════════
//  CLOUDINARY CONFIG
// ══════════════════════════════════════════════════════════════

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function extractPublicId(url) {
  if (!url || !url.includes("cloudinary.com")) return null;
  try {
    const parts = url.split("/upload/");
    if (parts.length < 2) return null;
    const after = parts[1].replace(/^v\d+\//, "");
    return after.replace(/\.[^/.]+$/, "");
  } catch {
    return null;
  }
}

async function deleteCloudinaryImage(url) {
  const publicId = extractPublicId(url);
  if (!publicId) return;
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    console.log(`🗑 Cloudinary deleted: ${publicId} →`, result.result);
  } catch (err) {
    console.error("❌ Cloudinary delete error:", err.message);
  }
}

// ══════════════════════════════════════════════════════════════
//  MULTER / CLOUDINARY STORAGE
// ══════════════════════════════════════════════════════════════

const avatarStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:          "user-avatars",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation:  [{ width: 300, height: 300, crop: "fill" }],
  },
});
const uploadAvatar = multer({
  storage: avatarStorage,
  limits:  { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
    }
    cb(null, true);
  },
});

const tripStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:          "trip-images",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation:  [{ width: 1200, height: 800, crop: "fill" }],
  },
});
const uploadTrip = multer({
  storage: tripStorage,
  limits:  { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
    }
    cb(null, true);
  },
});

// ══════════════════════════════════════════════════════════════
//  EXPRESS APP
// ══════════════════════════════════════════════════════════════

const app = express();

// ── Security headers ──────────────────────────────────────────
app.use(helmet());

// ── Compression ───────────────────────────────────────────────
app.use(compression());

// ── CORS ──────────────────────────────────────────────────────
const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(",").map((o) => o.trim())
  : [];

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow requests with no origin (mobile apps, curl, Postman)
      if (!origin) return cb(null, true);
      if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return cb(null, true);
      }
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  })
);

// ── Body parsing (with size cap) ──────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// ── Global rate limiter ───────────────────────────────────────
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200,
    standardHeaders: true,
    legacyHeaders:   false,
    message: { error: "Too many requests, please try again later." },
  })
);

// ── Strict rate limiter for auth endpoints ────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: "Too many login attempts, please try again later." },
});

// ══════════════════════════════════════════════════════════════
//  FIREBASE ADMIN
// ══════════════════════════════════════════════════════════════

admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });

// ══════════════════════════════════════════════════════════════
//  MONGODB
// ══════════════════════════════════════════════════════════════

mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
});
mongoose.connection.on("connected", () => console.log("✅ MongoDB Connected"));
mongoose.connection.on("error",     (err) => console.error("❌ MongoDB Error:", err));
mongoose.connection.on("disconnected", () => console.warn("⚠️  MongoDB Disconnected"));

// ══════════════════════════════════════════════════════════════
//  SCHEMAS
// ══════════════════════════════════════════════════════════════

const UserSchema = new mongoose.Schema({
  name:       { type: String, required: true, trim: true, maxlength: 100 },
  email:      { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:   { type: String, required: true, minlength: 6 },
  university: { type: String, required: true, trim: true, maxlength: 200 },
  avatar:     { type: String, default: "" },
});
const User = mongoose.model("User", UserSchema);

const TripSchema = new mongoose.Schema(
  {
    title:       { type: String, required: true, trim: true, maxlength: 200 },
    destination: { type: String, required: true, trim: true, maxlength: 300 },
    organizer: {
      name:       { type: String, required: true },
      university: { type: String, required: true },
      email:      { type: String, required: true, lowercase: true },
      avatar:     { type: String, default: "" },
    },
    participants: [
      {
        name:       String,
        email:      { type: String, lowercase: true },
        university: String,
        avatar:     { type: String, default: "" },
      },
    ],
    maxParticipants: { type: Number, required: true, min: 1, max: 500 },
    price:           { type: Number, required: true, min: 0 },
    startDate:       { type: String, required: true },
    endDate:         { type: String, required: true },
    universities:    { type: [String], default: [] },
    tripjoined:      { type: Number, default: 0 },
    triporganised:   { type: Number, default: 0 },
    imageUrl:        { type: String, default: "" },
    description:     { type: String, required: true, maxlength: 2000 },
    latitude:        { type: Number },
    longitude:       { type: Number },
  },
  { timestamps: true }
);
// Index for expired-trip cleanup queries
TripSchema.index({ endDate: 1 });
TripSchema.index({ "organizer.email": 1 });
const Trip = mongoose.model("Trip", TripSchema);

const MessageSchema = new mongoose.Schema(
  {
    tripId: { type: String, required: true, index: true },
    sender: { type: String, maxlength: 100 },
    email:  { type: String, lowercase: true },
    avatar: { type: String },
    text:   { type: String, maxlength: 2000 },
    time:   { type: String },
  },
  { timestamps: true }
);
const Message = mongoose.model("Message", MessageSchema);

const NotificationSchema = new mongoose.Schema(
  {
    recipientEmail: { type: String, required: true, lowercase: true, index: true },
    type:           { type: String, required: true },
    message:        { type: String, required: true, maxlength: 500 },
    tripId:         { type: String },
    tripTitle:      { type: String },
    read:           { type: Boolean, default: false },
  },
  { timestamps: true }
);
const Notification = mongoose.model("Notification", NotificationSchema);

const WaitlistSchema = new mongoose.Schema({
  tripId:     { type: String, required: true },
  tripTitle:  { type: String },
  email:      { type: String, required: true, lowercase: true },
  name:       { type: String },
  university: { type: String },
  avatar:     { type: String, default: "" },
  joinedAt:   { type: Date, default: Date.now },
});
WaitlistSchema.index({ tripId: 1, email: 1 }, { unique: true });
WaitlistSchema.index({ email: 1 });
const Waitlist = mongoose.model("Waitlist", WaitlistSchema);

// ══════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "No token provided" });
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired, please log in again" });
    }
    return res.status(401).json({ error: "Invalid token" });
  }
}

async function createNotification(recipientEmail, type, message, tripId, tripTitle) {
  try {
    await Notification.create({ recipientEmail, type, message, tripId, tripTitle });
  } catch { /* intentionally silent */ }
}

// Broadcast to all connected WebSocket clients
function broadcast(wssInstance, data) {
  const msg = JSON.stringify(data);
  wssInstance.clients.forEach((c) => {
    if (c.readyState === WebSocket.OPEN) c.send(msg);
  });
}

// Full trip cleanup: Cloudinary image + all related DB records
async function cleanupTrip(trip) {
  const tripId = trip._id.toString();
  if (trip.imageUrl) await deleteCloudinaryImage(trip.imageUrl);
  await Promise.all([
    Trip.findByIdAndDelete(tripId),
    Message.deleteMany({ tripId }),
    Waitlist.deleteMany({ tripId }),
    Notification.deleteMany({ tripId }),
  ]);
  console.log(`🧹 Cleaned up trip "${trip.title}" (${tripId})`);
}

// Delete trips ended more than 30 days ago
async function deleteExpiredTrips() {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = cutoff.toISOString().split("T")[0];
    const expired = await Trip.find({ endDate: { $lt: cutoffStr } });
    if (!expired.length) return;
    for (const trip of expired) await cleanupTrip(trip);
    console.log(`🗑 Deleted ${expired.length} trips ended before ${cutoffStr}`);
  } catch (err) {
    console.error("❌ Error deleting expired trips:", err);
  }
}

// Multer error handler middleware
function handleMulterError(err, req, res, next) {
  if (err instanceof multer.MulterError || err.message?.includes("Only image")) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
}

// ══════════════════════════════════════════════════════════════
//  HEALTH CHECK
// ══════════════════════════════════════════════════════════════

app.get("/", (req, res) => res.send("🚀 Campus Rides backend running!"));

app.get("/health", (req, res) => {
  const dbState = mongoose.connection.readyState;
  // 0=disconnected,1=connected,2=connecting,3=disconnecting
  const dbStatus = ["disconnected", "connected", "connecting", "disconnecting"][dbState] || "unknown";
  const ok = dbState === 1;
  res.status(ok ? 200 : 503).json({
    status:    ok ? "ok" : "degraded",
    db:        dbStatus,
    uptime:    process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ══════════════════════════════════════════════════════════════
//  AUTH ROUTES
// ══════════════════════════════════════════════════════════════

app.post("/add-user", authLimiter, async (req, res) => {
  try {
    const { name, email, password, university } = req.body;

    // Validate
    if (!name?.trim() || !email?.trim() || !password || !university?.trim()) {
      return res.status(400).json({ error: "All fields are required" });
    }
    if (!validator.isEmail(email)) {
      return res.status(400).json({ error: "Invalid email address" });
    }
    if (password.length < 6 || password.length > 128) {
      return res.status(400).json({ error: "Password must be 6–128 characters" });
    }

    if (await User.findOne({ email: email.toLowerCase() })) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const hashed = await bcrypt.hash(password, 12);
    const user   = new User({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashed,
      university: university.trim(),
    });
    await user.save();

    res.status(201).json({
      message: "✅ User registered!",
      user: { name: user.name, email: user.email, university: user.university },
    });
  } catch (err) {
    console.error("❌ /add-user:", err.message);
    res.status(500).json({ error: "Registration failed" });
  }
});

app.post("/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email?.trim() || !password) {
      return res.status(400).json({ error: "All fields required" });
    }
    if (!validator.isEmail(email)) {
      return res.status(400).json({ error: "Invalid email address" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    // Timing-safe: always compare even if user not found
    const fakeHash = "$2b$12$invalidhashfortimingatk";
    const match = user
      ? await bcrypt.compare(password, user.password)
      : await bcrypt.compare(password, fakeHash).catch(() => false);

    if (!user || !match) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "10h" }
    );
    res.json({
      message: "✅ Login successful!",
      token,
      user: {
        name:       user.name,
        email:      user.email,
        university: user.university,
        avatar:     user.avatar || "",
      },
    });
  } catch (err) {
    console.error("❌ /login:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/auth/google", authLimiter, async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: "No token provided" });

    const decoded = await admin.auth().verifyIdToken(idToken);
    const email   = decoded.email?.toLowerCase();
    const name    = decoded.name || decoded.email?.split("@")[0] || "User";
    const picture = decoded.picture || "";
    const uid     = decoded.uid;

    if (!email) return res.status(400).json({ error: "Could not get email from Google token" });

    let user = await User.findOne({ email });
    if (!user) {
      user = new User({
        name,
        email,
        password:   await bcrypt.hash(uid + email, 12),
        university: "Not set",
        avatar:     picture,
      });
      await user.save();
    } else if (picture && user.avatar !== picture && !user.avatar.includes("cloudinary.com")) {
      user.avatar = picture;
      await user.save();
    }

    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "10h" }
    );
    res.json({
      message: "✅ Google login successful!",
      token,
      user: {
        name:       user.name,
        email:      user.email,
        university: user.university,
        avatar:     user.avatar || "",
      },
    });
  } catch (err) {
    console.error("❌ /auth/google:", err.message);
    res.status(401).json({ error: "Google sign-in failed" });
  }
});

// ══════════════════════════════════════════════════════════════
//  USER ROUTES
// ══════════════════════════════════════════════════════════════

app.put(
  "/update-avatar/:email",
  verifyToken,
  (req, res, next) => uploadAvatar.single("avatar")(req, res, next),
  handleMulterError,
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });

      const imageUrl  = req.file.path;
      const emailParam = req.params.email.toLowerCase();

      // Only allow users to update their own avatar
      if (req.user.email !== emailParam) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const existing = await User.findOne({ email: emailParam });
      if (!existing) return res.status(404).json({ error: "User not found" });

      // Delete old Cloudinary avatar
      if (existing.avatar) await deleteCloudinaryImage(existing.avatar);

      existing.avatar = imageUrl;
      await existing.save();

      // Sync avatar across trips (organizer + participant)
      await Promise.all([
        Trip.updateMany({ "organizer.email": emailParam }, { $set: { "organizer.avatar": imageUrl } }),
        Trip.updateMany(
          { "participants.email": emailParam },
          { $set: { "participants.$[p].avatar": imageUrl } },
          { arrayFilters: [{ "p.email": emailParam }] }
        ),
      ]);

      res.json({ message: "✅ Avatar updated!", user: existing });
    } catch (err) {
      console.error("❌ Avatar upload error:", err);
      res.status(500).json({ error: "Failed to update avatar" });
    }
  }
);

app.get("/users/:email", verifyToken, async (req, res) => {
  try {
    // Users can only fetch their own profile (or extend this for admin)
    if (req.user.email !== req.params.email.toLowerCase()) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const user = await User.findOne({ email: req.params.email.toLowerCase() }, "-password");
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/update-avatar-url/:email", verifyToken, async (req, res) => {
  try {
    const emailParam = req.params.email.toLowerCase();
    if (req.user.email !== emailParam) return res.status(403).json({ error: "Forbidden" });

    const { avatar } = req.body;
    if (!avatar || typeof avatar !== "string") {
      return res.status(400).json({ error: "avatar URL is required" });
    }

    const user = await User.findOneAndUpdate(
      { email: emailParam },
      { avatar },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ message: "Avatar updated!", user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/update-profile/:email", verifyToken, async (req, res) => {
  try {
    const emailParam = req.params.email.toLowerCase();
    if (req.user.email !== emailParam) return res.status(403).json({ error: "Forbidden" });

    const { name, university } = req.body;
    if (!name?.trim() || !university?.trim()) {
      return res.status(400).json({ error: "Name and university are required" });
    }

    const trimmedName = name.trim();
    const trimmedUni  = university.trim();

    const user = await User.findOneAndUpdate(
      { email: emailParam },
      { name: trimmedName, university: trimmedUni },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: "User not found" });

    // Sync name & university across trips
    await Promise.all([
      Trip.updateMany(
        { "organizer.email": emailParam },
        { $set: { "organizer.name": trimmedName, "organizer.university": trimmedUni } }
      ),
      Trip.updateMany(
        { "participants.email": emailParam },
        {
          $set: {
            "participants.$[p].name":       trimmedName,
            "participants.$[p].university": trimmedUni,
          },
        },
        { arrayFilters: [{ "p.email": emailParam }] }
      ),
    ]);

    res.json({ message: "Profile updated!", user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  TRIP ROUTES
// ══════════════════════════════════════════════════════════════

app.post(
  "/upload-trip-image",
  verifyToken,
  (req, res, next) => uploadTrip.single("image")(req, res, next),
  handleMulterError,
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      res.json({ imageUrl: req.file.path });
    } catch (err) {
      res.status(500).json({ error: "Image upload failed" });
    }
  }
);

app.post("/create-trip", verifyToken, async (req, res) => {
  try {
    const {
      title, destination, organizer, maxParticipants,
      price, startDate, endDate, description,
    } = req.body;

    if (!title || !destination || !organizer || !maxParticipants || price == null || !startDate || !endDate || !description) {
      return res.status(400).json({ error: "Missing required trip fields" });
    }

    // Prevent impersonation: organizer email must match JWT
    if (organizer?.email?.toLowerCase() !== req.user.email) {
      return res.status(403).json({ error: "Cannot create trip on behalf of another user" });
    }

    if (new Date(startDate) > new Date(endDate)) {
      return res.status(400).json({ error: "startDate must be before endDate" });
    }

    const trip = new Trip({ ...req.body, triporganised: 1 });
    await trip.save();
    res.status(201).json({ message: "Trip created!", trip });
  } catch (err) {
    console.error("❌ /create-trip:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/get-trips", async (req, res) => {
  try {
    const trips = await Trip.find().sort({ createdAt: -1 }).lean();

    // Batch-fetch organizer avatars
    const organizerEmails = [...new Set(trips.map((t) => t.organizer?.email).filter(Boolean))];
    const users = await User.find({ email: { $in: organizerEmails } }, "email avatar").lean();
    const avatarMap = Object.fromEntries(users.map((u) => [u.email, u.avatar]));

    const updatedTrips = trips.map((trip) => {
      if (trip.organizer?.email && avatarMap[trip.organizer.email]) {
        trip.organizer.avatar = avatarMap[trip.organizer.email];
      }
      return trip;
    });

    res.json({ trips: updatedTrips });
  } catch (err) {
    console.error("❌ /get-trips:", err.message);
    res.status(500).json({ error: "Failed to fetch trips" });
  }
});

app.get("/trip/:id", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "Invalid trip ID" });
    }
    const trip = await Trip.findById(req.params.id);
    if (!trip) return res.status(404).json({ error: "Trip not found" });
    res.json(trip);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/trip/:id", verifyToken, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "Invalid trip ID" });
    }

    const trip = await Trip.findById(req.params.id);
    if (!trip) return res.status(404).json({ error: "Trip not found" });

    // Only the organizer can edit
    if (trip.organizer.email !== req.user.email) {
      return res.status(403).json({ error: "Only the organizer can edit this trip" });
    }

    // Prevent overwriting protected fields via body
    const { participants, tripjoined, organizer, ...safeUpdate } = req.body;

    const updated = await Trip.findByIdAndUpdate(
      req.params.id,
      { $set: safeUpdate },
      { new: true, runValidators: true }
    );
    res.json({ message: "Trip updated", trip: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/trip/:id", verifyToken, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "Invalid trip ID" });
    }

    const trip = await Trip.findById(req.params.id);
    if (!trip) return res.status(404).json({ error: "Trip not found" });

    // Only the organizer can delete
    if (trip.organizer.email !== req.user.email) {
      return res.status(403).json({ error: "Only the organizer can delete this trip" });
    }

    await cleanupTrip(trip);
    res.json({ message: "Trip cancelled and cleaned up" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/join-trip", verifyToken, async (req, res) => {
  const { tripId, user } = req.body;
  try {
    if (!tripId || !user?.email) {
      return res.status(400).json({ error: "tripId and user are required" });
    }
    // Prevent joining as someone else
    if (user.email.toLowerCase() !== req.user.email) {
      return res.status(403).json({ error: "Cannot join as another user" });
    }
    if (!mongoose.Types.ObjectId.isValid(tripId)) {
      return res.status(400).json({ error: "Invalid trip ID" });
    }

    const trip = await Trip.findById(tripId);
    if (!trip) return res.status(404).json({ error: "Trip not found" });

    if (trip.participants.some((p) => p.email === user.email.toLowerCase())) {
      return res.json({ message: "Already joined", trip });
    }

    if (trip.participants.length >= trip.maxParticipants) {
      return res.status(400).json({ error: "Trip is full" });
    }

    trip.participants.push({ ...user, email: user.email.toLowerCase() });
    trip.tripjoined = trip.participants.length;
    if (!trip.universities.includes(user.university)) trip.universities.push(user.university);
    await trip.save();

    // Remove from waitlist if they were on it
    await Waitlist.findOneAndDelete({ tripId, email: user.email.toLowerCase() });

    await createNotification(
      trip.organizer.email,
      "joined",
      `${user.name} joined your trip "${trip.title}"`,
      trip._id.toString(),
      trip.title
    );

    broadcast(wss, {
      type:         "PARTICIPANT_UPDATE",
      tripId,
      participants: trip.participants,
      userName:     user.name,
    });

    res.json({ message: "Joined!", trip });
  } catch (err) {
    console.error("❌ /join-trip:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/exit-trip", verifyToken, async (req, res) => {
  const { tripId, email } = req.body;
  try {
    if (!tripId || !email) return res.status(400).json({ error: "tripId and email required" });

    // Prevent exiting on behalf of someone else
    if (email.toLowerCase() !== req.user.email) {
      return res.status(403).json({ error: "Cannot exit on behalf of another user" });
    }

    const trip = await Trip.findById(tripId);
    if (!trip) return res.status(404).json({ error: "Trip not found" });

    const normalizedEmail = email.toLowerCase();
    const leaving  = trip.participants.find((p) => p.email === normalizedEmail);
    const userName = leaving?.name || "Someone";

    trip.participants = trip.participants.filter((p) => p.email !== normalizedEmail);
    trip.tripjoined   = trip.participants.length;
    await trip.save();

    await createNotification(
      trip.organizer.email,
      "left",
      `${userName} left your trip "${trip.title}"`,
      trip._id.toString(),
      trip.title
    );

    // Notify the next person on the waitlist
    const nextInLine = await Waitlist.findOne({ tripId }).sort({ joinedAt: 1 });
    if (nextInLine) {
      await createNotification(
        nextInLine.email,
        "waitlist_spot",
        `A seat just opened in "${trip.title}"! Join before it fills up.`,
        trip._id.toString(),
        trip.title
      );
      broadcast(wss, {
        type:        "SEAT_AVAILABLE",
        tripId,
        tripTitle:   trip.title,
        notifyEmail: nextInLine.email,
        message:     `A seat just opened in "${trip.title}"!`,
      });
    }

    broadcast(wss, {
      type:         "USER_EXIT",
      tripId,
      email:        normalizedEmail,
      participants: trip.participants,
      userName,
    });

    res.json({ message: "Exited trip", trip });
  } catch (err) {
    console.error("❌ /exit-trip:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/trip/:tripId/kick", verifyToken, async (req, res) => {
  try {
    const { tripId }      = req.params;
    const { email }       = req.body;

    if (!email) return res.status(400).json({ error: "email is required" });
    if (!mongoose.Types.ObjectId.isValid(tripId)) {
      return res.status(400).json({ error: "Invalid trip ID" });
    }

    const trip = await Trip.findById(tripId);
    if (!trip) return res.status(404).json({ error: "Trip not found" });

    if (trip.organizer.email !== req.user.email) {
      return res.status(403).json({ error: "Only the host can remove participants" });
    }

    const normalizedEmail = email.toLowerCase();
    const kicked = trip.participants.find((p) => p.email === normalizedEmail);
    if (!kicked) return res.status(404).json({ error: "Participant not found" });

    trip.participants = trip.participants.filter((p) => p.email !== normalizedEmail);
    trip.tripjoined   = trip.participants.length;
    await trip.save();

    await createNotification(
      normalizedEmail,
      "left",
      `You were removed from "${trip.title}" by the host.`,
      trip._id.toString(),
      trip.title
    );

    const nextInLine = await Waitlist.findOne({ tripId }).sort({ joinedAt: 1 });
    if (nextInLine) {
      await createNotification(
        nextInLine.email,
        "waitlist_spot",
        `A seat just opened in "${trip.title}"! Join before it fills up.`,
        trip._id.toString(),
        trip.title
      );
      broadcast(wss, {
        type:        "SEAT_AVAILABLE",
        tripId,
        tripTitle:   trip.title,
        notifyEmail: nextInLine.email,
        message:     `A seat just opened in "${trip.title}"!`,
      });
    }

    broadcast(wss, {
      type:         "USER_EXIT",
      tripId,
      email:        normalizedEmail,
      kickedEmail:  normalizedEmail,
      participants: trip.participants,
      userName:     kicked.name,
    });

    res.json({ success: true, trip });
  } catch (err) {
    console.error("❌ /kick:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  MESSAGES
// ══════════════════════════════════════════════════════════════

app.get("/messages/:tripId", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.tripId)) {
      return res.status(400).json({ error: "Invalid trip ID" });
    }
    const messages = await Message.find({ tripId: req.params.tripId })
      .sort({ createdAt: 1 })
      .limit(200) // cap to avoid huge payloads
      .lean();
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  NOTIFICATIONS
// ══════════════════════════════════════════════════════════════

app.get("/notifications/:email", verifyToken, async (req, res) => {
  try {
    const emailParam = req.params.email.toLowerCase();
    if (req.user.email !== emailParam) return res.status(403).json({ error: "Forbidden" });

    const notifs = await Notification.find({ recipientEmail: emailParam })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    res.json({
      notifications: notifs,
      unreadCount:   notifs.filter((n) => !n.read).length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/notifications/:email/read-all", verifyToken, async (req, res) => {
  try {
    const emailParam = req.params.email.toLowerCase();
    if (req.user.email !== emailParam) return res.status(403).json({ error: "Forbidden" });

    await Notification.updateMany({ recipientEmail: emailParam, read: false }, { read: true });
    res.json({ message: "All marked as read" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/notifications/read/:id", verifyToken, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "Invalid notification ID" });
    }
    const notif = await Notification.findById(req.params.id);
    if (!notif) return res.status(404).json({ error: "Notification not found" });
    if (notif.recipientEmail !== req.user.email) {
      return res.status(403).json({ error: "Forbidden" });
    }
    notif.read = true;
    await notif.save();
    res.json({ message: "Marked as read" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/notifications/:email", verifyToken, async (req, res) => {
  try {
    const emailParam = req.params.email.toLowerCase();
    if (req.user.email !== emailParam) return res.status(403).json({ error: "Forbidden" });

    await Notification.deleteMany({ recipientEmail: emailParam });
    res.json({ message: "Cleared" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  WAITLIST
// ══════════════════════════════════════════════════════════════

app.get("/waitlist/check/:tripId/:email", async (req, res) => {
  try {
    const { tripId, email } = req.params;
    const all = await Waitlist.find({ tripId }).sort({ joinedAt: 1 }).lean();
    const idx = all.findIndex((w) => w.email === email.toLowerCase());
    res.json({ onWaitlist: idx !== -1, position: idx + 1, total: all.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/waitlist/user/:email", verifyToken, async (req, res) => {
  try {
    const emailParam = req.params.email.toLowerCase();
    if (req.user.email !== emailParam) return res.status(403).json({ error: "Forbidden" });

    const userEntries = await Waitlist.find({ email: emailParam }).sort({ joinedAt: 1 }).lean();
    if (!userEntries.length) return res.json({ entries: [] });

    const entries = await Promise.all(
      userEntries.map(async (entry) => {
        const allInTrip = await Waitlist.find({ tripId: entry.tripId }).sort({ joinedAt: 1 }).lean();
        const position  = allInTrip.findIndex((w) => w.email === emailParam) + 1;
        return {
          tripId:    entry.tripId,
          tripTitle: entry.tripTitle,
          position,
          total:     allInTrip.length,
          joinedAt:  entry.joinedAt,
        };
      })
    );
    res.json({ entries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/waitlist/join", verifyToken, async (req, res) => {
  try {
    const { tripId, user } = req.body;
    if (!tripId || !user?.email) return res.status(400).json({ error: "tripId and user required" });

    if (user.email.toLowerCase() !== req.user.email) {
      return res.status(403).json({ error: "Cannot join waitlist as another user" });
    }

    const trip = await Trip.findById(tripId);
    if (!trip) return res.status(404).json({ error: "Trip not found" });

    const normalizedEmail = user.email.toLowerCase();

    if (trip.participants.some((p) => p.email === normalizedEmail)) {
      return res.status(400).json({ error: "You are already a participant" });
    }
    if (trip.participants.length < trip.maxParticipants) {
      return res.status(400).json({ error: "Trip is not full — join directly" });
    }

    const existing = await Waitlist.findOne({ tripId, email: normalizedEmail });
    if (existing) {
      const all = await Waitlist.find({ tripId }).sort({ joinedAt: 1 }).lean();
      const idx = all.findIndex((w) => w.email === normalizedEmail);
      return res.json({ message: "Already on waitlist", position: idx + 1, total: all.length });
    }

    await Waitlist.create({
      tripId,
      tripTitle:  trip.title,
      email:      normalizedEmail,
      name:       user.name,
      university: user.university,
      avatar:     user.avatar || "",
    });

    const all      = await Waitlist.find({ tripId }).sort({ joinedAt: 1 }).lean();
    const position = all.findIndex((w) => w.email === normalizedEmail) + 1;

    res.status(201).json({ message: "Added to waitlist!", position, total: all.length });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: "Already on waitlist" });
    console.error("❌ /waitlist/join:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/waitlist/leave", verifyToken, async (req, res) => {
  try {
    const { tripId, email } = req.body;
    if (!tripId || !email) return res.status(400).json({ error: "tripId and email required" });

    if (email.toLowerCase() !== req.user.email) {
      return res.status(403).json({ error: "Cannot remove another user from waitlist" });
    }

    await Waitlist.findOneAndDelete({ tripId, email: email.toLowerCase() });
    const remaining = await Waitlist.countDocuments({ tripId });
    res.json({ message: "Removed from waitlist", remaining });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/waitlist/:tripId", verifyToken, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.tripId)) {
      return res.status(400).json({ error: "Invalid trip ID" });
    }
    const trip = await Trip.findById(req.params.tripId);
    if (!trip) return res.status(404).json({ error: "Trip not found" });
    if (trip.organizer.email !== req.user.email) {
      return res.status(403).json({ error: "Only the organizer can view the waitlist" });
    }
    const list = await Waitlist.find({ tripId: req.params.tripId }).sort({ joinedAt: 1 }).lean();
    res.json({ waitlist: list, total: list.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  GLOBAL ERROR HANDLER
// ══════════════════════════════════════════════════════════════

// 404
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// 500
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("❌ Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ══════════════════════════════════════════════════════════════
//  WEBSOCKET
// ══════════════════════════════════════════════════════════════

const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

const onlineUsers = new Map(); // tripId → Map<email, {email,name}>

wss.on("connection", (ws) => {
  let connectedTrip  = null;
  let connectedEmail = null;

  ws.on("message", async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === "TYPING_START" || msg.type === "TYPING_STOP") {
        broadcast(wss, msg);
        return;
      }

      if (msg.type === "USER_ONLINE") {
        connectedTrip  = msg.tripId;
        connectedEmail = msg.email;
        if (!onlineUsers.has(msg.tripId)) onlineUsers.set(msg.tripId, new Map());
        onlineUsers.get(msg.tripId).set(msg.email, { email: msg.email, name: msg.name });
        broadcast(wss, {
          type:   "ONLINE_USERS",
          tripId: msg.tripId,
          emails: [...onlineUsers.get(msg.tripId).keys()],
        });
        return;
      }

      if (msg.type === "USER_OFFLINE") {
        if (onlineUsers.has(msg.tripId)) {
          onlineUsers.get(msg.tripId).delete(msg.email);
          broadcast(wss, {
            type:   "ONLINE_USERS",
            tripId: msg.tripId,
            emails: [...onlineUsers.get(msg.tripId).keys()],
          });
        }
        return;
      }

      // Chat message — verify sender is a participant or organizer
      if (!msg.tripId || !msg.email || !msg.text?.trim()) return;
      if (!mongoose.Types.ObjectId.isValid(msg.tripId)) return;

      const trip = await Trip.findById(msg.tripId).lean();
      if (!trip) return;

      const isAllowed =
        trip.organizer.email === msg.email ||
        trip.participants.some((p) => p.email === msg.email);
      if (!isAllowed) return;

      await Message.create({
        tripId: msg.tripId,
        sender: msg.sender,
        email:  msg.email,
        avatar: msg.avatar,
        text:   msg.text.slice(0, 2000), // hard cap
        time:   msg.time,
      });

      broadcast(wss, msg);
    } catch (err) {
      console.error("❌ WS message error:", err.message);
    }
  });

  ws.on("close", () => {
    if (connectedTrip && connectedEmail && onlineUsers.has(connectedTrip)) {
      onlineUsers.get(connectedTrip).delete(connectedEmail);
      broadcast(wss, {
        type:   "ONLINE_USERS",
        tripId: connectedTrip,
        emails: [...onlineUsers.get(connectedTrip).keys()],
      });
    }
  });

  ws.on("error", (err) => {
    console.error("❌ WS client error:", err.message);
  });
});

// ══════════════════════════════════════════════════════════════
//  START SERVER
// ══════════════════════════════════════════════════════════════

const PORT = parseInt(process.env.PORT || "5000", 10);

server.listen(PORT, "0.0.0.0", async () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);

  // Run cleanup once on startup, then every 24 h
  await deleteExpiredTrips();
  setInterval(deleteExpiredTrips, 24 * 60 * 60 * 1000);
});

// ══════════════════════════════════════════════════════════════
//  GRACEFUL SHUTDOWN
// ══════════════════════════════════════════════════════════════

async function shutdown(signal) {
  console.log(`\n⚠️  Received ${signal}. Shutting down gracefully…`);
  server.close(async () => {
    try {
      await mongoose.connection.close();
      console.log("✅ MongoDB connection closed.");
    } catch (err) {
      console.error("❌ Error closing MongoDB:", err.message);
    }
    process.exit(0);
  });

  // Force-kill after 10 s
  setTimeout(() => {
    console.error("❌ Forced shutdown after timeout.");
    process.exit(1);
  }, 10_000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
  process.exit(1);
});