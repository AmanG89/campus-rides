import "./UserProfile.css";
import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";

export default function UserProfile() {
  const { email }   = useParams();
  const navigate    = useNavigate();
  const decodedEmail = decodeURIComponent(email);

  const [profileUser, setProfileUser]   = useState(null);
  const [trips, setTrips]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [activeTab, setActiveTab]       = useState("joined");

  const currentUser = JSON.parse(localStorage.getItem("user") || "{}");

  // If somehow viewing own profile, redirect
  useEffect(() => {
    if (decodedEmail === currentUser.email) {
      navigate("/profile/1", { replace: true });
      return;
    }
    loadData();
  }, [decodedEmail]);

  const loadData = async () => {
    try {
      const token = localStorage.getItem("token");

      // Fetch user info
      const userRes  = await fetch(
        `http://localhost:5000/users/${encodeURIComponent(decodedEmail)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const userData = await userRes.json();
      if (userRes.ok) setProfileUser(userData);

      // Fetch trips
      const tripsRes  = await fetch("http://localhost:5000/get-trips");
      const tripsData = await tripsRes.json();
      setTrips(tripsData.trips || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return (
    <div className="up-loading">
      <div className="up-spinner" />
      <p>Loading profile…</p>
    </div>
  );

  if (!profileUser) return (
    <div className="up-loading">
      <p>User not found.</p>
    </div>
  );

  const joinedTrips    = trips.filter(t => t.participants.some(p => p.email === decodedEmail));
  const organisedTrips = trips.filter(t => t.organizer.email === decodedEmail);
  const tabTrips       = activeTab === "joined" ? joinedTrips : organisedTrips;

  const today = new Date();
  const getTripStatus = (trip) => {
    const start = new Date(trip.startDate);
    const end   = new Date(trip.endDate);
    if (today > end)    return { label:"Ended",       cls:"up-ended"    };
    if (today >= start) return { label:"In Progress", cls:"up-active"   };
    return                     { label:"Upcoming",    cls:"up-upcoming" };
  };

  const firstLetter = profileUser.name?.charAt(0).toUpperCase() || "?";
  const avatarSrc = profileUser.avatar
    ? profileUser.avatar.startsWith("http")
      ? profileUser.avatar
      : `http://localhost:5000${profileUser.avatar}`
    : null;

  return (
    <div className="up-page">

      <button className="up-back-btn" onClick={() => navigate(-1)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Go Back
      </button>

      <div className="up-inner">

        {/* ── Hero card ── */}
        <div className="up-hero-card">
          <div className="up-hero-bg" />
          <div className="up-hero-content">
            <div className="up-avatar-wrap">
              {avatarSrc ? (
                <img src={avatarSrc} alt={profileUser.name} className="up-avatar" />
              ) : (
                <div className="up-avatar-fallback">{firstLetter}</div>
              )}
            </div>

            <div className="up-info">
              <h1 className="up-name">{profileUser.name}</h1>
              <div className="up-meta-row">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2">
                  <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
                  <path d="M6 12v5c3 3 9 3 12 0v-5"/>
                </svg>
                {profileUser.university}
              </div>
              <div className="up-meta-row">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="4" width="20" height="16" rx="3"/>
                  <path d="M2 8l10 6 10-6"/>
                </svg>
                {profileUser.email}
              </div>

              <div className="up-stats">
                <div className="up-stat">
                  <span className="up-stat-num">{joinedTrips.length}</span>
                  <span className="up-stat-label">Trips Joined</span>
                </div>
                <div className="up-stat-div" />
                <div className="up-stat">
                  <span className="up-stat-num">{organisedTrips.length}</span>
                  <span className="up-stat-label">Trips Organised</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Trips card ── */}
        <div className="up-card">
          <div className="up-card-header">
            <svg width="14" height="14" viewBox="0 0 48 48" fill="none">
              <rect x="4" y="17" width="36" height="21" rx="4" fill="currentColor" opacity=".4"/>
              <rect x="8" y="13" width="24" height="11" rx="3" fill="currentColor" opacity=".3"/>
              <circle cx="13" cy="38" r="4.5" fill="currentColor" opacity=".4"/>
              <circle cx="35" cy="38" r="4.5" fill="currentColor" opacity=".4"/>
            </svg>
            {profileUser.name.split(" ")[0]}'s Trips
          </div>

          {/* Tabs */}
          <div className="up-tabs">
            <button
              className={`up-tab ${activeTab === "joined" ? "up-tab-active" : ""}`}
              onClick={() => setActiveTab("joined")}
            >
              Joined
              <span className="up-tab-count">{joinedTrips.length}</span>
            </button>
            <button
              className={`up-tab ${activeTab === "organised" ? "up-tab-active" : ""}`}
              onClick={() => setActiveTab("organised")}
            >
              Organised
              <span className="up-tab-count">{organisedTrips.length}</span>
            </button>
          </div>

          {tabTrips.length === 0 ? (
            <div className="up-empty">
              <p>
                {activeTab === "joined"
                  ? `${profileUser.name.split(" ")[0]} hasn't joined any trips yet.`
                  : `${profileUser.name.split(" ")[0]} hasn't organised any trips yet.`}
              </p>
            </div>
          ) : (
            <div className="up-trip-list">
              {tabTrips.map(trip => {
                const status = getTripStatus(trip);
                return (
                  <div
                    key={trip._id}
                    className="up-trip-item"
                    onClick={() => navigate(`/viewdetails/${trip._id}`)}
                  >
                    <div className="up-trip-img-wrap">
                      {trip.imageUrl ? (
                        <img
                          src={trip.imageUrl.startsWith("http") ? trip.imageUrl : `http://localhost:5000${trip.imageUrl}`}
                          className="up-trip-img" alt={trip.title}
                        />
                      ) : (
                        <div className="up-trip-img-ph">
                          <svg viewBox="0 0 48 48" fill="none" style={{width:26,opacity:.3}}>
                            <rect x="4" y="17" width="36" height="21" rx="4" fill="#ff9a3c"/>
                            <rect x="8" y="13" width="24" height="11" rx="3" fill="#ff9a3c"/>
                            <circle cx="13" cy="38" r="4.5" fill="#ff9a3c"/>
                            <circle cx="35" cy="38" r="4.5" fill="#ff9a3c"/>
                          </svg>
                        </div>
                      )}
                    </div>

                    <div className="up-trip-info">
                      <div className="up-trip-top">
                        <span className="up-trip-title">{trip.title}</span>
                        <span className={`up-trip-status ${status.cls}`}>{status.label}</span>
                      </div>
                      <div className="up-trip-meta">
                        <span>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                          {trip.destination}
                        </span>
                        <span>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                          {trip.startDate}
                        </span>
                        <span className="up-trip-price">₹{trip.price}</span>
                      </div>
                    </div>

                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2"
                      style={{ color:"#b0b0c0", flexShrink:0 }}>
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}