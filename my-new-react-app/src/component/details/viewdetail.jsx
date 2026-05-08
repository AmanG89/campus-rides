import "./viewdetail.css";
import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";

// Safe avatar URL
const resolveAvatar = (src) => {
  if (!src) return null;
  if (src.startsWith("http")) return src;
  return `${process.env.REACT_APP_API_URL}${src}`;
};

export default function Viewdetails() {
  const { id }   = useParams();
  const navigate = useNavigate();

  const [trip, setTrip]               = useState(null);
  const [loading, setLoading]         = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Modals
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showExitModal,   setShowExitModal]   = useState(false);
  const [showEditModal,   setShowEditModal]   = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);

  // Share
  const [copied, setCopied] = useState(false);

  // Edit
  const [editData, setEditData] = useState({
    title:"", destination:"", startDate:"", endDate:"",
    price:"", maxParticipants:"", universities:"", description:"",
  });
  const [editLoading, setEditLoading] = useState(false);
  const [editError,   setEditError]   = useState("");
  const [editSuccess, setEditSuccess] = useState("");

  // Rating
  const [ratingValue,      setRatingValue]      = useState(0);
  const [ratingHover,      setRatingHover]      = useState(0);
  const [ratingComment,    setRatingComment]    = useState("");
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [ratingDone,       setRatingDone]       = useState(false);
  const [hasRated,         setHasRated]         = useState(false);

  // Waitlist
  const [onWaitlist,      setOnWaitlist]      = useState(false);
  const [waitlistPos,     setWaitlistPos]     = useState(0);
  const [waitlistTotal,   setWaitlistTotal]   = useState(0);
  const [waitlistLoading, setWaitlistLoading] = useState(false);

  // Owner waitlist view
  const [ownerWaitlist,        setOwnerWaitlist]        = useState([]);
  const [ownerWaitlistLoading, setOwnerWaitlistLoading] = useState(false);
  const [showOwnerWaitlist,    setShowOwnerWaitlist]    = useState(false);

  // Seat-available toast (shown when WS says a seat opened for this user)
  const [seatToast, setSeatToast] = useState("");

  // Avatar error
  const [orgAvatarError, setOrgAvatarError] = useState(false);

  // WebSocket ref
  const wsRef = useRef(null);

  // ── Fetch trip ──
  useEffect(() => {
    fetch(`${process.env.REACT_APP_API_URL}/get-trips`)
      .then(r => r.json())
      .then(data => {
        const found = data.trips?.find(t => t._id === id) || null;
        setTrip(found);
        setOrgAvatarError(false);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  // ── WebSocket — listen for SEAT_AVAILABLE ──
  useEffect(() => {
    const currentUser = JSON.parse(localStorage.getItem("user") || "{}");
    const ws = new WebSocket(
  process.env.REACT_APP_API_URL
    .replace("https://", "wss://")
    .replace("http://", "ws://")
);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        // Only show toast if this message is for the logged-in user
        if (
          msg.type === "SEAT_AVAILABLE" &&
          msg.tripId === id &&
          msg.notifyEmail === currentUser?.email
        ) {
          setSeatToast(msg.message);
          setTimeout(() => setSeatToast(""), 6000);

          // Also update waitlist total count
          setWaitlistTotal(t => Math.max(0, t - 1));
        }

        // Real-time participant updates
        if (msg.type === "PARTICIPANT_UPDATE" && msg.tripId === id) {
          setTrip(prev => prev ? { ...prev, participants: msg.participants } : prev);
        }
        if (msg.type === "USER_EXIT" && msg.tripId === id) {
          setTrip(prev => prev ? { ...prev, participants: msg.participants } : prev);
        }
      } catch { /* silent */ }
    };

    return () => { ws.close(); };
  }, [id]);

  // ── Check rating + auto-prompt when trip just ended ──
  useEffect(() => {
    if (!trip) return;
    const user      = JSON.parse(localStorage.getItem("user") || "{}");
    const today     = new Date().toISOString().split("T")[0];
    const tripEnded = trip.endDate < today;
    const joined    = trip.participants?.some(p => p.email === user?.email);
    const isOwner   = trip.organizer?.email === user?.email;
    if (!tripEnded || !joined || isOwner) return;

    fetch(`${process.env.REACT_APP_API_URL}/ratings/check/${trip._id}/${user?.email}`)
      .then(r => r.json())
      .then(data => {
        setHasRated(data.hasRated);
        if (data.existing) {
          setRatingValue(data.existing.rating);
          setRatingComment(data.existing.comment || "");
        } else {
          // Auto-show rating modal after a short delay if not yet rated
          // Only prompt once per session using sessionStorage
          const promptKey = `rated_prompt_${trip._id}`;
          if (!sessionStorage.getItem(promptKey)) {
            sessionStorage.setItem(promptKey, "1");
            setTimeout(() => setShowRatingModal(true), 1200);
          }
        }
      })
      .catch(() => {});
  }, [trip?._id]);

  // ── Fetch owner waitlist ──
  useEffect(() => {
    if (!trip) return;
    const user    = JSON.parse(localStorage.getItem("user") || "{}");
    const isOwner = trip.organizer?.email === user?.email;
    if (!isOwner) return;

    const token = localStorage.getItem("token");
    setOwnerWaitlistLoading(true);
    fetch(`${process.env.REACT_APP_API_URL}/waitlist/${trip._id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => setOwnerWaitlist(data.waitlist || []))
      .catch(() => {})
      .finally(() => setOwnerWaitlistLoading(false));
  }, [trip?._id]);

  // ── Check waitlist — derive needed values inside the effect ──
  useEffect(() => {
    if (!trip) return;
    const user    = JSON.parse(localStorage.getItem("user") || "{}");
    const joined  = trip.participants?.some(p => p.email === user?.email);
    const isOwner = trip.organizer?.email === user?.email;
    const isFull  = (trip.maxParticipants - (trip.participants?.length || 0)) <= 0;
    if (!isFull || joined || isOwner) return;

    fetch(`${process.env.REACT_APP_API_URL}/waitlist/check/${trip._id}/${user?.email}`)
      .then(r => r.json())
      .then(data => {
        setOnWaitlist(data.onWaitlist);
        setWaitlistPos(data.position);
        setWaitlistTotal(data.total);
      })
      .catch(() => {});
  }, [trip?._id]);

  // ── Early returns AFTER all hooks ──
  if (loading) return (
    <div className="vd-loading">
      <div className="vd-spinner" />
      <p>Loading trip details…</p>
    </div>
  );
  if (!trip) return (
    <div className="vd-loading"><p>Trip not found.</p></div>
  );

  // ── Derived values ──
  const user        = JSON.parse(localStorage.getItem("user") || "{}");
  const token       = localStorage.getItem("token");
  const joined      = trip.participants?.some(p => p.email === user?.email);
  const isOwner     = trip.organizer?.email === user?.email;
  const seatsLeft   = trip.maxParticipants - (trip.participants?.length || 0);
  const isFull      = seatsLeft <= 0;
  const lat         = trip.latitude  || 28.6139;
  const lng         = trip.longitude || 77.2090;
  const today       = new Date().toISOString().split("T")[0];
  const tripEnded   = trip.endDate < today;
  const isEnded     = tripEnded;
  const isActive    = !tripEnded && trip.startDate <= today;
  const canRate     = tripEnded && joined && !isOwner;
  const firstLetter = trip.organizer?.name?.charAt(0).toUpperCase() || "?";
  const orgAvatarUrl = resolveAvatar(trip.organizer?.avatar);

  // ── Handlers ──

  const handleShare = async () => {
    const url = window.location.href;
    try { await navigator.clipboard.writeText(url); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const openEditModal = () => {
    setEditData({
      title:           trip.title,
      destination:     trip.destination,
      startDate:       trip.startDate,
      endDate:         trip.endDate,
      price:           trip.price,
      maxParticipants: trip.maxParticipants,
      universities:    Array.isArray(trip.universities)
        ? trip.universities.join(", ")
        : trip.universities || "",
      description: trip.description,
    });
    setEditError(""); setEditSuccess("");
    setShowEditModal(true);
  };

  const handleEditChange = e => {
    const { name, value } = e.target;
    setEditData(prev => ({ ...prev, [name]: value }));
  };

  const handleEditSave = async () => {
    setEditError("");
    if (!editData.title || !editData.destination || !editData.startDate ||
        !editData.endDate || !editData.price || !editData.maxParticipants ||
        !editData.description) {
      setEditError("Please fill in all required fields."); return;
    }
    if (new Date(editData.endDate) < new Date(editData.startDate)) {
      setEditError("End date cannot be before start date."); return;
    }
    if (Number(editData.maxParticipants) < (trip.participants?.length || 0)) {
      setEditError(`Can't set max below current ${trip.participants.length} joined.`); return;
    }
    setEditLoading(true);
    try {
      const body = {
        ...editData,
        price:           Number(editData.price),
        maxParticipants: Number(editData.maxParticipants),
        universities:    editData.universities.split(",").map(u => u.trim()).filter(Boolean),
      };
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/trip/${trip._id}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setEditSuccess("Trip updated!");
        setTrip(prev => ({ ...prev, ...body, universities: body.universities }));
        setTimeout(() => { setShowEditModal(false); setEditSuccess(""); }, 1400);
      } else { setEditError(data.error || "Failed to update."); }
    } catch { setEditError("Unable to connect to server."); }
    finally { setEditLoading(false); }
  };

  const handleExit = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/exit-trip`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ tripId: trip._id, email: user.email }),
      });
      const data = await res.json();
      if (res.ok) navigate("/home");
      else alert(data.error || "Failed to leave trip.");
    } catch { alert("Unable to connect to server."); }
    finally { setActionLoading(false); setShowExitModal(false); }
  };

  const handleCancel = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/trip/${trip._id}`, {
        method:  "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) navigate("/home");
      else alert("Failed to cancel trip.");
    } catch { alert("Unable to connect to server."); }
    finally { setActionLoading(false); setShowCancelModal(false); }
  };

  const submitRating = async () => {
    if (ratingValue === 0) return;
    setRatingSubmitting(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/ratings`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({
          tripId:         trip._id,
          organizerEmail: trip.organizer.email,
          rating:         ratingValue,
          comment:        ratingComment,
        }),
      });
      if (res.ok) {
        setRatingDone(true); setHasRated(true);
        setTimeout(() => { setShowRatingModal(false); setRatingDone(false); }, 1600);
      }
    } catch { /* silent */ }
    finally { setRatingSubmitting(false); }
  };

  const handleJoinWaitlist = async () => {
    setWaitlistLoading(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/waitlist/join`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ tripId: trip._id, user }),
      });
      const data = await res.json();
      if (res.ok) {
        setOnWaitlist(true);
        setWaitlistPos(data.position);
        setWaitlistTotal(data.total);
      } else { alert(data.error || "Could not join waitlist."); }
    } catch { alert("Connection error."); }
    finally { setWaitlistLoading(false); }
  };

  const handleLeaveWaitlist = async () => {
    setWaitlistLoading(true);
    try {
      await fetch(`${process.env.REACT_APP_API_URL}/waitlist/leave`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ tripId: trip._id, email: user.email }),
      });
      setOnWaitlist(false);
      setWaitlistPos(0);
      setWaitlistTotal(t => Math.max(0, t - 1));
    } catch { /* silent */ }
    finally { setWaitlistLoading(false); }
  };

  // ── JSX ──
  return (
    <div className="vd-page">

      {/* ── Seat available toast ── */}
      {seatToast && (
        <div className="vd-seat-toast">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          {seatToast}
        </div>
      )}

      {/* ══ EDIT MODAL ══ */}
      {showEditModal && (
        <div className="vd-modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="vd-modal vd-modal-wide" onClick={e => e.stopPropagation()}>
            <button className="vd-modal-x" onClick={() => setShowEditModal(false)}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
            <div className="vd-modal-icon vd-modal-icon-edit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </div>
            <h3>Edit Trip Details</h3>
            <p className="vd-modal-sub">Changes will be visible to all participants.</p>
            {editError   && <div className="vd-edit-feedback vd-edit-error">{editError}</div>}
            {editSuccess && <div className="vd-edit-feedback vd-edit-success">{editSuccess}</div>}
            <div className="vd-edit-form">
              <div className="vd-edit-row">
                <div className="vd-edit-field">
                  <label className="vd-edit-label">Trip Title</label>
                  <input className="vd-edit-input" name="title"
                    value={editData.title} onChange={handleEditChange}/>
                </div>
                <div className="vd-edit-field">
                  <label className="vd-edit-label">Destination</label>
                  <input className="vd-edit-input" name="destination"
                    value={editData.destination} onChange={handleEditChange}/>
                </div>
              </div>
              <div className="vd-edit-row">
                <div className="vd-edit-field">
                  <label className="vd-edit-label">Start Date</label>
                  <input className="vd-edit-input" type="date" name="startDate"
                    value={editData.startDate} onChange={handleEditChange} min={today}/>
                </div>
                <div className="vd-edit-field">
                  <label className="vd-edit-label">End Date</label>
                  <input className="vd-edit-input" type="date" name="endDate"
                    value={editData.endDate} onChange={handleEditChange}
                    min={editData.startDate || today}/>
                </div>
              </div>
              <div className="vd-edit-row">
                <div className="vd-edit-field">
                  <label className="vd-edit-label">Price (₹)</label>
                  <input className="vd-edit-input" type="number" name="price"
                    value={editData.price} onChange={handleEditChange} min="0"/>
                </div>
                <div className="vd-edit-field">
                  <label className="vd-edit-label">Max Participants</label>
                  <input className="vd-edit-input" type="number" name="maxParticipants"
                    value={editData.maxParticipants} onChange={handleEditChange}
                    min={trip.participants?.length || 1}/>
                </div>
              </div>
              <div className="vd-edit-field vd-edit-field-full">
                <label className="vd-edit-label">Universities</label>
                <input className="vd-edit-input" name="universities"
                  value={editData.universities} onChange={handleEditChange}/>
              </div>
              <div className="vd-edit-field vd-edit-field-full">
                <label className="vd-edit-label">Description</label>
                <textarea className="vd-edit-textarea" name="description"
                  value={editData.description} onChange={handleEditChange}/>
              </div>
            </div>
            <div className="vd-modal-actions">
              <button className="vd-modal-cancel-btn"
                onClick={() => setShowEditModal(false)}>Discard</button>
              <button className="vd-modal-confirm-edit"
                onClick={handleEditSave} disabled={editLoading}>
                {editLoading && <span className="vd-btn-spinner"/>}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ CANCEL MODAL ══ */}
      {showCancelModal && (
        <div className="vd-modal-overlay">
          <div className="vd-modal">
            <div className="vd-modal-icon vd-modal-icon-danger">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                <path d="M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
              </svg>
            </div>
            <h3>Cancel this trip?</h3>
            <p>This permanently deletes <strong>{trip.title}</strong> and removes all {trip.participants?.length || 0} participants.</p>
            <div className="vd-modal-actions">
              <button className="vd-modal-cancel-btn"
                onClick={() => setShowCancelModal(false)}>Keep Trip</button>
              <button className="vd-modal-confirm-danger"
                onClick={handleCancel} disabled={actionLoading}>
                {actionLoading && <span className="vd-btn-spinner"/>}
                Yes, Cancel Trip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ EXIT MODAL ══ */}
      {showExitModal && (
        <div className="vd-modal-overlay">
          <div className="vd-modal">
            <div className="vd-modal-icon vd-modal-icon-warning">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </div>
            <h3>Leave this trip?</h3>
            <p>You can rejoin later if seats are available.</p>
            <div className="vd-modal-actions">
              <button className="vd-modal-cancel-btn"
                onClick={() => setShowExitModal(false)}>Stay</button>
              <button className="vd-modal-confirm-warning"
                onClick={handleExit} disabled={actionLoading}>
                {actionLoading && <span className="vd-btn-spinner"/>}
                Yes, Leave Trip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ RATING MODAL ══ */}
      {showRatingModal && (
        <div className="vd-modal-overlay" onClick={() => setShowRatingModal(false)}>
          <div className="vd-modal" onClick={e => e.stopPropagation()}>
            <div className="vd-modal-icon"
              style={{ background:"#fffbeb", borderColor:"#fcd34d", color:"#f59e0b" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            </div>
            {ratingDone ? (
              <>
                <h3>Thanks for your review!</h3>
                <p style={{ color:"var(--text-muted)", fontSize:"0.9rem", marginBottom:0 }}>
                  Your rating has been submitted successfully.
                </p>
              </>
            ) : (
              <>
                <h3>Rate {trip.organizer?.name}</h3>
                <p style={{ color:"var(--text-muted)", fontSize:"0.85rem", marginBottom:"18px" }}>
                  How was your experience on <strong>{trip.title}</strong>?
                </p>
                <div className="vd-star-row">
                  {[1,2,3,4,5].map(s => (
                    <button key={s}
                      className={`vd-star-btn ${s <= (ratingHover || ratingValue) ? "vd-star-filled" : ""}`}
                      onMouseEnter={() => setRatingHover(s)}
                      onMouseLeave={() => setRatingHover(0)}
                      onClick={() => setRatingValue(s)}>★</button>
                  ))}
                </div>
                <div className="vd-star-label">
                  {["Tap a star to rate","Poor","Fair","Good","Great","Excellent!"][ratingValue]}
                </div>
                <textarea
                  className="vd-rating-comment"
                  placeholder="Leave a comment (optional)…"
                  value={ratingComment}
                  onChange={e => setRatingComment(e.target.value)}
                  rows={3}
                />
                <div className="vd-modal-actions">
                  <button className="vd-modal-cancel-btn"
                    onClick={() => setShowRatingModal(false)}>Cancel</button>
                  <button className="vd-modal-confirm-edit"
                    onClick={submitRating}
                    disabled={ratingValue === 0 || ratingSubmitting}
                    style={{ background: ratingValue > 0
                      ? "linear-gradient(90deg,#f59e0b,#fbbf24)" : undefined }}>
                    {ratingSubmitting && <span className="vd-btn-spinner"/>}
                    {hasRated ? "Update Rating" : "Submit Rating"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Back ── */}
      <button onClick={() => navigate("/home")} className="vd-back-btn">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Back to Trips
      </button>

      <div className="vd-body">

        {/* ════ LEFT ════ */}
        <div className="vd-left">
          <div className="vd-image-wrap">
            <img src={trip.imageUrl}
              className="vd-image" alt={trip.title}
              onError={e => { e.target.style.display = "none"; }}/>
            <div className={`vd-seats-badge ${isFull ? "vd-seats-full" : ""}`}>
              {isFull ? "Full" : `${seatsLeft} seat${seatsLeft !== 1 ? "s" : ""} left`}
            </div>
            {(joined || isOwner) && (
              <div className="vd-joined-badge">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                {isOwner ? "Your Trip" : "Joined"}
              </div>
            )}
          </div>

          <h1 className="vd-title">{trip.title}</h1>

          {(isActive || isEnded) && (
            <div className={`vd-status-card ${isActive ? "vd-status-active" : "vd-status-ended"}`}>
              <div className="vd-status-card-icon">
                {isActive ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </div>
              <div className="vd-status-card-text">
                <span className="vd-status-card-label">
                  {isActive ? "In Progress" : "Trip Ended"}
                </span>
                <span className="vd-status-card-sub">
                  {isActive ? `Ends on ${trip.endDate}` : `Ended on ${trip.endDate}`}
                </span>
              </div>
              {isActive && <span className="vd-status-live-dot" />}
            </div>
          )}

          <div className="vd-details">
            <div className="vd-detail-row">
              <div className="vd-detail-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
              </div>
              <span>{trip.destination}</span>
            </div>
            <div className="vd-detail-row">
              <div className="vd-detail-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              </div>
              <span>{trip.startDate} → {trip.endDate}</span>
            </div>
            <div className="vd-detail-row">
              <div className="vd-detail-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
                </svg>
              </div>
              <span>{trip.participants?.length || 0}/{trip.maxParticipants} participants</span>
            </div>
          </div>

          <div className="vd-price-row">
            <span className="vd-price">₹{trip.price}</span>
            <span className="vd-price-label">per person</span>
          </div>
        </div>

        {/* ════ RIGHT ════ */}
        <div className="vd-right">

          {/* Organizer */}
          <div className="vd-card">
            <div className="vd-card-header">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="8" r="4"/>
                <path d="M20 21a8 8 0 10-16 0"/>
              </svg>
              Trip Organizer
            </div>
            <div className="vd-organizer-row">
              {orgAvatarUrl && !orgAvatarError ? (
                <img
                  src={orgAvatarUrl}
                  className="vd-organizer-avatar"
                  alt={trip.organizer?.name}
                  onError={() => setOrgAvatarError(true)}
                />
              ) : (
                <div className="vd-organizer-initials">{firstLetter}</div>
              )}
              <div className="vd-organizer-info">
                <strong>{trip.organizer?.name}</strong>
                <span>{trip.organizer?.university}</span>
              </div>
              {isOwner && <div className="vd-owner-badge">You</div>}
            </div>
          </div>

          {/* Universities */}
          <div className="vd-card">
            <div className="vd-card-header">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2">
                <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
                <path d="M6 12v5c3 3 9 3 12 0v-5"/>
              </svg>
              Universities Participating
            </div>
            <div className="vd-universities">
              {(trip.universities || []).map((u, i) => (
                <span key={i} className="vd-uni-tag">{u}</span>
              ))}
            </div>
          </div>

          {/* ── Owner waitlist card ── */}
          {isOwner && (
            <div className="vd-card">
              <div className="vd-card-header">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
                Waitlist
                {ownerWaitlist.length > 0 && (
                  <span className="vd-waitlist-owner-count">{ownerWaitlist.length}</span>
                )}
              </div>

              {ownerWaitlistLoading ? (
                <div className="vd-waitlist-owner-loading">
                  <span className="vd-btn-spinner" style={{ borderTopColor: "#f59e0b" }} />
                  <span>Loading waitlist…</span>
                </div>
              ) : ownerWaitlist.length === 0 ? (
                <div className="vd-waitlist-owner-empty">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                  </svg>
                  No one is on the waitlist yet
                </div>
              ) : (
                <div className="vd-waitlist-owner-list">
                  {ownerWaitlist.map((entry, i) => {
                    const avatarUrl = entry.avatar
                      ? (entry.avatar.startsWith("http") ? entry.avatar : `${process.env.REACT_APP_API_URL}${entry.avatar}`)
                      : null;
                    return (
                      <div key={i} className="vd-waitlist-owner-row">
                        <div className="vd-waitlist-owner-pos">#{i + 1}</div>
                        {avatarUrl ? (
                          <img src={avatarUrl} className="vd-waitlist-owner-avatar"
                            alt={entry.name}
                            onError={e => { e.target.style.display="none"; e.target.nextSibling.style.display="flex"; }} />
                        ) : null}
                        <div className="vd-waitlist-owner-initials"
                          style={{ display: avatarUrl ? "none" : "flex" }}>
                          {(entry.name || "?").charAt(0).toUpperCase()}
                        </div>
                        <div className="vd-waitlist-owner-info">
                          <span className="vd-waitlist-owner-name">{entry.name}</span>
                          <span className="vd-waitlist-owner-uni">{entry.university}</span>
                        </div>
                        <div className="vd-waitlist-owner-time">
                          {new Date(entry.joinedAt).toLocaleDateString("en-IN", {
                            day: "numeric", month: "short",
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Description */}
          <div className="vd-card">
            <div className="vd-card-header">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2">
                <line x1="8" y1="6" x2="21" y2="6"/>
                <line x1="8" y1="12" x2="21" y2="12"/>
                <line x1="8" y1="18" x2="21" y2="18"/>
                <line x1="3" y1="6" x2="3.01" y2="6"/>
                <line x1="3" y1="12" x2="3.01" y2="12"/>
                <line x1="3" y1="18" x2="3.01" y2="18"/>
              </svg>
              Trip Description
            </div>
            <p className="vd-description">{trip.description}</p>
          </div>

          {/* Map */}
          <div className="vd-card">
            <div className="vd-card-header">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2">
                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
                <line x1="8" y1="2" x2="8" y2="18"/>
                <line x1="16" y1="6" x2="16" y2="22"/>
              </svg>
              Trip Location
            </div>
            <MapContainer center={[lat, lng]} zoom={10}
              style={{ height:"260px", width:"100%", borderRadius:"12px" }}>
              <TileLayer attribution="&copy; OpenStreetMap contributors"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>
              <Marker position={[lat, lng]}>
                <Popup>{trip.destination}</Popup>
              </Marker>
            </MapContainer>
          </div>

          {/* ── Actions ── */}
          <div className="vd-actions">

            {/* Share */}
            <button className={`vd-btn vd-btn-share ${copied ? "vd-btn-copied" : ""}`}
              onClick={handleShare}>
              {copied ? (
                <><svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12"/></svg>Link Copied!</>
              ) : (
                <><svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2">
                  <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/>
                  <circle cx="18" cy="19" r="3"/>
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                </svg>Share Trip Link</>
              )}
            </button>

            {/* Owner */}
            {isOwner && (
              <>
                <button className="vd-btn vd-btn-edit" onClick={openEditModal}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                  Edit Trip Details
                </button>
                <button className="vd-btn vd-btn-primary"
                  onClick={() => navigate(`/chatapp/${trip._id}`)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="white" strokeWidth="2.5">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                  </svg>
                  Open Group Chat
                </button>
                <button className="vd-btn vd-btn-danger"
                  onClick={() => setShowCancelModal(true)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                    <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                  </svg>
                  Cancel Trip
                </button>
              </>
            )}

            {/* Participant */}
            {joined && !isOwner && (
              <>
                <button className="vd-btn vd-btn-primary"
                  onClick={() => navigate(`/chatapp/${trip._id}`)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="white" strokeWidth="2.5">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                  </svg>
                  Open Chat
                </button>
                <button className="vd-btn vd-btn-warning"
                  onClick={() => setShowExitModal(true)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5">
                    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                    <polyline points="16 17 21 12 16 7"/>
                    <line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                  Leave Trip
                </button>
              </>
            )}

            {/* Join */}
            {!joined && !isOwner && !isFull && !tripEnded && (
              <button className="vd-btn vd-btn-primary"
                onClick={() => navigate(`/join-trip/${trip._id}`)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="white" strokeWidth="2.5">
                  <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <line x1="19" y1="8" x2="19" y2="14"/>
                  <line x1="22" y1="11" x2="16" y2="11"/>
                </svg>
                Join This Trip
              </button>
            )}

            {/* Full — Waitlist box */}
            {!joined && !isOwner && isFull && !tripEnded && (
              <div className="vd-waitlist-box">
                <div className="vd-waitlist-info">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                  <div>
                    <span className="vd-waitlist-title">This trip is full</span>
                    {waitlistTotal > 0 && (
                      <span className="vd-waitlist-sub">
                        {waitlistTotal} person{waitlistTotal !== 1 ? "s" : ""} already waiting
                      </span>
                    )}
                    {waitlistTotal === 0 && (
                      <span className="vd-waitlist-sub">Be first on the waitlist</span>
                    )}
                  </div>
                </div>

                {onWaitlist ? (
                  <>
                    <div className="vd-waitlist-position">
                      You're #{waitlistPos} on the waitlist — we'll notify you when a seat opens.
                    </div>
                    <button className="vd-btn vd-btn-warning"
                      onClick={handleLeaveWaitlist} disabled={waitlistLoading}>
                      {waitlistLoading && <span className="vd-btn-spinner"/>}
                      Leave Waitlist
                    </button>
                  </>
                ) : (
                  <button className="vd-btn-waitlist"
                    onClick={handleJoinWaitlist} disabled={waitlistLoading}>
                    {waitlistLoading ? (
                      <span className="vd-btn-spinner"/>
                    ) : (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="8" x2="12" y2="16"/>
                        <line x1="8" y1="12" x2="16" y2="12"/>
                      </svg>
                    )}
                    {waitlistLoading ? "Joining…" : "Join Waitlist"}
                  </button>
                )}
              </div>
            )}

            {/* Rate */}
            {canRate && (
              <button
                className={`vd-btn ${hasRated ? "vd-btn-rating-done" : "vd-btn-rating"}`}
                onClick={() => setShowRatingModal(true)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
                {hasRated ? "Edit Your Rating" : "Rate the Organizer"}
              </button>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}