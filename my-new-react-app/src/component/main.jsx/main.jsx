import React, { useEffect, useState, useRef } from "react";
import "./main.css";
import Middle from "./middle";
import location from "./location.svg";
import magnifyingGlass from "./magnifying.svg";
import user from "./user.svg";

export default function Main() {
  const [trips, setTrips]     = useState([]);
  const [loading, setLoading] = useState(true);
  const tripsRef              = useRef(null);

  useEffect(() => {
    const fetchTrips = async () => {
      try {
        const res = await fetch(`${process.env.REACT_APP_API_URL}/trip`);
        const data = await res.json();
        if (res.ok) setTrips(data.trips || []);
      } catch (err) {
        console.error("Error fetching trips:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchTrips();
  }, []);

  const scrollToTrips = () => {
    tripsRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const today      = new Date();
  const activeTrips = trips.filter((t) => new Date(t.endDate) >= today).length;
  const unis        = new Set(trips.flatMap((t) => t.universities || [])).size;
  const students    = trips.reduce((acc, t) => acc + (t.participants?.length || 0), 0);

  return (
    <div>
      {/* ── HERO ─────────────────────────────────────── */}
      <div className="main-container">
        <div className="hero-eyebrow">
          <span className="hero-dot" />
          Students · Travel · Together
        </div>

        <h1 className="title">Travel Together,<br />Save More</h1>

        <p className="hero-subtitle">
          Connect with fellow university students, share rides,
          split costs, and create unforgettable travel memories.
        </p>

        <button className="button" onClick={scrollToTrips}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          Discover Trips
        </button>

        {/* Live stats — computed from real trip data */}
        <div className="hero-stats">
          <div className="hero-stat">
            <span className="hero-stat-number">{students || "0"}+</span>
            <span className="hero-stat-label">Students</span>
          </div>
          <div className="hero-divider" />
          <div className="hero-stat">
            <span className="hero-stat-number">{activeTrips}</span>
            <span className="hero-stat-label">Active Trips</span>
          </div>
          <div className="hero-divider" />
          <div className="hero-stat">
            <span className="hero-stat-number">{unis || "0"}</span>
            <span className="hero-stat-label">Universities</span>
          </div>
        </div>

        {/* Decorative wave */}
        <div className="hero-wave">
          <svg viewBox="0 0 1440 60" preserveAspectRatio="none"
            xmlns="http://www.w3.org/2000/svg">
            <path
              d="M0,30 C360,60 1080,0 1440,30 L1440,60 L0,60 Z"
              fill="#fff8f0"
            />
          </svg>
        </div>
      </div>

      {/* ── TRIPS SECTION ────────────────────────────── */}
      <div ref={tripsRef} className="trips-section">
        <div className="section-header">
          <div className="section-badge">
            <span className="section-badge-dot" />
            Live Now
          </div>
          <h2 className="section-title">Featured Trips</h2>
          <p className="section-sub">
            Find a ride, join a trip, or create your own and invite your college mates.
          </p>
        </div>

        {loading ? (
          <div className="loading-state">
            <div className="loading-spinner" />
            <p>Finding trips near you…</p>
          </div>
        ) : trips.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 48 48" fill="none">
              <rect x="4" y="17" width="36" height="21" rx="4"
                fill="#ffd4c2" />
              <rect x="8" y="13" width="24" height="11" rx="3"
                fill="#ffd4c2" opacity=".6" />
              <circle cx="13" cy="38" r="4.5" fill="#ffd4c2" />
              <circle cx="35" cy="38" r="4.5" fill="#ffd4c2" />
            </svg>
            <h3>No trips yet</h3>
            <p>Be the first to create a trip and invite your friends!</p>
          </div>
        ) : (
          <Middle trips={trips} />
        )}
      </div>

      {/* ── HOW IT WORKS ─────────────────────────────── */}
      <div className="footer">
        <div className="footer-inner">
          <div className="section-badge" style={{ marginBottom: 14 }}>
            <span className="section-badge-dot" />
            Simple Process
          </div>
          <h1>How It Works</h1>

          <div className="items">
            <div className="step-card">
              <div className="step-icon">
                <img src={magnifyingGlass} alt="Discover Trips" />
              </div>
              <div className="step-num">01</div>
              <h3>Discover Trips</h3>
              <p>Browse trips organised by students from your university or nearby colleges.</p>
            </div>

            <div className="step-connector" />

            <div className="step-card">
              <div className="step-icon">
                <img src={user} alt="Join or Create" />
              </div>
              <div className="step-num">02</div>
              <h3>Join or Create</h3>
              <p>Join existing trips or post your own ride and invite fellow students.</p>
            </div>

            <div className="step-connector" />

            <div className="step-card">
              <div className="step-icon">
                <img src={location} alt="Travel Together" />
              </div>
              <div className="step-num">03</div>
              <h3>Travel Together</h3>
              <p>Enjoy amazing experiences while saving money through group bookings.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
