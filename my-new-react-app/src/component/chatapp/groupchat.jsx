import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "./groupchat.css";

export default function GroupChat() {
  const { tripId } = useParams();
  const navigate   = useNavigate();
  const bottomRef  = useRef(null);
  const wsRef      = useRef(null);
  const typingTimer = useRef(null);
  const tripRef    = useRef(null);

  const [trip, setTrip]         = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState("");
  const [popup, setPopup]       = useState(null);
  const [onlineEmails, setOnlineEmails]   = useState(new Set());
  const [typingNames, setTypingNames]     = useState([]);
  const [isTyping, setIsTyping]           = useState(false);
  const [kickConfirm, setKickConfirm]     = useState(null); // { email, name }

  const user = JSON.parse(localStorage.getItem("user")) || {
    name: "User", email: "unknown", avatar: "",
  };

  const avatarUrl = (src) => {
    if (!src) return "";
    if (src.startsWith("http")) return src;
    return `http://localhost:5000${src}`;
  };

  // ── Load trip ──
  useEffect(() => {
    async function loadTrip() {
      try {
        const res  = await fetch(`http://localhost:5000/trip/${tripId}`);
        const data = await res.json();
        if (!data) throw new Error("Trip not found");

        let freshAvatar = data.organizer?.avatar || "";
        try {
          const token = localStorage.getItem("token");
          const uRes  = await fetch(
            `http://localhost:5000/users/${encodeURIComponent(data.organizer?.email)}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (uRes.ok) {
            const uData = await uRes.json();
            if (uData.avatar) freshAvatar = uData.avatar;
          }
        } catch { /* keep existing avatar on failure */ }

        const rawParticipants = Array.isArray(data.participants) ? data.participants : [];
        const freshParticipants = await Promise.all(
          rawParticipants.map(async (p) => {
            try {
              const tok  = localStorage.getItem("token");
              const pRes = await fetch(
                `http://localhost:5000/users/${encodeURIComponent(p.email)}`,
                { headers: { Authorization: `Bearer ${tok}` } }
              );
              if (pRes.ok) {
                const pData = await pRes.json();
                return { ...p, avatar: pData.avatar || p.avatar };
              }
            } catch { /* keep existing */ }
            return p;
          })
        );

        const tripData = {
          ...data,
          organizer: {
            ...(data.organizer || { name:"Unknown", email:"none", university:"" }),
            avatar: freshAvatar,
          },
          participants: freshParticipants,
          imageUrl: data.imageUrl || "/default.jpg"
        };
        tripRef.current = tripData;
        setTrip(tripData);

        const allowed = data.organizer.email === user.email ||
          data.participants.some(p => p.email === user.email);
        if (!allowed) navigate("/home");
      } catch (err) {
        console.error(err);
        setTrip(null);
      }
    }
    loadTrip();
  }, [tripId]);

  // ── Load message history ──
  useEffect(() => {
    fetch(`http://localhost:5000/messages/${tripId}`)
      .then(r => r.json())
      .then(data => setMessages(data))
      .catch(console.error);
  }, [tripId]);

  // ── Auto-scroll ──
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── WebSocket ──
  useEffect(() => {
    const ws = new WebSocket("ws://localhost:5000");
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: "USER_ONLINE",
        tripId,
        email: user.email,
        name:  user.name,
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (!msg.type && msg.tripId === tripId) {
          setMessages(prev => [...prev, msg]);
          return;
        }

        switch (msg.type) {
          case "ONLINE_USERS":
            setOnlineEmails(new Set(msg.emails));
            break;

          case "TYPING_START":
            if (msg.tripId === tripId && msg.email !== user.email) {
              setTypingNames(prev =>
                prev.includes(msg.name) ? prev : [...prev, msg.name]
              );
            }
            break;

          case "TYPING_STOP":
            if (msg.tripId === tripId) {
              setTypingNames(prev => prev.filter(n => n !== msg.name));
            }
            break;

          case "PARTICIPANT_UPDATE":
          case "USER_EXIT": {
            if (msg.tripId !== tripId) break;
            const updated = {
              ...tripRef.current,
              participants: msg.participants,
            };
            tripRef.current = updated;
            setTrip(updated);

            // If current user was kicked, redirect them
            if (
              msg.type === "USER_EXIT" &&
              msg.kickedEmail === user.email
            ) {
              navigate("/home");
              return;
            }

            const isJoin = msg.type === "PARTICIPANT_UPDATE";
            const systemMsg = {
              tripId,
              sender:   "system",
              email:    "system",
              avatar:   "",
              text:     isJoin
                ? `${msg.userName || "Someone"} joined the trip 🎉`
                : `${msg.userName || "Someone"} left the trip`,
              time:     new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" }),
              isSystem: true,
            };
            setMessages(prev => [...prev, systemMsg]);
            break;
          }

          default:
            if (msg.tripId === tripId && msg.text) {
              setMessages(prev => [...prev, msg]);
            }
        }
      } catch (err) { console.error(err); }
    };

    ws.onclose = () => console.log("WebSocket closed");

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "USER_OFFLINE",
          tripId,
          email: user.email,
          name:  user.name,
        }));
      }
      ws.close();
    };
  }, [tripId]);

  // ── Send message ──
  const sendMessage = () => {
    if (!input.trim() || !wsRef.current) return;

    clearTimeout(typingTimer.current);
    wsRef.current.send(JSON.stringify({
      type: "TYPING_STOP", tripId, email: user.email, name: user.name,
    }));
    setIsTyping(false);

    const newMsg = {
      tripId,
      sender: user.name,
      email:  user.email,
      avatar: avatarUrl(user.avatar),
      text:   input,
      time:   new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" }),
    };
    wsRef.current.send(JSON.stringify(newMsg));
    setInput("");
  };

  // ── Typing detection ──
  const handleInputChange = (e) => {
    setInput(e.target.value);
    if (!wsRef.current) return;

    if (!isTyping) {
      setIsTyping(true);
      wsRef.current.send(JSON.stringify({
        type: "TYPING_START", tripId, email: user.email, name: user.name,
      }));
    }

    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      setIsTyping(false);
      wsRef.current?.send(JSON.stringify({
        type: "TYPING_STOP", tripId, email: user.email, name: user.name,
      }));
    }, 2000);
  };

  // ── Profile popup ──
  const handleAvatarClick = (e, email, name, avatar, university, isHost) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setPopup({
      person: { email, name, avatar, university, isHost },
      viewerIsHost: trip?.organizer?.email === user.email,
      x: Math.min(rect.left, window.innerWidth  - 225),
      y: Math.min(rect.bottom + 8, window.innerHeight - 230),
    });
  };

  const goToProfile = () => {
    if (!popup) return;
    setPopup(null);
    if (popup.person.email === user.email) {
      navigate("/profile/1");
    } else {
      navigate(`/user/${encodeURIComponent(popup.person.email)}`);
    }
  };

  // ── Kick participant ──
  const promptKick = () => {
    if (!popup) return;
    const { email, name } = popup.person;
    setPopup(null);
    setKickConfirm({ email, name });
  };

  const confirmKick = async () => {
    if (!kickConfirm) return;
    const emailToKick = kickConfirm.email;
    const nameToKick  = kickConfirm.name;
    setKickConfirm(null);

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`http://localhost:5000/trip/${tripId}/kick`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: emailToKick }),
      });
      if (!res.ok) throw new Error("Kick failed");

      // Inject a system message locally (WS broadcast will also do it for others)
      const systemMsg = {
        tripId,
        sender:   "system",
        email:    "system",
        avatar:   "",
        text:     `${nameToKick} was removed from the trip by the host.`,
        time:     new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" }),
        isSystem: true,
      };
      setMessages(prev => [...prev, systemMsg]);
    } catch (err) {
      console.error("Failed to kick participant:", err);
    }
  };

  // ── Helpers ──
  const initials = (name = "") =>
    name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) || "?";

  const COLORS   = ["#7c3aed","#0ea5e9","#10b981","#f43f5e","#f59e0b","#6366f1"];
  const colorFor = (name = "") => COLORS[(name.charCodeAt(0) || 0) % COLORS.length];

  if (trip === null) return <div className="gc-loading-text">Loading chat...</div>;
  if (!trip)         return <div className="gc-loading-text">Trip not found.</div>;

  const viewerIsHost = trip.organizer?.email === user.email;

  return (
    <div className="gc-page" onClick={() => setPopup(null)}>

      {/* ── Kick confirmation modal ── */}
      {kickConfirm && (
        <div className="gc-modal-overlay" onClick={() => setKickConfirm(null)}>
          <div className="gc-modal" onClick={e => e.stopPropagation()}>
            <div className="gc-modal-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2">
                <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <line x1="17" y1="8" x2="23" y2="14"/>
                <line x1="23" y1="8" x2="17" y2="14"/>
              </svg>
            </div>
            <h3 className="gc-modal-title">Remove Participant?</h3>
            <p className="gc-modal-body">
              Are you sure you want to remove <strong>{kickConfirm.name}</strong> from this trip?
              They will lose access to the group chat immediately.
            </p>
            <div className="gc-modal-actions">
              <button className="gc-modal-btn gc-modal-cancel"
                onClick={() => setKickConfirm(null)}>
                Cancel
              </button>
              <button className="gc-modal-btn gc-modal-confirm" onClick={confirmKick}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5">
                  <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <line x1="17" y1="8" x2="23" y2="14"/>
                  <line x1="23" y1="8" x2="17" y2="14"/>
                </svg>
                Yes, Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Profile popup ── */}
      {popup && (
        <div
          className="gc-popup"
          style={{ top: popup.y, left: popup.x }}
          onClick={e => e.stopPropagation()}
        >
          <div className="gc-popup-arrow" />
          <div className="gc-popup-header">
            {popup.person.avatar ? (
              <img
                src={avatarUrl(popup.person.avatar)}
                className="gc-popup-avatar" alt={popup.person.name}
              />
            ) : (
              <div className="gc-popup-avatar-init"
                style={{ background: colorFor(popup.person.name) }}>
                {initials(popup.person.name)}
              </div>
            )}
            <div className="gc-popup-info">
              <span className="gc-popup-name">{popup.person.name}</span>
              <span className="gc-popup-uni">{popup.person.university || "—"}</span>
              {popup.person.isHost && (
                <span className="gc-popup-host-badge">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                  </svg>
                  Trip Host
                </span>
              )}
              {popup.person.email === user.email && (
                <span className="gc-popup-you-badge">You</span>
              )}
              {onlineEmails.has(popup.person.email) && (
                <span className="gc-popup-online-badge">
                  <span className="gc-popup-online-dot" />Online
                </span>
              )}
            </div>
          </div>
          <div className="gc-popup-actions">
            <button className="gc-popup-btn gc-popup-btn-primary" onClick={goToProfile}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              View Profile
            </button>

            {/* Kick button — only for host, not on self, not on other host */}
            {popup.viewerIsHost &&
             popup.person.email !== user.email &&
             !popup.person.isHost && (
              <button className="gc-popup-btn gc-popup-btn-kick" onClick={promptKick}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5">
                  <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <line x1="17" y1="8" x2="23" y2="14"/>
                  <line x1="23" y1="8" x2="17" y2="14"/>
                </svg>
                Remove from Trip
              </button>
            )}

            <button className="gc-popup-btn gc-popup-btn-secondary"
              onClick={() => setPopup(null)}>Close</button>
          </div>
        </div>
      )}

      {/* Back button */}
      <button className="gc-back-btn" onClick={() => navigate("/home")}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Back to Trips
      </button>

      <div className="gc-layout">

        {/* ══ LEFT — Chat panel ══ */}
        <div className="gc-chat-panel">

          {/* Header */}
          <div className="gc-chat-header">
            <img className="gc-header-img" src={trip.imageUrl} alt="trip" />
            <div className="gc-header-info">
              <h2>{trip.title}</h2>
              <p>
                <span className="gc-online-dot" />
                {trip.destination} &nbsp;·&nbsp; {trip.startDate}–{trip.endDate}
                &nbsp;·&nbsp; {trip.participants.length} participants
              </p>
            </div>
            <div className="gc-header-pill">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
              </svg>
              {trip.participants.length}/{trip.maxParticipants}
            </div>
          </div>

          {/* Welcome banner */}
          <div className="gc-welcome-banner">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
            </svg>
            {viewerIsHost
              ? "You're the host — tap any participant to manage them"
              : "Tap any avatar to view profile"}
          </div>

          {/* Messages */}
          <div className="gc-messages">
            {messages.map((msg, index) => {
              const isSelf = msg.email === user.email;
              const isHost = trip.organizer?.email === msg.email;

              if (msg.isSystem) {
                return (
                  <div key={index} className="gc-system-msg">
                    <span className="gc-system-text">{msg.text}</span>
                  </div>
                );
              }

              return (
                <div key={index} className={`gc-msg-row ${isSelf ? "gc-self" : ""}`}>
                  {!isSelf && (
                    <button className="gc-avatar-btn"
                      onClick={e => handleAvatarClick(e, msg.email, msg.sender,
                        msg.avatar, "", isHost)}>
                      {msg.avatar ? (
                        <img className="gc-avatar" src={avatarUrl(msg.avatar)} alt={msg.sender} />
                      ) : (
                        <div className="gc-avatar gc-avatar-init"
                          style={{ background: colorFor(msg.sender) }}>
                          {initials(msg.sender)}
                        </div>
                      )}
                      {onlineEmails.has(msg.email) && (
                        <span className="gc-avatar-online-dot" />
                      )}
                    </button>
                  )}

                  <div className={`gc-msg-body ${isSelf ? "gc-msg-body-self" : ""}`}>
                    <div className={`gc-msg-meta ${isSelf ? "gc-msg-meta-self" : ""}`}>
                      <button className="gc-sender-name-btn"
                        onClick={e => handleAvatarClick(e, msg.email, msg.sender,
                          msg.avatar, "", isHost)}>
                        {isSelf ? "You" : msg.sender}
                      </button>
                      <span>{msg.time}</span>
                    </div>
                    <div className={`gc-bubble ${isSelf ? "gc-bubble-self" : ""}`}>
                      {msg.text}
                    </div>
                  </div>

                  {isSelf && (
                    <button className="gc-avatar-btn"
                      onClick={e => handleAvatarClick(e, msg.email, msg.sender,
                        msg.avatar, user.university, false)}>
                      {msg.avatar ? (
                        <img className="gc-avatar" src={avatarUrl(msg.avatar)} alt={msg.sender} />
                      ) : (
                        <div className="gc-avatar gc-avatar-init"
                          style={{ background: colorFor(msg.sender) }}>
                          {initials(msg.sender)}
                        </div>
                      )}
                    </button>
                  )}
                </div>
              );
            })}

            {/* Typing indicator */}
            {typingNames.length > 0 && (
              <div className="gc-typing-row">
                <div className="gc-typing-bubble">
                  <span className="gc-typing-dot" style={{ animationDelay: "0ms" }} />
                  <span className="gc-typing-dot" style={{ animationDelay: "160ms" }} />
                  <span className="gc-typing-dot" style={{ animationDelay: "320ms" }} />
                </div>
                <span className="gc-typing-label">
                  {typingNames.length === 1
                    ? `${typingNames[0]} is typing…`
                    : typingNames.length === 2
                    ? `${typingNames[0]} and ${typingNames[1]} are typing…`
                    : `${typingNames[0]} and ${typingNames.length - 1} others are typing…`}
                </span>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="gc-input-area">
            <input className="gc-input" type="text"
              placeholder="Type your message…"
              value={input}
              onChange={handleInputChange}
              onKeyDown={e => e.key === "Enter" && sendMessage()}
            />
            <button className="gc-send-btn" onClick={sendMessage}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke="white" strokeWidth="2.5">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>

        {/* ══ RIGHT — Participants panel ══ */}
        <div className="gc-participants-panel">
          <div className="gc-panel-header">
            <h3>Participants</h3>
            <span className="gc-count-badge">
              {trip.participants.length}/{trip.maxParticipants}
            </span>
          </div>

          {onlineEmails.size > 0 && (
            <div className="gc-online-strip">
              <span className="gc-online-strip-dot" />
              {onlineEmails.size} online now
            </div>
          )}

          <div className="gc-participants-list">
            {/* Organizer */}
            <div className="gc-participant gc-participant-clickable"
              onClick={e => handleAvatarClick(e,
                trip.organizer.email, trip.organizer.name,
                trip.organizer.avatar, trip.organizer.university, true)}>
              <div className="gc-avatar-wrap-rel">
                {trip.organizer.avatar ? (
                  <img className="gc-avatar"
                    src={avatarUrl(trip.organizer.avatar)}
                    alt={trip.organizer.name} />
                ) : (
                  <div className="gc-circle-avatar"
                    style={{ background: colorFor(trip.organizer.name) }}>
                    {trip.organizer.name?.[0]?.toUpperCase() || "?"}
                  </div>
                )}
                {onlineEmails.has(trip.organizer.email) && (
                  <span className="gc-participant-online-dot" />
                )}
              </div>
              <div className="gc-participant-info">
                <div className="gc-participant-name">
                  {trip.organizer.name}
                  <span className="gc-host-badge">Host</span>
                </div>
                <p className="gc-uni">{trip.organizer.university}</p>
              </div>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2"
                style={{ color:"#b0b0c0", flexShrink:0 }}>
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </div>

            {/* Participants */}
            {trip.participants.map((p, i) => (
              <div key={i} className="gc-participant gc-participant-clickable"
                onClick={e => handleAvatarClick(e,
                  p.email, p.name, p.avatar, p.university, false)}>
                <div className="gc-avatar-wrap-rel">
                  {p.avatar ? (
                    <img className="gc-avatar"
                      src={avatarUrl(p.avatar)} alt={p.name} />
                  ) : (
                    <div className="gc-circle-avatar"
                      style={{ background: colorFor(p.name) }}>
                      {p.name?.[0]?.toUpperCase() || "?"}
                    </div>
                  )}
                  {onlineEmails.has(p.email) && (
                    <span className="gc-participant-online-dot" />
                  )}
                </div>
                <div className="gc-participant-info">
                  <div className="gc-participant-name">
                    {p.name}
                    {p.email === user.email && (
                      <span className="gc-you-badge">You</span>
                    )}
                  </div>
                  <p className="gc-uni">{p.university || "Student"}</p>
                </div>

                {/* Show kick icon in participant list if viewer is host */}
                {viewerIsHost && p.email !== user.email ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="#fca5a5" strokeWidth="2"
                    style={{ flexShrink:0 }}
                    title="Click to remove">
                    <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <line x1="17" y1="8" x2="23" y2="14"/>
                    <line x1="23" y1="8" x2="17" y2="14"/>
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2"
                    style={{ color:"#b0b0c0", flexShrink:0 }}>
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                )}
              </div>
            ))}
          </div>

          <div className="gc-trip-strip">
            <div className="gc-strip-row">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              {trip.destination}
            </div>
            <div className="gc-strip-row">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              {trip.startDate} – {trip.endDate}
            </div>
            <div className="gc-strip-row">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="1" x2="12" y2="23"/>
                <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
              </svg>
              ₹{trip.price} / seat
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}