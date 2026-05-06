import React, { useState, useEffect } from "react";
import "./main.css";
import location1 from "./location 1.svg";
import calendar  from "./calendar.svg";
import { useNavigate } from "react-router-dom";

function AvatarFallback({ name = "" }) {
  const initials = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  const colors   = ["#7c3aed","#0ea5e9","#10b981","#f43f5e","#f59e0b","#6366f1"];
  const bg       = colors[name.charCodeAt(0) % colors.length] || "#ff6b35";
  return (
    <div
      className="avatar-fallback"
      style={{
        background:  bg,
        width:       "26px",
        height:      "26px",
        minWidth:    "26px",
        minHeight:   "26px",
        fontSize:    "0.58rem",
        border:      "2px solid #ffd4c2",
        boxSizing:   "border-box",
        borderRadius:"50%",
        display:     "flex",
        alignItems:  "center",
        justifyContent: "center",
        fontWeight:  "900",
        color:       "#ffffff",
        flexShrink:  0,
      }}
    >
      {initials || "?"}
    </div>
  );
}

function StarRating({ rating, count }) {
  if (!rating || rating === 0) return null;
  return (
    <div className="organizer-rating">
      <span className="organizer-rating-star">★</span>
      <span className="organizer-rating-val">
        {rating.toFixed(1)}
        {count > 0 && <span className="organizer-rating-count"> ({count})</span>}
      </span>
    </div>
  );
}

function getTripStatus(startDate, endDate) {
  const todayStr = new Date().toISOString().split("T")[0];
  if (endDate   < todayStr) return "ended";
  if (startDate <= todayStr) return "active";
  return "upcoming";
}

export default function Middle({ trips = [] }) {
  const navigate    = useNavigate();
  const currentUser = JSON.parse(localStorage.getItem("user") || "{}");

  // Track broken organizer avatar images
  const [imgErrors, setImgErrors] = useState({});

  // Safe avatar URL — prevents double-prefix for Google photo URLs
  const avatarUrl = (src) => {
    if (!src) return "";
    if (src.startsWith("http")) return src;
    return `http://localhost:5000${src}`;
  };

  // Re-evaluate status badges every minute
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="card-container">
      {trips.map((trip, idx) => {
        const joined    = trip.participants?.some(p => p.email === currentUser?.email);
        const isFull    = trip.participants.length >= trip.maxParticipants;
        const seatsLeft = trip.maxParticipants - trip.participants.length;
        const fillPct   = Math.min(100, Math.round(
          (trip.participants.length / trip.maxParticipants) * 100
        ));

        const status     = getTripStatus(trip.startDate, trip.endDate);
        const isActive   = status === "active";
        const isEnded    = status === "ended";
        const isUpcoming = status === "upcoming";

        // Decide whether to show img or fallback for organizer avatar
        const hasOrgAvatar = !!trip.organizer?.avatar && !imgErrors[trip._id];

        return (
          <div className="trip-card" key={trip._id}
            style={{ animationDelay: `${idx * 0.07}s` }}>

            {/* ── Image ── */}
            <div className="trip-image-container">
              {trip.imageUrl ? (
                <img src={trip.imageUrl}
                  alt={trip.title} className="trip-image"
                  onError={e => { e.target.style.display = "none"; }} />
              ) : (
                <div className="trip-image-placeholder">
                  <svg viewBox="0 0 48 48" fill="none">
                    <rect x="4" y="17" width="36" height="21" rx="4" fill="#ff9a3c" opacity=".35"/>
                    <rect x="8" y="13" width="24" height="11" rx="3" fill="#ff9a3c" opacity=".25"/>
                    <circle cx="13" cy="38" r="4.5" fill="#ff9a3c" opacity=".35"/>
                    <circle cx="35" cy="38" r="4.5" fill="#ff9a3c" opacity=".35"/>
                  </svg>
                </div>
              )}

              {/* Seats pill — top right */}
              <div className="trip-joined">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                </svg>
                {trip.participants.length}/{trip.maxParticipants}
              </div>

              {/* Ended ribbon only */}
              {isEnded && <div className="image-ribbon ribbon-ended">Ended</div>}
            </div>

            {/* ── Card body ── */}
            <div className="trip-details">

              <h2 className="trip-title">{trip.title}</h2>

              {/* Location + dates */}
              <div className="trip-info-group">
                <p className="trip-location">
                  <img src={location1} alt="location" />{trip.destination}
                </p>
                <p className="trip-dates">
                  <img src={calendar} alt="dates" />
                  {trip.startDate}{trip.startDate !== trip.endDate && ` → ${trip.endDate}`}
                </p>
              </div>

              {/* ── Organizer row — always consistent size ── */}
              <div className="organizer-row">
                {hasOrgAvatar ? (
                  <img
                    className="trip-avtar"
                    src={avatarUrl(trip.organizer.avatar)}
                    alt={trip.organizer?.name || ""}
                    onError={() => setImgErrors(prev => ({ ...prev, [trip._id]: true }))}
                  />
                ) : (
                  <AvatarFallback name={trip.organizer?.name || ""} />
                )}
                <div className="organizer-info">
                  <span className="organizer-name">{trip.organizer?.name}</span>
                  <span className="organizer-uni">{trip.organizer?.university}</span>
                </div>
                <StarRating
                  rating={trip.organizer?.avgRating}
                  count={trip.organizer?.ratingCount}
                />
              </div>

              {/* University tags */}
              {trip.universities?.length > 0 && (
                <div className="trip-universities">
                  {trip.universities.map((uni, i) => (
                    <span key={i} className="trip-university">{uni}</span>
                  ))}
                </div>
              )}

              {/* Seat progress bar */}
              <div className="seat-progress-wrap">
                <div className="seat-progress-top">
                  <span className="seat-progress-label">
                    {isFull ? "Full" : `${seatsLeft} seat${seatsLeft !== 1 ? "s" : ""} left`}
                  </span>
                  <span className="seat-progress-frac">
                    {trip.participants.length}/{trip.maxParticipants}
                  </span>
                </div>
                <div className="seat-progress-bar">
                  <div
                    className={`seat-progress-fill ${
                      isFull ? "seat-progress-full" :
                      fillPct >= 70 ? "seat-progress-warn" : ""
                    }`}
                    style={{ width: `${fillPct}%` }}
                  />
                </div>
              </div>

              {/* Price + CTA */}
              <div className="card-bottom-row">
                <span className="trip-price">
                  ₹{trip.price}<span className="per-seat"> / seat</span>
                </span>

                {joined ? (
                  <button className="trip-button trip-button-sm"
                    onClick={() => navigate(`/viewdetails/${trip._id}`)}>
                    {isEnded ? "View Trip" : "View My Trip"}
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2.5">
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                  </button>
                ) : isFull ? (
  <button className="trip-button trip-button-sm"
    onClick={() => navigate(`/viewdetails/${trip._id}`)}>
    Full
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5">
      <path d="M5 12h14M12 5l7 7-7 7"/>
    </svg>
  </button>
) : !isEnded ? (
                  <button className="trip-button trip-button-sm"
                    onClick={() => navigate(`/viewdetails/${trip._id}`)}>
                    View Details
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2.5">
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                  </button>
                ) : null}
              </div>

            </div>
          </div>
        );
      })}
    </div>
  );
}