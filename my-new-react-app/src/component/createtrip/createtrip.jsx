import React, { useState, useRef } from "react";
import "./createtrip.css";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Moves the map view when search result comes in
function MapFlyTo({ center }) {
  const map = useMapEvents({});
  React.useEffect(() => {
    if (center) map.flyTo(center, 13, { duration: 1.2 });
  }, [center]);
  return null;
}

// Click-to-pin on map
function LocationPicker({ onPick }) {
  useMapEvents({ click(e) { onPick(e.latlng.lat, e.latlng.lng); } });
  return null;
}

export default function CreateTrip() {
  const [tripData, setTripData] = useState({
    title: "", destination: "", startDate: "", endDate: "",
    price: "", maxParticipants: "", universities: "", description: "",
    imageUrl: "", latitude: 20.5937, longitude: 78.9629,
  });

  const [imageFile, setImageFile]     = useState(null);
  const [previewUrl, setPreviewUrl]   = useState("");
  const [uploading, setUploading]     = useState(false);
  const [error, setError]             = useState("");
  const [success, setSuccess]         = useState("");

  // Location search state
  const [searchQuery, setSearchQuery]       = useState("");
  const [searchResults, setSearchResults]   = useState([]);
  const [searchLoading, setSearchLoading]   = useState(false);
  const [flyTarget, setFlyTarget]           = useState(null);
  const searchDebounce                      = useRef(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setTripData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setError("");
  };

  const handleMapClick = (lat, lng) => {
    setTripData(prev => ({ ...prev, latitude: lat, longitude: lng }));
    setSearchResults([]);
  };

  // Nominatim search (OpenStreetMap, free, no API key)
  const handleSearchChange = (e) => {
    const q = e.target.value;
    setSearchQuery(q);
    clearTimeout(searchDebounce.current);
    if (!q.trim()) { setSearchResults([]); return; }

    searchDebounce.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5`,
          { headers: { "Accept-Language": "en" } }
        );
        const data = await res.json();
        setSearchResults(data);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 400);
  };

  const handleSelectResult = (result) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    setTripData(prev => ({ ...prev, latitude: lat, longitude: lng }));
    setFlyTarget([lat, lng]);
    setSearchQuery(result.display_name.split(",").slice(0, 3).join(","));
    setSearchResults([]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setSuccess("");

    if (!tripData.title || !tripData.destination || !tripData.startDate ||
        !tripData.endDate || !tripData.price || !tripData.maxParticipants ||
        !tripData.universities || !tripData.description || !imageFile) {
      setError("Please fill all fields and upload a trip image.");
      return;
    }
    if (new Date(tripData.endDate) < new Date(tripData.startDate)) {
      setError("End date cannot be before start date."); return;
    }

    const user  = JSON.parse(localStorage.getItem("user"));
    const token = localStorage.getItem("token");
    if (!user || !token) { alert("Please login first."); return; }

    setUploading(true);
    let uploadedImageUrl = tripData.imageUrl;

    try {
      const formData = new FormData();
      formData.append("image", imageFile);
      const uploadRes  = await fetch(`${process.env.REACT_APP_API_URL}/upload-trip-image`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formData,
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error || "Image upload failed");
      uploadedImageUrl = uploadData.imageUrl;

      const finalData = {
        ...tripData, imageUrl: uploadedImageUrl,
        universities: tripData.universities.split(",").map(u => u.trim()).filter(Boolean),
        organizer: { name: user.name, university: user.university, email: user.email, avatar: user.avatar },
      };

      const res  = await fetch(`${process.env.REACT_APP_API_URL}/create-trip`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(finalData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create trip");

      setSuccess("Trip created successfully!");
      setTripData({ title:"", destination:"", startDate:"", endDate:"", price:"",
        maxParticipants:"", universities:"", description:"", imageUrl:"",
        latitude: 20.5937, longitude: 78.9629 });
      setImageFile(null); setPreviewUrl(""); setSearchQuery("");
      setTimeout(() => setSuccess(""), 4000);
    } catch (err) {
      setError(err.message || "Failed to connect to backend");
    } finally {
      setUploading(false);
    }
  };

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="ct-page">
      <div className="ct-page-header">
        <div className="ct-page-badge"><span className="ct-badge-dot" />Campus Rides</div>
        <h1 className="ct-page-title">Create a New Trip</h1>
        <p className="ct-page-sub">Fill in the details below to post your trip and invite fellow students.</p>
      </div>

      {error   && <div className="ct-feedback ct-feedback-error">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>{error}</div>}
      {success && <div className="ct-feedback ct-feedback-success">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>{success}</div>}

      <form className="ct-form" onSubmit={handleSubmit}>

        {/* SECTION 1: Basic Info */}
        <div className="ct-section">
          <div className="ct-section-label">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            Basic Info
          </div>
          <div className="ct-field">
            <label className="ct-label">Trip Title</label>
            <input className="ct-input" type="text" name="title" value={tripData.title}
              onChange={handleChange} placeholder="e.g., Weekend Trek to Rishikesh" required />
          </div>
          <div className="ct-field">
            <label className="ct-label">Destination</label>
            <div className="ct-input-icon-wrap">
              <svg className="ct-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
              <input className="ct-input ct-input-with-icon" type="text" name="destination"
                value={tripData.destination} onChange={handleChange}
                placeholder="e.g., Manali, Himachal Pradesh" required />
            </div>
          </div>
        </div>

        {/* SECTION 2: Trip Image */}
        <div className="ct-section">
          <div className="ct-section-label">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            Trip Image
          </div>
          <label className="ct-file-zone">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/></svg>
            <span>{imageFile ? imageFile.name : "Click to upload a trip photo"}</span>
            <em>{imageFile ? "Ready" : "JPG, PNG, WEBP — max 5MB"}</em>
            <input type="file" accept="image/*" onChange={handleFileChange} style={{display:"none"}} required />
          </label>
          {previewUrl && (
            <div className="ct-preview-wrap">
              <img src={previewUrl} alt="Preview" className="ct-preview-img" />
              <div className="ct-preview-badge">Preview</div>
            </div>
          )}
        </div>

        {/* SECTION 3: Dates & Numbers */}
        <div className="ct-section">
          <div className="ct-section-label">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Dates &amp; Numbers
          </div>
          <div className="ct-row">
            <div className="ct-col">
              <label className="ct-label">Start Date</label>
              <input className="ct-input" type="date" name="startDate" value={tripData.startDate}
                onChange={handleChange} min={today} required />
            </div>
            <div className="ct-col">
              <label className="ct-label">End Date</label>
              <input className="ct-input" type="date" name="endDate" value={tripData.endDate}
                onChange={handleChange} min={tripData.startDate || today} required />
            </div>
          </div>
          <div className="ct-row">
            <div className="ct-col">
              <label className="ct-label">Price Per Person (₹)</label>
              <div className="ct-input-icon-wrap">
                <svg className="ct-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
                <input className="ct-input ct-input-with-icon" type="number" name="price"
                  value={tripData.price} onChange={handleChange} placeholder="e.g., 2500" min="0" required />
              </div>
            </div>
            <div className="ct-col">
              <label className="ct-label">Max Participants</label>
              <div className="ct-input-icon-wrap">
                <svg className="ct-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
                <input className="ct-input ct-input-with-icon" type="number" name="maxParticipants"
                  value={tripData.maxParticipants} onChange={handleChange} placeholder="e.g., 10" min="2" required />
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 4: Community */}
        <div className="ct-section">
          <div className="ct-section-label">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
            Community
          </div>
          <div className="ct-field">
            <label className="ct-label">Universities (comma-separated)</label>
            <input className="ct-input" type="text" name="universities" value={tripData.universities}
              onChange={handleChange} placeholder="e.g., DIT University, Graphic Era, Uttaranchal University" required />
            {tripData.universities && (
              <div className="ct-tag-preview">
                {tripData.universities.split(",").map((u,i) => u.trim() ? <span key={i} className="ct-tag">{u.trim()}</span> : null)}
              </div>
            )}
          </div>
          <div className="ct-field">
            <label className="ct-label">Trip Description</label>
            <textarea className="ct-textarea" name="description" value={tripData.description}
              onChange={handleChange} placeholder="Describe what makes this trip special…" required />
          </div>
        </div>

        {/* SECTION 5: Map Location with Search */}
        <div className="ct-section">
          <div className="ct-section-label">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
            Trip Location
          </div>

          {/* Search bar */}
          <div className="ct-search-wrap">
            <div className="ct-search-input-row">
              <svg className="ct-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <input
                className="ct-input ct-input-with-icon"
                type="text"
                placeholder="Search a city, landmark or address…"
                value={searchQuery}
                onChange={handleSearchChange}
              />
              {searchLoading && <span className="ct-search-spinner" />}
            </div>

            {/* Dropdown results */}
            {searchResults.length > 0 && (
              <ul className="ct-search-results">
                {searchResults.map((r) => (
                  <li key={r.place_id} className="ct-search-result-item"
                    onClick={() => handleSelectResult(r)}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    <span>{r.display_name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="ct-map-hint">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Search a location above, or click anywhere on the map to drop a pin.
          </div>

          <div className="ct-map-coords">
            <span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
              Lat: {tripData.latitude.toFixed(4)}
            </span>
            <span>Lng: {tripData.longitude.toFixed(4)}</span>
          </div>

          <div className="ct-map-wrap">
            <MapContainer center={[tripData.latitude, tripData.longitude]} zoom={5}
              style={{ height:"320px", width:"100%", borderRadius:"14px" }}>
              <TileLayer attribution="&copy; OpenStreetMap contributors"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <LocationPicker onPick={handleMapClick} />
              <MapFlyTo center={flyTarget} />
              <Marker position={[tripData.latitude, tripData.longitude]} />
            </MapContainer>
          </div>
        </div>

        {/* Submit */}
        <button className="ct-submit-btn" type="submit" disabled={uploading}>
          {uploading ? (
            <><span className="ct-btn-spinner" />Creating Trip…</>
          ) : (
            <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M12 5v14M5 12l7 7 7-7"/></svg>Create Trip</>
          )}
        </button>
      </form>
    </div>
  );
}