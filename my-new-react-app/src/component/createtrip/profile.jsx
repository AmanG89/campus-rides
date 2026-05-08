import "./profile.css";
import logout from "./logout.svg";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";

export default function Profile() {
  const navigate = useNavigate();
  const [user, setUser]               = useState(() => JSON.parse(localStorage.getItem("user")));
  const [imageFile, setImageFile]     = useState(null);
  const [previewUrl, setPreviewUrl]   = useState("");
  const [success, setSuccess]         = useState("");
  const [error, setError]             = useState("");
  const [uploading, setUploading]     = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [activeTab, setActiveTab]     = useState("joined");

  // Edit profile modal
  const [showEditModal, setShowEditModal]   = useState(false);
  const [editName, setEditName]             = useState("");
  const [editUni, setEditUni]               = useState("");
  const [editLoading, setEditLoading]       = useState(false);
  const [editError, setEditError]           = useState("");
  const [editSuccess, setEditSuccess]       = useState("");

  // Trip data
  const [joinedTrips,    setJoinedTrips]    = useState([]);
  const [organisedTrips, setOrganisedTrips] = useState([]);
  const [waitlistTrips,  setWaitlistTrips]  = useState([]);
  const [tripsLoading,   setTripsLoading]   = useState(true);

  // Avatar error tracking
  const [avatarImgError, setAvatarImgError] = useState(false);

  useEffect(() => {
    if (!user) { navigate("/"); return; }
    setAvatarImgError(false);

    const fetchData = async () => {
      try {
        const token = localStorage.getItem("token");

        const [tripsRes, waitlistRes] = await Promise.all([
          fetch(`${process.env.REACT_APP_API_URL}/get-trips`),
          fetch(`${process.env.REACT_APP_API_URL}/waitlist/user/${user.email}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        const tripsData    = await tripsRes.json();
        const waitlistData = waitlistRes.ok ? await waitlistRes.json() : { entries: [] };

        const allTrips  = tripsData.trips || [];
        const joined    = allTrips.filter(t => t.participants.some(p => p.email === user.email));
        const organised = allTrips.filter(t => t.organizer.email === user.email);

        // Match waitlist entries to their trip objects
        const waitlistEntries = waitlistData.entries || [];
        const waitlisted = waitlistEntries.map(entry => {
          const trip = allTrips.find(t => t._id === entry.tripId);
          return trip
            ? { ...trip, _waitlistPos: entry.position, _waitlistTotal: entry.total }
            : null;
        }).filter(Boolean);

        setJoinedTrips(joined);
        setOrganisedTrips(organised);
        setWaitlistTrips(waitlisted);
      } catch (err) {
        console.error("Error fetching data:", err);
      } finally {
        setTripsLoading(false);
      }
    };
    fetchData();
  }, [user?.email]);

  if (!user) return null;

  const today = new Date();

  const getTripStatus = (trip) => {
    const start = new Date(trip.startDate);
    const end   = new Date(trip.endDate);
    if (today > end)    return { label: "Ended",       cls: "pf-trip-ended"   };
    if (today >= start) return { label: "In Progress", cls: "pf-trip-active"  };
    return                     { label: "Upcoming",    cls: "pf-trip-upcoming" };
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setSuccess(""); setError("");
  };

  const handleImageUpload = async () => {
    const token = localStorage.getItem("token");
    if (!token || !imageFile) { setError("Please select an image first."); return; }
    setUploading(true); setSuccess(""); setError("");
    try {
      const formData = new FormData();
      formData.append("avatar", imageFile);
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/update-avatar/${user.email}`, {
        method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem("user", JSON.stringify(data.user));
        setUser(data.user);
        setAvatarImgError(false);
        setSuccess("Profile picture updated successfully!");
        setImageFile(null); setPreviewUrl("");
      } else { setError(data.error || "Failed to update profile picture."); }
    } catch { setError("An error occurred. Please try again."); }
    finally { setUploading(false); }
  };

  const handleLeaveWaitlist = async (tripId) => {
    const token = localStorage.getItem("token");
    try {
      await fetch(`${process.env.REACT_APP_API_URL}/waitlist/leave`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ tripId, email: user.email }),
      });
      setWaitlistTrips(prev => prev.filter(t => t._id !== tripId));
    } catch { /* silent */ }
  };

  const handleLogout = () => {
    localStorage.removeItem("user"); localStorage.removeItem("token");
    navigate("/");
  };

  const openEditModal = () => {
    setEditName(user.name || "");
    setEditUni(user.university || "");
    setEditError(""); setEditSuccess("");
    setShowEditModal(true);
  };

  const handleEditProfile = async () => {
    if (!editName.trim())  { setEditError("Name cannot be empty."); return; }
    if (!editUni.trim())   { setEditError("University cannot be empty."); return; }
    setEditLoading(true); setEditError(""); setEditSuccess("");
    try {
      const token = localStorage.getItem("token");
      const res   = await fetch(`${process.env.REACT_APP_API_URL}/update-profile/${user.email}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ name: editName.trim(), university: editUni.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setEditError(data.error || "Failed to update."); return; }
      const updatedUser = { ...user, name: editName.trim(), university: editUni.trim() };
      localStorage.setItem("user", JSON.stringify(updatedUser));
      setUser(updatedUser);
      setEditSuccess("Profile updated!");
      setTimeout(() => setShowEditModal(false), 1000);
    } catch { setEditError("Connection error. Try again."); }
    finally   { setEditLoading(false); }
  };

  const firstLetter = user.name ? user.name.charAt(0).toUpperCase() : "?";

  const resolvedAvatar = user.avatar
    ? (user.avatar.startsWith("http") ? user.avatar : `${process.env.REACT_APP_API_URL}${user.avatar}`)
    : null;

  const avatarSrc = previewUrl || (!avatarImgError && resolvedAvatar ? resolvedAvatar : null);

  const tabTrips = activeTab === "joined"    ? joinedTrips
    : activeTab === "organised" ? organisedTrips
    : waitlistTrips;

  return (
    <main className="profile-main">

      {/* ── Edit Profile Modal ── */}
      {showEditModal && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ textAlign:"left" }}>
            <div className="modal-icon" style={{ background:"#fff3ee", borderColor:"#ffd4c2", color:"var(--orange)" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </div>
            <h3 style={{ textAlign:"center" }}>Edit Profile</h3>
            <p style={{ textAlign:"center", color:"var(--text-muted)", fontSize:"0.82rem", marginBottom:"18px" }}>
              Update your display name and university.
            </p>
            {editError   && <div className="feedback error"   style={{marginBottom:10}}>{editError}</div>}
            {editSuccess && <div className="feedback success" style={{marginBottom:10}}>{editSuccess}</div>}
            <div style={{ display:"flex", flexDirection:"column", gap:"12px" }}>
              <div>
                <label className="pf-edit-label">Full Name</label>
                <input className="pf-edit-input" type="text" placeholder="Your full name"
                  value={editName} onChange={e => { setEditName(e.target.value); setEditError(""); }} autoFocus />
              </div>
              <div>
                <label className="pf-edit-label">University</label>
                <input className="pf-edit-input" type="text" placeholder="Your university"
                  value={editUni}  onChange={e => { setEditUni(e.target.value); setEditError(""); }}
                  onKeyDown={e => e.key === "Enter" && handleEditProfile()} />
              </div>
            </div>
            <div className="modal-actions" style={{ marginTop:"18px" }}>
              <button className="modal-cancel" onClick={() => setShowEditModal(false)}>Cancel</button>
              <button className="modal-confirm"
                style={{ background:"linear-gradient(90deg,#ff6b35,#ff9a3c)" }}
                onClick={handleEditProfile} disabled={editLoading}>
                {editLoading ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Logout Modal ── */}
      {showLogoutModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </div>
            <h3>Sign out?</h3>
            <p>You'll need to sign in again to access your account and trips.</p>
            <div className="modal-actions">
              <button className="modal-cancel" onClick={() => setShowLogoutModal(false)}>Cancel</button>
              <button className="modal-confirm" onClick={handleLogout}>Yes, Sign Out</button>
            </div>
          </div>
        </div>
      )}

      <div className="profile-wrapper">

        {/* ── Hero header ── */}
        <div className="profile-header-card">
          <div className="profile-header-bg" />
          <div className="profile-header-content">
            <div className="profile-avatar-wrap">
              {avatarSrc ? (
                <img src={avatarSrc} alt={user.name} className="profile-avatar"
                  onError={() => setAvatarImgError(true)} />
              ) : (
                <div className="avatar-fallback large">{firstLetter}</div>
              )}
              {previewUrl && <div className="avatar-preview-badge">Preview</div>}
            </div>
            <div className="profile-info">
              <div className="pf-name-row">
                <h1>{user.name}</h1>
                <button className="pf-edit-icon-btn" onClick={openEditModal} title="Edit profile">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
              </div>
              <div className="profile-email">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="4" width="20" height="16" rx="3"/>
                  <path d="M2 8l10 6 10-6"/>
                </svg>
                {user.email}
              </div>
              <div className="university">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
                  <path d="M6 12v5c3 3 9 3 12 0v-5"/>
                </svg>
                {user.university}
              </div>
              <div className="profile-stats-container">
                <div className="profile-stats">
                  <span className="stat-number">{joinedTrips.length}</span>
                  <span className="stat-label">Joined</span>
                </div>
                <div className="stats-divider" />
                <div className="profile-stats">
                  <span className="stat-number">{organisedTrips.length}</span>
                  <span className="stat-label">Organised</span>
                </div>
                {waitlistTrips.length > 0 && (
                  <>
                    <div className="stats-divider" />
                    <div className="profile-stats">
                      <span className="stat-number" style={{ color:"#f59e0b" }}>{waitlistTrips.length}</span>
                      <span className="stat-label">Waitlisted</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── My Trips ── */}
        <div className="profile-card">
          <div className="card-header">
            <div className="card-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
            </div>
            <div><h2>My Trips</h2><p>Trips you've joined, organised, or are waiting for</p></div>
          </div>

          {/* Tabs */}
          <div className="pf-tabs">
            <button className={`pf-tab ${activeTab === "joined" ? "pf-tab-active" : ""}`}
              onClick={() => setActiveTab("joined")}>
              Joined <span className="pf-tab-count">{joinedTrips.length}</span>
            </button>
            <button className={`pf-tab ${activeTab === "organised" ? "pf-tab-active" : ""}`}
              onClick={() => setActiveTab("organised")}>
              Organised <span className="pf-tab-count">{organisedTrips.length}</span>
            </button>
            <button className={`pf-tab ${activeTab === "waitlist" ? "pf-tab-active pf-tab-waitlist" : ""}`}
              onClick={() => setActiveTab("waitlist")}>
              Waitlist
              {waitlistTrips.length > 0 && (
                <span className={`pf-tab-count ${activeTab === "waitlist" ? "pf-tab-count-yellow" : ""}`}>
                  {waitlistTrips.length}
                </span>
              )}
            </button>
          </div>

          {tripsLoading ? (
            <div className="pf-loading-row"><div className="pf-spinner" /><span>Loading…</span></div>
          ) : tabTrips.length === 0 ? (
            <div className="pf-empty-row">
              <svg width="36" height="36" viewBox="0 0 48 48" fill="none">
                <rect x="4" y="17" width="36" height="21" rx="4" fill="#ffd4c2"/>
                <rect x="8" y="13" width="24" height="11" rx="3" fill="#ffd4c2" opacity=".6"/>
                <circle cx="13" cy="38" r="4.5" fill="#ffd4c2"/>
                <circle cx="35" cy="38" r="4.5" fill="#ffd4c2"/>
              </svg>
              <div>
                <strong>
                  {activeTab === "joined"    ? "No joined trips yet"
                  : activeTab === "organised" ? "No organised trips yet"
                  : "Not on any waitlists"}
                </strong>
                <span>
                  {activeTab === "joined"    ? "Browse and join a trip to see it here."
                  : activeTab === "organised" ? "Create a trip and it'll appear here."
                  : "When a trip is full, you can join its waitlist."}
                </span>
              </div>
            </div>
          ) : activeTab === "waitlist" ? (
            /* Waitlist tab */
            <div className="pf-trip-rows">
              {waitlistTrips.map(trip => {
                const status = getTripStatus(trip);
                return (
                  <div key={trip._id} className="pf-trip-row-item pf-waitlist-item">
                    {trip.imageUrl ? (
                      <img
                        src={trip.imageUrl.startsWith("http") ? trip.imageUrl : `${process.env.REACT_APP_API_URL}${trip.imageUrl}`}
                        className="pf-row-img" alt={trip.title} />
                    ) : (
                      <div className="pf-row-img-ph">
                        <svg viewBox="0 0 48 48" fill="none" style={{width:22,opacity:.35}}>
                          <rect x="4" y="17" width="36" height="21" rx="4" fill="#ff9a3c"/>
                          <rect x="8" y="13" width="24" height="11" rx="3" fill="#ff9a3c"/>
                          <circle cx="13" cy="38" r="4.5" fill="#ff9a3c"/>
                          <circle cx="35" cy="38" r="4.5" fill="#ff9a3c"/>
                        </svg>
                      </div>
                    )}
                    <div className="pf-row-info" style={{cursor:"pointer"}}
                      onClick={() => navigate(`/viewdetails/${trip._id}`)}>
                      <div className="pf-row-top">
                        <span className="pf-row-title">{trip.title}</span>
                        <span className={`pf-row-badge ${status.cls}`}>{status.label}</span>
                      </div>
                      <div className="pf-row-dest">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                        {trip.destination}
                      </div>
                      <div className="pf-waitlist-pos-row">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        <span>You're <strong>#{trip._waitlistPos}</strong> of {trip._waitlistTotal} waiting</span>
                      </div>
                      <div className="pf-row-meta">
                        <span><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>{trip.startDate}</span>
                        <span className="pf-row-price">₹{trip.price}</span>
                      </div>
                    </div>
                    <div className="pf-row-right">
                      <button className="pf-leave-waitlist-btn"
                        onClick={() => handleLeaveWaitlist(trip._id)} title="Leave waitlist">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <line x1="18" y1="6" x2="6" y2="18"/>
                          <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                        Leave
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Joined / Organised tab */
            <div className="pf-trip-rows">
              {tabTrips.map(trip => {
                const status = getTripStatus(trip);
                return (
                  <div key={trip._id} className="pf-trip-row-item">
                    {trip.imageUrl ? (
                      <img
                        src={trip.imageUrl.startsWith("http") ? trip.imageUrl : `${process.env.REACT_APP_API_URL}${trip.imageUrl}`}
                        className="pf-row-img" alt={trip.title} />
                    ) : (
                      <div className="pf-row-img-ph">
                        <svg viewBox="0 0 48 48" fill="none" style={{width:22,opacity:.35}}>
                          <rect x="4" y="17" width="36" height="21" rx="4" fill="#ff9a3c"/>
                          <rect x="8" y="13" width="24" height="11" rx="3" fill="#ff9a3c"/>
                          <circle cx="13" cy="38" r="4.5" fill="#ff9a3c"/>
                          <circle cx="35" cy="38" r="4.5" fill="#ff9a3c"/>
                        </svg>
                      </div>
                    )}
                    <div className="pf-row-info">
                      <div className="pf-row-top">
                        <span className="pf-row-title">{trip.title}</span>
                        <span className={`pf-row-badge ${status.cls}`}>{status.label}</span>
                      </div>
                      <div className="pf-row-dest">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                        {trip.destination}
                      </div>
                      <div className="pf-row-meta">
                        <span><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>{trip.startDate}</span>
                        <span><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>{trip.participants.length}/{trip.maxParticipants}</span>
                        <span className="pf-row-price">₹{trip.price}</span>
                      </div>
                      {/* Two action buttons */}
                      <div className="pf-row-actions">
                        <button className="pf-action-btn pf-action-details"
                          onClick={() => navigate(`/viewdetails/${trip._id}`)}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                          View Details
                        </button>
                        <button className="pf-action-btn pf-action-chat"
                          onClick={() => navigate(`/chatapp/${trip._id}`)}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                          Open Chat
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Avatar Upload ── */}
        <div className="profile-card">
          <div className="card-header">
            <div className="card-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
            </div>
            <div><h2>Profile Picture</h2><p>Update your avatar — others will see this on trips</p></div>
          </div>
          <div className="avatar-upload-area">
            <div className="current-avatar-wrap">
              {avatarSrc ? (
                <img src={avatarSrc} alt="avatar" className="current-avatar"
                  onError={() => setAvatarImgError(true)} />
              ) : (
                <div className="avatar-fallback large">{firstLetter}</div>
              )}
            </div>
            <label className="file-drop-zone">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/></svg>
              <span>{imageFile ? imageFile.name : "Click to choose an image"}</span>
              <em>{imageFile ? "Ready to upload" : "JPG, PNG, WEBP up to 5MB"}</em>
              <input type="file" accept="image/*" onChange={handleFileChange} style={{display:"none"}} />
            </label>
            <button className="upload-image" onClick={handleImageUpload} disabled={!imageFile || uploading}>
              {uploading ? (<><span className="btn-spinner"/>Uploading…</>) : (<><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/></svg>Save Profile Picture</>)}
            </button>
            {success && <div className="feedback success"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>{success}</div>}
            {error   && <div className="feedback error"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>{error}</div>}
          </div>
        </div>

        {/* ── Account Settings ── */}
        <div className="profile-card profile-account-setting">
          <div className="card-header">
            <div className="card-icon danger-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="8" r="4"/>
                <path d="M20 21a8 8 0 10-16 0"/>
              </svg>
            </div>
            <div><h2>Account Settings</h2><p>Manage your account preferences and session</p></div>
          </div>
          <div className="account-info-row">
            <div className="account-info-item"><span className="info-label">Full Name</span><span className="info-value">{user.name}</span></div>
            <div className="account-info-item"><span className="info-label">Email</span><span className="info-value">{user.email}</span></div>
            <div className="account-info-item"><span className="info-label">University</span><span className="info-value">{user.university}</span></div>
          </div>
          <div className="logout-section">
            <div className="logout-warning">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              You'll need to sign in again to access your account and trips.
            </div>
            <button className="logout-btn" onClick={() => setShowLogoutModal(true)}>
              <img className="logout-image" src={logout} alt="" />Sign Out
            </button>
          </div>
        </div>

      </div>
    </main>
  );
}