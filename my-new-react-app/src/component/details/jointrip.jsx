import "./jointrip.css";
import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";

export default function JoinTrip() {
  const { id }     = useParams();
  const navigate   = useNavigate();

  const [trip, setTrip]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError]     = useState("");

  const user = JSON.parse(localStorage.getItem("user") || "{}");

  useEffect(() => {
    fetch("http://localhost:5000/get-trips")
      .then(res => res.json())
      .then(data => {
        const found = data.trips.find(t => t._id === id);
        setTrip(found);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, [id]);

  if (loading) return (
    <div className="jt-loading">
      <div className="jt-spinner" />
      <p>Loading trip details…</p>
    </div>
  );

  if (!trip) return (
    <div className="jt-loading"><p>Trip not found.</p></div>
  );

  const seatsLeft = trip.maxParticipants - trip.participants.length;
  const isFull    = seatsLeft <= 0;

  const handleClick = async () => {
    const token = localStorage.getItem("token");
    setError("");

    if (isFull) { setError("This trip is already full."); return; }

    setJoining(true);
    try {
      const res = await fetch("http://localhost:5000/join-trip", {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          tripId: id,
          user: {
            name:       user.name,
            email:      user.email,
            university: user.university,
            avatar:     user.avatar || "",
          },
        }),
      });

      const data = await res.json();
      if (data.error) { setError(data.error); return; }

      navigate(`/chatapp/${id}`);
    } catch (err) {
      console.error("Join trip error:", err);
      setError("Unable to connect to the server. Please try again.");
    } finally {
      setJoining(false);
    }
  };

  const firstLetter = trip.organizer?.name?.charAt(0).toUpperCase() || "?";

  return (
    <div className="jt-page">

      {/* ── Back button ── */}
      <button className="jt-back-btn" onClick={() => navigate(`/viewdetails/${id}`)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back to Trip
      </button>

      <div className="jt-inner">

        {/* ── Hero heading ── */}
        <div className="jt-hero">
          <div className="jt-hero-icon">
            <svg viewBox="0 0 48 48" fill="none">
              <rect x="4" y="17" width="36" height="21" rx="4" fill="white" opacity=".9"/>
              <rect x="8" y="13" width="24" height="11" rx="3" fill="white" opacity=".7"/>
              <circle cx="13" cy="38" r="4.5" fill="white"/>
              <circle cx="35" cy="38" r="4.5" fill="white"/>
              <rect x="14" y="20" width="6" height="5" rx="1.5" fill="#ff6b35" opacity=".9"/>
              <rect x="22" y="20" width="6" height="5" rx="1.5" fill="#ff6b35" opacity=".9"/>
            </svg>
          </div>
          <h1 className="jt-hero-title">Join This Trip!</h1>
          <p className="jt-hero-sub">
            Review the details below and confirm your seat instantly.
          </p>
        </div>

        {/* ── Error feedback ── */}
        {error && (
          <div className="jt-feedback jt-feedback-error">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
            {error}
          </div>
        )}

        {/* ── Trip Summary card ── */}
        <div className="jt-card">
          <div className="jt-card-header">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            Trip Summary
          </div>

          <div className="jt-summary">
            {trip.imageUrl ? (
              <img
                src={trip.imageUrl}
                className="jt-trip-img"
                alt={trip.title}
              />
            ) : (
              <div className="jt-trip-img-placeholder">
                <svg viewBox="0 0 48 48" fill="none" style={{width:40,height:40,opacity:.3}}>
                  <rect x="4" y="17" width="36" height="21" rx="4" fill="#ff9a3c"/>
                  <rect x="8" y="13" width="24" height="11" rx="3" fill="#ff9a3c"/>
                  <circle cx="13" cy="38" r="4.5" fill="#ff9a3c"/>
                  <circle cx="35" cy="38" r="4.5" fill="#ff9a3c"/>
                </svg>
              </div>
            )}

            <div className="jt-summary-info">
              <h3 className="jt-trip-title">{trip.title}</h3>

              <div className="jt-detail-row">
                <div className="jt-detail-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
                    <circle cx="12" cy="10" r="3"/>
                  </svg>
                </div>
                {trip.destination}
              </div>

              <div className="jt-detail-row">
                <div className="jt-detail-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/>
                    <line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                </div>
                {trip.startDate} → {trip.endDate}
              </div>

              <div className="jt-detail-row">
                <div className="jt-detail-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
                  </svg>
                </div>
                {trip.participants.length}/{trip.maxParticipants} participants
                &nbsp;·&nbsp;
                <span className={isFull ? "jt-seats-full" : "jt-seats-left"}>
                  {isFull ? "Full" : `${seatsLeft} seat${seatsLeft !== 1 ? "s" : ""} left`}
                </span>
              </div>

              <div className="jt-price">
                ₹{trip.price}
                <span> / seat</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Organizer card ── */}
        <div className="jt-card">
          <div className="jt-card-header">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="8" r="4"/>
              <path d="M20 21a8 8 0 10-16 0"/>
            </svg>
            Trip Organizer
          </div>

          <div className="jt-organizer-row">
            {trip.organizer?.avatar ? (
              <img
                src={trip.organizer.avatar.startsWith("http")
                  ? trip.organizer.avatar
                  : `http://localhost:5000${trip.organizer.avatar}`}
                className="jt-organizer-avatar"
                alt={trip.organizer.name}
                onError={(e) => { e.target.style.display = "none"; }}
              />
            ) : (
              <div className="jt-organizer-initials">{firstLetter}</div>
            )}
            <div className="jt-organizer-info">
              <strong>{trip.organizer?.name}</strong>
              <span>{trip.organizer?.university}</span>
            </div>
            <div className="jt-host-badge">Host</div>
          </div>
        </div>

        {/* ── Your information card ── */}
        <div className="jt-card">
          <div className="jt-card-header">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            Your Information
          </div>
          <p className="jt-card-sub">
            This information will be shared with the trip organizer.
          </p>

          {/* Pre-filled read-only info from localStorage */}
          <div className="jt-info-grid">
            <div className="jt-info-item">
              <span className="jt-info-label">Full Name</span>
              <span className="jt-info-value">{user.name || "—"}</span>
            </div>
            <div className="jt-info-item">
              <span className="jt-info-label">University</span>
              <span className="jt-info-value">{user.university || "—"}</span>
            </div>
            <div className="jt-info-item jt-info-full">
              <span className="jt-info-label">Email Address</span>
              <span className="jt-info-value">{user.email || "—"}</span>
            </div>
          </div>

          <div className="jt-info-note">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            Info is pulled from your profile. Update it in Settings if needed.
          </div>
        </div>

        {/* ── Action buttons ── */}
        <div className="jt-btn-group">
          <button
            className="jt-btn jt-btn-secondary"
            onClick={() => navigate(`/viewdetails/${id}`)}
          >
            Back to Details
          </button>
          <button
            className="jt-btn jt-btn-primary"
            onClick={handleClick}
            disabled={joining || isFull}
          >
            {joining ? (
              <><span className="jt-spinner-sm" /> Joining…</>
            ) : isFull ? (
              "Trip is Full"
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="white" strokeWidth="2.5">
                  <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <line x1="19" y1="8" x2="19" y2="14"/>
                  <line x1="22" y1="11" x2="16" y2="11"/>
                </svg>
                Confirm &amp; Join Trip
              </>
            )}
          </button>
        </div>

        {/* ── Info strip ── */}
        <div className="jt-info-strip">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <div>
            <strong>Instant Join Process</strong>
            <p>By clicking "Confirm & Join Trip", you'll be added instantly and the organizer will be notified.</p>
          </div>
        </div>

      </div>
    </div>
  );
}