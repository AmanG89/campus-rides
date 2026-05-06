import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signInWithPopup }   from "firebase/auth";
import { auth, googleProvider } from "../../firebase"; // adjust path if needed
import "./login.css";

const BusIcon = () => (
  <svg viewBox="0 0 48 48" fill="none" className="ln-bus-svg">
    <rect x="4" y="17" width="36" height="21" rx="4" fill="white" opacity="0.9" />
    <rect x="8" y="13" width="24" height="11" rx="3" fill="white" opacity="0.7" />
    <circle cx="13" cy="38" r="4.5" fill="white" />
    <circle cx="35" cy="38" r="4.5" fill="white" />
    <path d="M40 25h4v5a2 2 0 01-2 2h-2v-7z" fill="white" opacity="0.6" />
    <rect x="14" y="20" width="6" height="5" rx="1.5" fill="#ff6b35" opacity="0.85" />
    <rect x="22" y="20" width="6" height="5" rx="1.5" fill="#ff6b35" opacity="0.85" />
  </svg>
);

const getInitials = (name = "") =>
  name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "?";

const AVATAR_COLORS = ["#7c3aed", "#0ea5e9", "#10b981", "#f43f5e", "#f59e0b", "#6366f1"];

export default function Login() {
  const navigate = useNavigate();

  const [formData, setFormData]       = useState({ email: "", password: "" });
  const [error, setError]             = useState("");
  const [success, setSuccess]         = useState("");
  const [loading, setLoading]         = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [todayTrip, setTodayTrip]     = useState(null);
  const [tripLoading, setTripLoading] = useState(true);

  // ── Google onboarding modal (shown for new Google users) ──
  const [showOnboarding, setShowOnboarding]   = useState(false);
  const [pendingToken, setPendingToken]         = useState(null);
  const [pendingUser, setPendingUser]           = useState(null);
  const [onboardName, setOnboardName]           = useState("");
  const [onboardUni, setOnboardUni]             = useState("");
  const [onboardLoading, setOnboardLoading]     = useState(false);
  const [onboardError, setOnboardError]         = useState("");

  // ── Post-login rating prompt ──
  const [unratedTrips, setUnratedTrips]         = useState([]);   // trips to rate
  const [ratingTripIdx, setRatingTripIdx]       = useState(0);    // which trip currently shown
  const [showRatingPrompt, setShowRatingPrompt] = useState(false);
  const [ratingValue, setRatingValue]           = useState(0);
  const [ratingHover, setRatingHover]           = useState(0);
  const [ratingComment, setRatingComment]       = useState("");
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [ratingToken, setRatingToken]           = useState("");   // JWT to use for submit

  // ── Fetch today's trip for left panel ──
  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    fetch("http://localhost:5000/get-trips")
      .then((r) => r.json())
      .then(({ trips }) => {
        if (!trips || trips.length === 0) return;
        const todayTrips = trips.filter((t) => t.startDate === today);
        const pick = todayTrips.length > 0
          ? todayTrips[0]
          : trips.find((t) => t.startDate >= today) || trips[0];
        setTodayTrip(pick);
      })
      .catch(() => {})
      .finally(() => setTripLoading(false));
  }, []);

  // ── Helpers to save user session ──
  const saveSession = (token, user) => {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
    localStorage.setItem("email", user.email);
  };

  // ── After login: find ended trips the user joined but hasn't rated ──
  const checkAndPromptRatings = async (token, user) => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const res   = await fetch("http://localhost:5000/get-trips");
      const data  = await res.json();
      const trips = data.trips || [];

      // Trips that: ended + user was a participant + user is NOT the organizer
      const endedJoined = trips.filter(t =>
        t.endDate < today &&
        t.participants?.some(p => p.email === user.email) &&
        t.organizer?.email !== user.email
      );

      if (endedJoined.length === 0) {
        navigate("/home");
        return;
      }

      // Check which ones haven't been rated yet
      const checks = await Promise.all(
        endedJoined.map(t =>
          fetch(`http://localhost:5000/ratings/check/${t._id}/${user.email}`)
            .then(r => r.json())
            .then(d => ({ trip: t, hasRated: d.hasRated }))
            .catch(() => ({ trip: t, hasRated: true })) // on error assume rated
        )
      );

      const pending = checks.filter(c => !c.hasRated).map(c => c.trip);

      if (pending.length === 0) {
        navigate("/home");
        return;
      }

      // Show rating prompt
      setUnratedTrips(pending);
      setRatingTripIdx(0);
      setRatingValue(0);
      setRatingHover(0);
      setRatingComment("");
      setRatingToken(token);
      setShowRatingPrompt(true);
    } catch {
      navigate("/home"); // on any error just go home
    }
  };

  // ── Submit a rating then advance to next or go home ──
  const submitRatingPrompt = async (skip = false) => {
    const trip = unratedTrips[ratingTripIdx];
    if (!skip && ratingValue > 0) {
      setRatingSubmitting(true);
      try {
        await fetch("http://localhost:5000/ratings", {
          method:  "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization:  `Bearer ${ratingToken}`,
          },
          body: JSON.stringify({
            tripId:         trip._id,
            organizerEmail: trip.organizer.email,
            rating:         ratingValue,
            comment:        ratingComment,
          }),
        });
      } catch { /* silent */ }
      finally { setRatingSubmitting(false); }
    }

    const nextIdx = ratingTripIdx + 1;
    if (nextIdx < unratedTrips.length) {
      // More trips to rate
      setRatingTripIdx(nextIdx);
      setRatingValue(0);
      setRatingHover(0);
      setRatingComment("");
    } else {
      // All done — go home
      setShowRatingPrompt(false);
      navigate("/home");
    }
  };

  // ── Email / password login (unchanged) ──
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setSuccess(""); setLoading(true);
    try {
      const res  = await fetch("http://localhost:5000/login", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Invalid login credentials"); return; }
      saveSession(data.token, data.user);
      setSuccess("Login successful! Checking trips…");
      await checkAndPromptRatings(data.token, data.user);
    } catch {
      setError("Unable to connect to the server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Google login ──
  const handleGoogleLogin = async () => {
    setError(""); setGoogleLoading(true);
    try {
      const result  = await signInWithPopup(auth, googleProvider);
      const idToken = await result.user.getIdToken();

      const res  = await fetch("http://localhost:5000/auth/google", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ idToken }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Google login failed. Please try again.");
        return;
      }

      // New Google user — university is "Not set", ask for details
      if (data.user.university === "Not set") {
        setPendingToken(data.token);
        setPendingUser(data.user);
        setOnboardName(data.user.name || "");
        setOnboardUni("");
        setOnboardError("");
        setShowOnboarding(true);
        return;
      }

      // Existing user — check for unrated trips first
      saveSession(data.token, data.user);
      setSuccess("Signed in with Google! Checking trips…");
      await checkAndPromptRatings(data.token, data.user);
    } catch (err) {
      if (err.code === "auth/popup-closed-by-user" ||
          err.code === "auth/cancelled-popup-request") return;
      setError("Google sign-in failed. Please try again.");
    } finally {
      setGoogleLoading(false);
    }
  };

  // ── Save name + university for new Google user ──
  const handleOnboardSubmit = async () => {
    if (!onboardName.trim())  { setOnboardError("Please enter your name."); return; }
    if (!onboardUni.trim())   { setOnboardError("Please enter your university."); return; }
    setOnboardLoading(true); setOnboardError("");
    try {
      // Update the user record on the backend
      const res = await fetch(`http://localhost:5000/update-profile/${pendingUser.email}`, {
        method:  "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization:  `Bearer ${pendingToken}`,
        },
        body: JSON.stringify({ name: onboardName.trim(), university: onboardUni.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setOnboardError(data.error || "Failed to save. Try again."); return; }

      const updatedUser = { ...pendingUser, name: onboardName.trim(), university: onboardUni.trim() };
      saveSession(pendingToken, updatedUser);
      setShowOnboarding(false);
      setSuccess("Welcome to CampusRides! Checking trips…");
      await checkAndPromptRatings(pendingToken, updatedUser);
    } catch {
      setOnboardError("Connection error. Please try again.");
    } finally {
      setOnboardLoading(false);
    }
  };

  // ── Computed values ──
  const seatsLeft  = todayTrip
    ? todayTrip.maxParticipants - (todayTrip.participants?.length || 0)
    : null;
  const avatarList = todayTrip?.participants?.slice(0, 4) || [];
  const fillPct    = todayTrip
    ? Math.round(((todayTrip.participants?.length || 0) / todayTrip.maxParticipants) * 100)
    : 0;

  return (
    <main className="ln-main">

      {/* ══ GOOGLE ONBOARDING MODAL ══ */}
      {showOnboarding && (
        <div className="ln-ob-overlay">
          <div className="ln-ob-card">

            {/* Header */}
            <div className="ln-ob-icon">
              <svg viewBox="0 0 48 48" fill="none">
                <rect x="4" y="17" width="36" height="21" rx="4" fill="#ff6b35" opacity=".9"/>
                <rect x="8" y="13" width="24" height="11" rx="3" fill="#ff9a3c" opacity=".7"/>
                <circle cx="13" cy="38" r="4.5" fill="#ff6b35"/>
                <circle cx="35" cy="38" r="4.5" fill="#ff6b35"/>
              </svg>
            </div>

            <h2 className="ln-ob-title">One last step!</h2>
            <p className="ln-ob-sub">
              Tell us your name and university so others can find and join your trips.
            </p>

            {onboardError && (
              <div className="ln-ob-error">{onboardError}</div>
            )}

            <div className="ln-ob-field">
              <label className="ln-ob-label">Your Name</label>
              <input
                className="ln-ob-input"
                type="text"
                placeholder="e.g. Rahul Sharma"
                value={onboardName}
                onChange={e => { setOnboardName(e.target.value); setOnboardError(""); }}
                autoFocus
              />
            </div>

            <div className="ln-ob-field">
              <label className="ln-ob-label">University</label>
              <input
                className="ln-ob-input"
                type="text"
                placeholder="e.g. Uttaranchal University"
                value={onboardUni}
                onChange={e => { setOnboardUni(e.target.value); setOnboardError(""); }}
                onKeyDown={e => e.key === "Enter" && handleOnboardSubmit()}
              />
            </div>

            <button
              className="ln-ob-btn"
              onClick={handleOnboardSubmit}
              disabled={onboardLoading}
            >
              {onboardLoading ? (
                <span className="ln-ob-spinner" />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )}
              {onboardLoading ? "Saving…" : "Let's Go!"}
            </button>
          </div>
        </div>
      )}

      {/* ══ POST-LOGIN RATING PROMPT ══ */}
      {showRatingPrompt && unratedTrips[ratingTripIdx] && (() => {
        const trip = unratedTrips[ratingTripIdx];
        const total = unratedTrips.length;
        const current = ratingTripIdx + 1;
        const starLabels = ["", "Poor", "Fair", "Good", "Great", "Excellent!"];
        return (
          <div className="ln-ob-overlay">
            <div className="ln-ob-card" style={{ maxWidth: 440 }}>

              {/* Progress */}
              {total > 1 && (
                <div className="ln-rating-progress">
                  <span>{current} of {total} trips to rate</span>
                  <div className="ln-rating-progress-bar">
                    <div className="ln-rating-progress-fill"
                      style={{ width: `${(current / total) * 100}%` }} />
                  </div>
                </div>
              )}

              {/* Trip image + title */}
              <div className="ln-rating-trip-header">
                {trip.imageUrl ? (
                  <img
                    src={trip.imageUrl.startsWith("http")
                      ? trip.imageUrl
                      : `http://localhost:5000${trip.imageUrl}`}
                    className="ln-rating-trip-img"
                    alt={trip.title}
                  />
                ) : (
                  <div className="ln-rating-trip-img-ph">
                    <svg viewBox="0 0 48 48" fill="none" style={{width:32,opacity:.4}}>
                      <rect x="4" y="17" width="36" height="21" rx="4" fill="#ff9a3c"/>
                      <rect x="8" y="13" width="24" height="11" rx="3" fill="#ff9a3c"/>
                      <circle cx="13" cy="38" r="4.5" fill="#ff9a3c"/>
                      <circle cx="35" cy="38" r="4.5" fill="#ff9a3c"/>
                    </svg>
                  </div>
                )}
                <div className="ln-rating-trip-info">
                  <span className="ln-rating-ended-pill">Trip Ended</span>
                  <h3 className="ln-rating-trip-title">{trip.title}</h3>
                  <span className="ln-rating-trip-dest">📍 {trip.destination}</span>
                </div>
              </div>

              <p className="ln-ob-sub" style={{ marginBottom: 16 }}>
                How was your experience? Rate <strong>{trip.organizer?.name}</strong> as a host.
              </p>

              {/* Stars */}
              <div className="ln-star-row">
                {[1, 2, 3, 4, 5].map(s => (
                  <button key={s}
                    className={`ln-star-btn ${s <= (ratingHover || ratingValue) ? "ln-star-filled" : ""}`}
                    onMouseEnter={() => setRatingHover(s)}
                    onMouseLeave={() => setRatingHover(0)}
                    onClick={() => setRatingValue(s)}>
                    ★
                  </button>
                ))}
              </div>
              <div className="ln-star-label">
                {starLabels[ratingHover || ratingValue] || "Tap a star to rate"}
              </div>

              {/* Comment */}
              <textarea
                className="ln-rating-comment"
                placeholder="Leave a comment for the host (optional)…"
                value={ratingComment}
                onChange={e => setRatingComment(e.target.value)}
                rows={2}
              />

              {/* Actions */}
              <div className="ln-rating-actions">
                <button className="ln-rating-skip"
                  onClick={() => submitRatingPrompt(true)}
                  disabled={ratingSubmitting}>
                  Skip
                </button>
                <button
                  className="ln-ob-btn"
                  style={{ flex: 1, marginTop: 0,
                    background: ratingValue > 0
                      ? "linear-gradient(90deg,#f59e0b,#fbbf24)"
                      : "linear-gradient(90deg,#ff6b35,#ff9a3c)" }}
                  onClick={() => submitRatingPrompt(false)}
                  disabled={ratingSubmitting}>
                  {ratingSubmitting
                    ? <span className="ln-ob-spinner" />
                    : <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2.5">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                      </svg>}
                  {ratingSubmitting
                    ? "Submitting…"
                    : ratingValue > 0
                    ? current < total ? "Submit & Next" : "Submit & Go Home"
                    : current < total ? "Next" : "Go Home"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <div className="ln-wrapper">

        {/* ══ LEFT PANEL ══ */}
        <div className="ln-left">
          <div className="ln-blob ln-blob-top" />
          <div className="ln-blob ln-blob-bottom" />

          <div className="ln-brand">
            <div className="ln-brand-icon"><BusIcon /></div>
            <h1 className="ln-brand-name">Campus Rides</h1>
            <div className="ln-brand-tagline">
              Connect with fellow students.<br />
              Share the journey, split the cost.
            </div>
          </div>

          <div className="ln-trip-card">
            <div className="ln-trip-card-top">
              <div className="ln-live-badge">
                <span className="ln-live-dot" /> Live Trip
              </div>
              {todayTrip && seatsLeft !== null && (
                <div className={`ln-seats-pill ${seatsLeft === 0 ? "ln-seats-full" : ""}`}>
                  {seatsLeft === 0 ? "Full" : `${seatsLeft} left`}
                </div>
              )}
            </div>

            {tripLoading ? (
              <div className="ln-skeleton">
                <div className="ln-skel-line" />
                <div className="ln-skel-line ln-skel-short" />
                <div className="ln-skel-line" />
              </div>
            ) : todayTrip ? (
              <>
                {todayTrip.imageUrl ? (
                  <div className="ln-trip-img-wrap">
                    <img
                      src={todayTrip.imageUrl.startsWith("http")
                        ? todayTrip.imageUrl
                        : `http://localhost:5000${todayTrip.imageUrl}`}
                      alt={todayTrip.title} className="ln-trip-img" />
                    <div className="ln-trip-img-overlay">
                      <div className="ln-trip-price-badge">₹{todayTrip.price}/seat</div>
                    </div>
                  </div>
                ) : (
                  <div className="ln-trip-img-ph">
                    <svg viewBox="0 0 48 48" fill="none" style={{width:40,opacity:.3}}>
                      <rect x="4" y="17" width="36" height="21" rx="4" fill="white"/>
                      <rect x="8" y="13" width="24" height="11" rx="3" fill="white" opacity=".7"/>
                      <circle cx="13" cy="38" r="4.5" fill="white"/>
                      <circle cx="35" cy="38" r="4.5" fill="white"/>
                    </svg>
                    <div className="ln-trip-price-badge" style={{position:"relative",marginTop:8}}>
                      ₹{todayTrip.price}/seat
                    </div>
                  </div>
                )}

                <div className="ln-trip-title">{todayTrip.title}</div>

                <div className="ln-trip-row">
                  <div className="ln-trip-dot ln-dot-green" />
                  <div className="ln-trip-row-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
                      <circle cx="12" cy="10" r="3"/>
                    </svg>
                  </div>
                  <span className="ln-trip-row-text">{todayTrip.destination}</span>
                </div>

                <div className="ln-trip-row">
                  <div className="ln-trip-dot" />
                  <div className="ln-trip-row-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2"/>
                      <line x1="16" y1="2" x2="16" y2="6"/>
                      <line x1="8" y1="2" x2="8" y2="6"/>
                      <line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                  </div>
                  <span className="ln-trip-row-text">
                    {todayTrip.startDate}
                    {todayTrip.startDate !== todayTrip.endDate && ` → ${todayTrip.endDate}`}
                  </span>
                </div>

                <div className="ln-progress-wrap">
                  <div className="ln-progress-top">
                    <div className="ln-trip-row-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                        <circle cx="9" cy="7" r="4"/>
                        <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
                      </svg>
                    </div>
                    <span className="ln-trip-row-text">
                      {todayTrip.participants?.length || 0}/{todayTrip.maxParticipants} joined
                    </span>
                  </div>
                  <div className="ln-progress-bar">
                    <div className="ln-progress-fill" style={{ width: `${fillPct}%` }} />
                  </div>
                </div>

                <div className="ln-organizer-row">
                  {todayTrip.organizer?.avatar ? (
                    <img
                      src={todayTrip.organizer.avatar.startsWith("http")
                        ? todayTrip.organizer.avatar
                        : `http://localhost:5000${todayTrip.organizer.avatar}`}
                      alt={todayTrip.organizer.name}
                      className="ln-org-avatar-img"
                      onError={e => { e.target.style.display = "none"; }}
                    />
                  ) : (
                    <div className="ln-org-avatar-init">
                      {getInitials(todayTrip.organizer?.name)}
                    </div>
                  )}
                  <span className="ln-org-by">by</span>
                  <span className="ln-org-name">{todayTrip.organizer?.name}</span>
                  <span className="ln-org-host-badge">Host</span>
                </div>
              </>
            ) : (
              <div className="ln-no-trip">No trips scheduled right now</div>
            )}
          </div>

          {todayTrip && (
            <div className="ln-avatars-row">
              {avatarList.length > 0 ? (
                avatarList.map((p, i) =>
                  p.avatar ? (
                    <img key={i}
                      src={p.avatar.startsWith("http") ? p.avatar : `http://localhost:5000${p.avatar}`}
                      alt={p.name} className="ln-av ln-av-img"
                      style={{ zIndex: avatarList.length - i }} />
                  ) : (
                    <div key={i} className="ln-av"
                      style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length], zIndex: avatarList.length - i }}>
                      {getInitials(p.name)}
                    </div>
                  )
                )
              ) : (
                [0,1,2].map((i) => (
                  <div key={i} className="ln-av"
                    style={{ background: AVATAR_COLORS[i], zIndex: 3 - i }}>?</div>
                ))
              )}
              <span className="ln-av-label">
                {todayTrip.participants?.length > 0
                  ? `${todayTrip.participants.length} riding`
                  : "Be the first!"}
              </span>
            </div>
          )}
        </div>

        {/* ══ RIGHT PANEL — Login form ══ */}
        <div className="login-container">

          <div className="header">
            <div className="mobile-brand">
              <div className="mobile-bus-icon"><BusIcon /></div>
            </div>
            <div className="student-badge">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none"
                stroke="currentColor" strokeWidth="2.5">
                <path d="M8 2l1.5 3h3l-2.5 2 1 3L8 8.5 5 10l1-3L3.5 5h3z" />
              </svg>
              Students only
            </div>
            <h1>Welcome back!</h1>
            <div className="light-text">
              Sign in with your <strong>college email</strong> to find rides
            </div>
          </div>

          <div className="body">
            <h3>Sign in</h3>

            {error   && <div className="error">{error}</div>}
            {success && <div className="success">{success}</div>}

            {/* ── Google Sign-In button ── */}
            <button
              type="button"
              className="google-btn"
              onClick={handleGoogleLogin}
              disabled={googleLoading || loading}
            >
              {googleLoading ? (
                <span className="spinner" style={{ borderTopColor: "#4285f4" }} />
              ) : (
                /* Official Google "G" logo SVG */
                <svg width="18" height="18" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  <path fill="none" d="M0 0h48v48H0z"/>
                </svg>
              )}
              {googleLoading ? "Signing in…" : "Continue with Google"}
            </button>

            {/* Divider */}
            <div className="auth-divider">
              <span>or sign in with email</span>
            </div>

            {/* Email / password form */}
            <form onSubmit={handleSubmit} className="login-form">
              <label htmlFor="email">College Email</label>
              <div className="inp-wrap">
                <svg className="inp-icon" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="4" width="20" height="16" rx="3" />
                  <path d="M2 8l10 6 10-6" />
                </svg>
                <input id="email" type="email" name="email"
                  placeholder="yourname@college.edu"
                  value={formData.email} onChange={handleChange}
                  required autoComplete="email" />
              </div>

              <label htmlFor="password">Password</label>
              <div className="inp-wrap">
                <svg className="inp-icon" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
                <input id="password" type="password" name="password"
                  placeholder="••••••••"
                  value={formData.password} onChange={handleChange}
                  required autoComplete="current-password" />
              </div>

              <button id="sign-in" type="submit"
                className={loading ? "loading" : ""} disabled={loading || googleLoading}>
                {loading ? (
                  <><span className="spinner" />Signing in…</>
                ) : (
                  <><svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                    stroke="white" strokeWidth="2.5">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>Sign in &amp; Find Rides</>
                )}
              </button>
            </form>

            <div className="signin-text">
              Don&apos;t have an account?
              <Link to="/signup"> Create one here</Link>
            </div>
          </div>
        </div>

      </div>
    </main>
  );
}