import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "./notificationbell.css";

export default function NotificationBell() {
  const navigate   = useNavigate();
  const [open, setOpen]             = useState(false);
  const [notifs, setNotifs]         = useState([]);
  const [unread, setUnread]         = useState(0);
  const [loading, setLoading]       = useState(false);
  const dropdownRef = useRef(null);

  const user  = JSON.parse(localStorage.getItem("user") || "{}");
  const token = localStorage.getItem("token");

  const fetchNotifs = async () => {
    if (!user?.email || !token) return;
    setLoading(true);
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/notifications/${user.email}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setNotifs(data.notifications || []);
      setUnread(data.unreadCount   || 0);
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  // Poll every 30 seconds for new notifications
  useEffect(() => {
    fetchNotifs();
    const id = setInterval(fetchNotifs, 30_000);
    return () => clearInterval(id);
  }, [user?.email]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleOpen = async () => {
    setOpen(o => !o);
    if (!open && unread > 0) {
      // Mark all as read when opening
      try {
        await fetch(`${process.env.REACT_APP_API_URL}/notifications/${user.email}/read-all`, {
          method:  "PUT",
          headers: { Authorization: `Bearer ${token}` },
        });
        setUnread(0);
        setNotifs(prev => prev.map(n => ({ ...n, read: true })));
      } catch { /* silent */ }
    }
  };

  const handleClear = async () => {
    try {
      await fetch(`${process.env.REACT_APP_API_URL}/notifications/${user.email}`, {
        method:  "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifs([]);
      setUnread(0);
    } catch { /* silent */ }
  };

  const getIcon = (type) => {
    switch (type) {
      case "joined":       return "🎉";
      case "left":         return "👋";
      case "waitlist_spot":return "🔔";
      case "trip_starting":return "🚌";
      default:             return "📢";
    }
  };

  const timeAgo = (date) => {
    const seconds = Math.floor((Date.now() - new Date(date)) / 1000);
    if (seconds < 60)  return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  return (
    <div className="nb-bell-wrap" ref={dropdownRef}>
      {/* Bell button */}
      <button className="nb-bell-btn" onClick={handleOpen} aria-label="Notifications">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 01-3.46 0"/>
        </svg>
        {unread > 0 && (
          <span className="nb-bell-badge">{unread > 9 ? "9+" : unread}</span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="nb-notif-dropdown">
          <div className="nb-notif-header">
            <span className="nb-notif-title">Notifications</span>
            {notifs.length > 0 && (
              <button className="nb-notif-clear" onClick={handleClear}>
                Clear all
              </button>
            )}
          </div>

          <div className="nb-notif-list">
            {loading && notifs.length === 0 ? (
              <div className="nb-notif-empty">
                <div className="nb-notif-spinner" />
              </div>
            ) : notifs.length === 0 ? (
              <div className="nb-notif-empty">
                <span>🔔</span>
                <p>No notifications yet</p>
              </div>
            ) : (
              notifs.map(n => (
                <div key={n._id}
                  className={`nb-notif-item ${!n.read ? "nb-notif-unread" : ""}`}
                  onClick={() => {
                    if (n.tripId) {
                      setOpen(false);
                      navigate(`/viewdetails/${n.tripId}`);
                    }
                  }}
                  style={{ cursor: n.tripId ? "pointer" : "default" }}
                >
                  <span className="nb-notif-icon">{getIcon(n.type)}</span>
                  <div className="nb-notif-body">
                    <p className="nb-notif-msg">{n.message}</p>
                    <span className="nb-notif-time">{timeAgo(n.createdAt)}</span>
                  </div>
                  {!n.read && <span className="nb-notif-dot" />}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
