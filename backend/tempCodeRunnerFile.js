
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const app = express();
const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");
 
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
app.use(cors());
app.use(express.json());
const uploadDirs = ["uploads", "uploads/avatars", "uploads/trips"];
uploadDirs.forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 Created missing directory: ${dir}`);
  }
});

mongoose.connect("mongodb://127.0.0.1:27017/myDatabase")
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Connection Error:", err));


const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email:
  { type: String,
    required: true,
    unique:true  
  },
  password:{
    type:String,
    required:true,
    minlength:6
  },
  university:{
    type:String,
    required:true,
  },
  avatar:{type:String,
     default :""},
});

const User = mongoose.model("User", UserSchema);

const TripSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  destination: {
    type: String,
    required: true,
  },
  organizer: {
    name: { type: String, required: true },
    university: { type: String, required: true },
    email: { type: String, required: true },
    avatar: { type: String },
  },
  participants: [
  {
    name: String,
    email: String,
    university: String,
    avatar: String,
  }
],
  maxParticipants: {
    type: Number,
    required: true,
  },
  price: {
    type: Number,
    required: true,
  },
   startDate: { type: String 
    , required: true
   },  
  endDate: { type: String ,
    required: true
  },
  universities: {
    type: [String],
    default: [],
  },
  tripjoined: {
    type: Number,
    default: 0,
  },
  triporganised: {
    type: Number,
    default: 0,
  },
  imageUrl: {
    type: String,
    default: "",
  },
  description: {
    type: String,
    required: true,
  },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
});

const Trip = mongoose.model("Trip", TripSchema);
// 🔥 Auto delete expired trips
async function deleteExpiredTrips() {
  try {
    const today = new Date();

    await Trip.deleteMany({
      endDate: { $lt: today.toISOString().split("T")[0] }
    });

    console.log("🗑 Expired trips deleted if any");
  } catch (err) {
    console.error("❌ Error deleting expired trips:", err);
  }
}
const MessageSchema = new mongoose.Schema({
  tripId: { type: String, required: true },
  sender: String,
  email: String,
  avatar: String,
  text: String,
  time: String,
}, { timestamps: true });

const Message = mongoose.model("Message", MessageSchema);

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/avatars"); // folder to store images
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + Date.now() + ext);
  }
});

const upload = multer({ storage: storage });


// Make uploads folder public
app.use('/uploads', express.static('uploads'));

// Endpoint to update user avatar
app.put("/update-avatar/:email", verifyToken, upload.single("avatar"), async (req, res) => {
  try {
    console.log("📸 File uploaded:", req.file);
    const { email } = req.params;
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const avatarPath = `/uploads/avatars/${req.file.filename}`;

    const updatedUser = await User.findOneAndUpdate(
      { email },
      { avatar: avatarPath },
      { new: true }
    );

    if (!updatedUser) return res.status(404).json({ error: "User not found" });
    
    res.json({ message: "✅ Profile picture updated successfully!", user: updatedUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "❌ An error occurred while updating profile picture." });
  }
});

const tripStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/trips"); // folder for trip images
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + Date.now() + ext);
  },
});

const uploadTrip = multer({ storage: tripStorage });

app.post("/upload-trip-image", verifyToken, uploadTrip.single("image"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  const imagePath = `/uploads/trips/${req.file.filename}`;
  res.json({ imageUrl: imagePath });
});


app.get("/", (req, res) => {
  res.send("Backend is running!");
});

app.post("/add-user", async (req, res) => {
  try {
    const { name, email, password, university } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      name,
      email,
      password: hashedPassword,
      university,
    });

    await user.save();
    res.json({ message: "✅ User added successfully!", user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});




app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ error: "All fields are required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "User not found" });

    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(401).json({ error: "Invalid credentials" });


    const token = jwt.sign(
      { id: user._id, email: user.email },
  process.env.JWT_SECRET, 
      { expiresIn: "10h" }
    );

    res.status(200).json({
      message: "✅ Login successful!",
      token,
      user: {
        name: user.name,
        email: user.email,
        university: user.university,
        avatar: user.avatar||"",
      },
    });
  } catch (err) {
    console.error("❌ Login Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    console.log("❌ No Authorization header found");
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  const token = authHeader.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : authHeader;

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified;
    next();
  } catch (err) {
    console.error("❌ JWT verification failed:", err.message);
    return res.status(400).json({ error: "Invalid token" });
  }
}


app.post("/create-trip", verifyToken, async (req, res) => {
  try {
    const tripData = req.body;
    const newTrip = new Trip(tripData);
    await newTrip.save();
    res.status(201).json({ message: "Trip created successfully!", trip: newTrip });
  } catch (err) {
    console.error("❌ Error creating trip:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/users", async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/users/:email", verifyToken, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/get-trips", async (req, res) => {
  try {
    let trips = await Trip.find().sort({ createdAt: -1 });

    const updatedTrips = await Promise.all(
      trips.map(async (trip) => {
        if (trip.organizer && trip.organizer.email) {
          const user = await User.findOne({ email: trip.organizer.email });
          if (user && user.avatar) {
            trip.organizer.avatar = user.avatar; // ✅ update avatar dynamically
          }
        }
        return trip;
      })
    );

    res.json({ trips: updatedTrips });
  } catch (err) {
    console.error("❌ Error fetching trips:", err);
    res.status(500).json({ error: "Failed to fetch trips" });
  }
});

 

app.put("/users/:email", verifyToken, async (req, res) => {
  try {
    const { email } = req.params;
    const { avatar } = req.body;

    const user = await User.findOneAndUpdate(
      { email },
      { avatar },
      { new: true }
    );

    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({ message: "Profile picture updated!", user });
  } catch (err) {
    console.error("❌ Error updating avatar:", err);
    res.status(500).json({ error: err.message });
  }
});
app.get("/trip/:id", async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) return res.status(404).json({ error: "Trip not found" });
    res.json(trip);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/messages/:tripId", async (req, res) => {
  try {
    const messages = await Message.find({ tripId: req.params.tripId });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/join-trip", verifyToken, async (req, res) => {
  const { tripId, user } = req.body;

  try {
    const trip = await Trip.findById(tripId);
    if (!trip) return res.json({ error: "Trip not found" });

    if (trip.participants.length >= trip.maxParticipants) {
      return res.json({ error: "Trip is full" });
    }
    // Prevent duplicate joins
    const alreadyJoined = trip.participants.some(
      (p) => p.email === user.email
    );

    if (alreadyJoined) return res.json({ message: "Already joined", trip });

    // Add participant
    trip.participants.push(user);
    trip.tripjoined = trip.participants.length;

    if (!trip.universities.includes(user.university)) {
      trip.universities.push(user.university);
    }

    await trip.save();

    // 🔥 BROADCAST UPDATED PARTICIPANTS
    const payload = {
      type: "PARTICIPANT_UPDATE",
      tripId: tripId,
      participants: trip.participants,
    };

    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(payload));
      }
    });

    res.json({ message: "User added", trip });

  } catch (err) {
    res.json({ error: err.message });
  }
});
app.delete("/trip/:id", verifyToken, async (req, res) => {
  try {
    await Trip.findByIdAndDelete(req.params.id);
    res.json({ message: "Trip cancelled" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/exit-trip", verifyToken, async (req, res) => {
  const { tripId, email } = req.body;
  try {
    const trip = await Trip.findById(tripId);
    if (!trip) return res.status(404).json({ error: "Trip not found" });

    // Remove participant
    trip.participants = trip.participants.filter(p => p.email !== email);
    trip.tripjoined = trip.participants.length;
    await trip.save();

    // 🔥 Broadcast to WebSocket clients that user exited
    const payload = {
      type: "USER_EXIT",
      tripId,
      email,
      participants:trip.participants
    };
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(payload));
      }
      
    });

    res.json({ message: "Exited trip", trip });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/auth/google", async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: "No token provided" });
 
    // Verify the Firebase ID token
    const decoded = await admin.auth().verifyIdToken(idToken);
    const { email, name, picture, uid } = decoded;
 
    // Check if user already exists in your MongoDB
    let user = await User.findOne({ email });
 
    if (!user) {
      // New Google user — create them with a placeholder password
      // (they'll never use it since they log in via Google)
      const placeholderPassword = await bcrypt.hash(uid + email, 10);
 
      user = new User({
        name:       name || email.split("@")[0],
        email,
        password:   placeholderPassword,
        university: "Not set", // Google users can update this in profile
        avatar:     picture || "",
      });
 
      await user.save();
      console.log(`✅ New Google user created: ${email}`);
    } else {
      // Existing user — update avatar from Google if they don't have one
      if (!user.avatar && picture) {
        user.avatar = picture;
        await user.save();
      }
    }
 
    // Issue your own JWT (same as regular login)
    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "10h" }
    );
 
    res.status(200).json({
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
    console.error("❌ Google auth error:", err);
    res.status(401).json({ error: "Invalid Google token" });
  }
});
app.put("/trip/:id", verifyToken, async (req, res) => {
  try {
    const updated = await Trip.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: "Trip not found" });
    res.json({ message: "Trip updated", trip: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const http = require("http");
const server = http.createServer(app);

const WebSocket = require("ws");
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
  console.log("🟢 New WebSocket client connected");

ws.on("message", async (message) => {
  try {
    const msg = JSON.parse(message.toString());
    // Typing and online events — just rebroadcast, no DB save needed
    if (msg.type === "TYPING_START" || msg.type === "TYPING_STOP" ||
         msg.type === "USER_ONLINE"  || msg.type === "USER_OFFLINE") {
          wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
           client.send(JSON.stringify(msg));
      }
      });
      return;
    }
    const trip = await Trip.findById(msg.tripId);
    if (!trip) return;
 
    // ✅ FIX: check organizer OR participants (not just participants)
    const isAllowed =
      trip.organizer.email === msg.email ||          // host
      trip.participants.some(p => p.email === msg.email); // participant
 
    if (!isAllowed) {
      console.log(`⛔ Unauthorized message from ${msg.email}`);
      return;
    }
 
    await Message.create({
      tripId: msg.tripId,
      sender: msg.sender,
      email:  msg.email,
      avatar: msg.avatar,
      text:   msg.text,
      time:   msg.time,
    });
 
    // Broadcast to all connected clients
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(msg));
      }
    });
  } catch (err) {
    console.error("❌ WS message error:", err);
  }
});


  ws.on("close", () => {
    console.log("🔴 Client disconnected");
  });
});

server.listen(5000, "0.0.0.0", () => {
  console.log("🚀 Server running on ${process.env.REACT_APP_API_URL}");
  deleteExpiredTrips();
  setInterval(deleteExpiredTrips, 60 * 60 * 1000);
});