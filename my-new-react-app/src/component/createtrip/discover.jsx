import React, { useState, useEffect, useMemo } from "react";
import "./discover.css";
import { useNavigate } from "react-router-dom";

function AvatarFallback({ name = "" }) {
  const initials = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  const colors   = ["#7c3aed","#0ea5e9","#10b981","#f43f5e","#f59e0b","#6366f1"];
  const bg       = colors[name.charCodeAt(0) % colors.length] || "#ff6b35";
  return <div className="dc-avatar-init" style={{ background: bg }}>{initials || "?"}</div>;
}

// Prevents double-prefix: Google photos start with https, local paths get prefixed
const avatarUrl = (src) => {
  if (!src) return "";
  if (src.startsWith("http")) return src;
  return `${process.env.REACT_APP_API_URL}${src}`;
};

function StarRating({ rating, count }) {
  if (!rating) return null;
  return (
    <span className="dc-rating">
      ★ {rating.toFixed(1)}
      {count > 0 && <span className="dc-rating-count">({count})</span>}
    </span>
  );
}

function getTripStatus(startDate, endDate) {
  const today = new Date().toISOString().split("T")[0];
  if (endDate < today)   return "ended";
  if (startDate <= today) return "active";
  return "upcoming";
}

export default function Discover() {
  const navigate = useNavigate();

  const [trips, setTrips]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [imgErrors, setImgErrors] = useState({});

  // ── Filter state ──
  const [search, setSearch]         = useState("");
  const [statusFilter, setStatus]   = useState("all");     // all | upcoming | active | ended
  const [sortBy, setSort]           = useState("newest");  // newest | price-asc | price-desc | seats
  const [maxPrice, setMaxPrice]     = useState("");
  const [minSeats, setMinSeats]     = useState("");
  const [uniFilter, setUni]         = useState("");
  const [dateFrom, setDateFrom]     = useState("");
  const [dateTo, setDateTo]         = useState("");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    fetch(`${process.env.REACT_APP_API_URL}/get-trips`)
      .then(r => r.json())
      .then(data => { setTrips(data.trips || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // All unique universities from trips
  const allUnis = useMemo(() => {
    const set = new Set();
    trips.forEach(t => (t.universities || []).forEach(u => set.add(u)));
    return [...set].sort();
  }, [trips]);

  const currentUser = JSON.parse(localStorage.getItem("user") || "{}");

  // ── Apply filters ──
  const filtered = useMemo(() => {
    let list = [...trips];

    // Text search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.destination.toLowerCase().includes(q) ||
        (t.universities || []).some(u => u.toLowerCase().includes(q))
      );
    }

    // Status
    if (statusFilter !== "all") {
      list = list.filter(t => getTripStatus(t.startDate, t.endDate) === statusFilter);
    }

    // Max price
    if (maxPrice !== "") {
      list = list.filter(t => t.price <= Number(maxPrice));
    }

    // Min seats left
    if (minSeats !== "") {
      list = list.filter(t => (t.maxParticipants - t.participants.length) >= Number(minSeats));
    }

    // University
    if (uniFilter) {
      list = list.filter(t => (t.universities || []).some(u =>
        u.toLowerCase().includes(uniFilter.toLowerCase())
      ));
    }

    // Date range
    if (dateFrom) list = list.filter(t => t.startDate >= dateFrom);
    if (dateTo)   list = list.filter(t => t.endDate   <= dateTo);

    // Sort
    switch (sortBy) {
      case "price-asc":  list.sort((a, b) => a.price - b.price); break;
      case "price-desc": list.sort((a, b) => b.price - a.price); break;
      case "seats":      list.sort((a, b) =>
        (b.maxParticipants - b.participants.length) -
        (a.maxParticipants - a.participants.length)); break;
      case "rating":     list.sort((a, b) =>
        (b.organizer?.avgRating || 0) - (a.organizer?.avgRating || 0)); break;
      default: /* newest — already sorted by backend */ break;
    }

    return list;
  }, [trips, search, statusFilter, sortBy, maxPrice, minSeats, uniFilter, dateFrom, dateTo]);

  const activeFilterCount = [
    statusFilter !== "all", maxPrice !== "", minSeats !== "",
    uniFilter !== "", dateFrom !== "", dateTo !== ""
  ].filter(Boolean).length;

  const resetFilters = () => {
    setStatus("all"); setSort("newest"); setMaxPrice("");
    setMinSeats(""); setUni(""); setDateFrom(""); setDateTo("");
  };

  return (
    <div className="dc-page">

      {/* ── Page header ── */}
      <div className="dc-header">
        <div className="dc-header-inner">
          <div className="dc-page-badge">
            <span className="dc-badge-dot" />Discover Trips
          </div>
          <h1 className="dc-page-title">Find Your Next Adventure</h1>
          <p className="dc-page-sub">
            Browse trips from students across all universities — filter by price, dates, seats and more.
          </p>
        </div>
      </div>

      <div className="dc-body">

        {/* ── Search + Filter bar ── */}
        <div className="dc-toolbar">
          {/* Search input */}
          <div className="dc-search-wrap">
            <svg className="dc-search-icon" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              className="dc-search-input"
              type="text"
              placeholder="Search by title, destination or university…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className="dc-search-clear" onClick={() => setSearch("")}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            )}
          </div>

          {/* Sort dropdown */}
          <select className="dc-select" value={sortBy} onChange={e => setSort(e.target.value)}>
            <option value="newest">Newest first</option>
            <option value="price-asc">Price: Low → High</option>
            <option value="price-desc">Price: High → Low</option>
            <option value="seats">Most seats left</option>
            <option value="rating">Top rated hosts</option>
          </select>

          {/* Filter toggle */}
          <button
            className={`dc-filter-btn ${showFilters ? "dc-filter-btn-active" : ""}`}
            onClick={() => setShowFilters(f => !f)}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5">
              <line x1="4" y1="6" x2="20" y2="6"/>
              <line x1="8" y1="12" x2="16" y2="12"/>
              <line x1="11" y1="18" x2="13" y2="18"/>
            </svg>
            Filters
            {activeFilterCount > 0 && (
              <span className="dc-filter-count">{activeFilterCount}</span>
            )}
          </button>
        </div>

        {/* ── Expanded filter panel ── */}
        {showFilters && (
          <div className="dc-filter-panel">
            <div className="dc-filter-grid">

              {/* Status */}
              <div className="dc-filter-group">
                <label className="dc-filter-label">Status</label>
                <div className="dc-status-tabs">
                  {["all","upcoming","active","ended"].map(s => (
                    <button key={s}
                      className={`dc-status-tab ${statusFilter === s ? "dc-status-active" : ""}`}
                      onClick={() => setStatus(s)}>
                      {s === "all" ? "All" : s === "upcoming" ? "Upcoming" : s === "active" ? "In Progress" : "Ended"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Max price */}
              <div className="dc-filter-group">
                <label className="dc-filter-label">Max Price (₹)</label>
                <input className="dc-filter-input" type="number"
                  placeholder="e.g. 5000" min="0"
                  value={maxPrice} onChange={e => setMaxPrice(e.target.value)} />
              </div>

              {/* Min seats */}
              <div className="dc-filter-group">
                <label className="dc-filter-label">Min Seats Available</label>
                <input className="dc-filter-input" type="number"
                  placeholder="e.g. 2" min="1"
                  value={minSeats} onChange={e => setMinSeats(e.target.value)} />
              </div>

              {/* University */}
              <div className="dc-filter-group">
                <label className="dc-filter-label">University</label>
                {allUnis.length > 0 ? (
                  <select className="dc-filter-input"
                    value={uniFilter} onChange={e => setUni(e.target.value)}>
                    <option value="">All universities</option>
                    {allUnis.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                ) : (
                  <input className="dc-filter-input" type="text"
                    placeholder="e.g. DIT University"
                    value={uniFilter} onChange={e => setUni(e.target.value)} />
                )}
              </div>

              {/* Date from */}
              <div className="dc-filter-group">
                <label className="dc-filter-label">Start Date From</label>
                <input className="dc-filter-input" type="date"
                  value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
              </div>

              {/* Date to */}
              <div className="dc-filter-group">
                <label className="dc-filter-label">End Date Before</label>
                <input className="dc-filter-input" type="date"
                  value={dateTo} onChange={e => setDateTo(e.target.value)} />
              </div>
            </div>

            {activeFilterCount > 0 && (
              <button className="dc-reset-btn" onClick={resetFilters}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/>
                </svg>
                Reset all filters
              </button>
            )}
          </div>
        )}

        {/* ── Results count ── */}
        <div className="dc-results-bar">
          <span className="dc-results-count">
            {loading ? "Loading…" : `${filtered.length} trip${filtered.length !== 1 ? "s" : ""} found`}
          </span>
          {activeFilterCount > 0 && (
            <button className="dc-clear-link" onClick={resetFilters}>Clear filters</button>
          )}
        </div>

        {/* ── Trip grid ── */}
        {loading ? (
          <div className="dc-loading">
            <div className="dc-spinner" />
            <p>Finding trips…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="dc-empty">
            <svg viewBox="0 0 48 48" fill="none">
              <rect x="4" y="17" width="36" height="21" rx="4" fill="#ffd4c2"/>
              <rect x="8" y="13" width="24" height="11" rx="3" fill="#ffd4c2" opacity=".6"/>
              <circle cx="13" cy="38" r="4.5" fill="#ffd4c2"/>
              <circle cx="35" cy="38" r="4.5" fill="#ffd4c2"/>
            </svg>
            <h3>No trips match your filters</h3>
            <p>Try adjusting the filters or search with different keywords.</p>
            <button className="dc-empty-btn" onClick={resetFilters}>Reset Filters</button>
          </div>
        ) : (
          <div className="dc-grid">
            {filtered.map((trip, idx) => {
              const joined    = trip.participants?.some(p => p.email === currentUser?.email);
              const isFull    = trip.participants.length >= trip.maxParticipants;
              const seatsLeft = trip.maxParticipants - trip.participants.length;
              const fillPct   = Math.min(100, Math.round(
                (trip.participants.length / trip.maxParticipants) * 100
              ));
              const status    = getTripStatus(trip.startDate, trip.endDate);

              return (
                <div key={trip._id} className="dc-card"
                  style={{ animationDelay: `${idx * 0.05}s` }}
                  onClick={() => navigate(`/viewdetails/${trip._id}`)}>

                  {/* Image */}
                  <div className="dc-card-img-wrap">
                    {trip.imageUrl ? (
                      <img src={trip.imageUrl}
                        className="dc-card-img" alt={trip.title}
                        onError={e => { e.target.style.display = "none"; }} />
                    ) : (
                      <div className="dc-card-img-ph">
                        <svg viewBox="0 0 48 48" fill="none" style={{width:48,opacity:.25}}>
                          <rect x="4" y="17" width="36" height="21" rx="4" fill="#ff9a3c"/>
                          <rect x="8" y="13" width="24" height="11" rx="3" fill="#ff9a3c"/>
                          <circle cx="13" cy="38" r="4.5" fill="#ff9a3c"/>
                          <circle cx="35" cy="38" r="4.5" fill="#ff9a3c"/>
                        </svg>
                      </div>
                    )}

                    {/* Status pill on image */}
                    <div className={`dc-status-pill ${
                      status === "upcoming" ? "dc-pill-upcoming" :
                      status === "active"   ? "dc-pill-active"   : "dc-pill-ended"
                    }`}>
                      {status === "upcoming" ? "Upcoming" :
                       status === "active"   ? "In Progress" : "Ended"}
                    </div>

                    {/* Joined badge */}
                    {joined && <div className="dc-joined-badge">✓ Joined</div>}
                  </div>

                  {/* Body */}
                  <div className="dc-card-body">
                    <h2 className="dc-card-title">{trip.title}</h2>

                    <div className="dc-card-meta">
                      <span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                        {trip.destination}
                      </span>
                      <span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        {trip.startDate}{trip.startDate !== trip.endDate && ` – ${trip.endDate}`}
                      </span>
                    </div>

                    {/* Organizer */}
                    <div className="dc-organizer">
                      {trip.organizer?.avatar && !imgErrors[trip._id] ? (
                        <img src={avatarUrl(trip.organizer.avatar)}
                          className="dc-organizer-img" alt={trip.organizer.name}
                          onError={() => setImgErrors(prev => ({ ...prev, [trip._id]: true }))} />
                      ) : (
                        <AvatarFallback name={trip.organizer?.name} />
                      )}
                      <span className="dc-organizer-name">{trip.organizer?.name}</span>
                      <StarRating
                        rating={trip.organizer?.avgRating}
                        count={trip.organizer?.ratingCount}
                      />
                    </div>

                    {/* Seat progress */}
                    <div className="dc-progress-wrap">
                      <div className="dc-progress-bar">
                        <div className={`dc-progress-fill ${
                          isFull ? "dc-fill-red" :
                          fillPct >= 70 ? "dc-fill-amber" : ""
                        }`} style={{ width: `${fillPct}%` }} />
                      </div>
                      <span className="dc-seats-text">
                        {isFull ? "Full" : `${seatsLeft} left`}
                      </span>
                    </div>

                    {/* Price + CTA */}
                    <div className="dc-card-footer">
                      <span className="dc-price">
                        ₹{trip.price}<span className="dc-per-seat">/seat</span>
                      </span>
                      <button className="dc-cta-btn"
                        onClick={e => { e.stopPropagation(); navigate(`/viewdetails/${trip._id}`); }}>
                        {joined ? "View Trip" : isFull ? "Full" : "View Details"}
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M5 12h14M12 5l7 7-7 7"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}