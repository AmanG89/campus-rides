import React, { useState } from "react";
import "./signup.css";
import { Link, useNavigate } from "react-router-dom";
import { signInWithPopup }        from "firebase/auth";
import { auth, googleProvider }   from "../../firebase"; // adjust path if needed

export default function Signup() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: "", email: "", password: "", confirmPassword: "", university: "",
  });
  const [error, setError]           = useState("");
  const [success, setSuccess]       = useState("");
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
    setError(""); setSuccess("");
  };

  // ── Email / password signup (unchanged logic) ──
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setSuccess("");

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match!");
      return;
    }

    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/add-user`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(formData),
      });
      const data = await res.json();

      if (res.ok) {
        setSuccess("Account created! Redirecting to login…");
        setFormData({ name:"", email:"", password:"", confirmPassword:"", university:"" });
        setTimeout(() => navigate("/"), 1500);
      } else {
        setError(data.error || "Failed to create account.");
      }
    } catch {
      setError("Unable to connect to the server.");
    }
  };

  // ── Google sign-up ──
  // Google sign-up and sign-in are the same flow.
  // If the user doesn't exist in your DB the backend creates them automatically.
  const handleGoogleSignup = async () => {
    setError(""); setGoogleLoading(true);
    try {
      const result  = await signInWithPopup(auth, googleProvider);
      const idToken = await result.user.getIdToken();

      const res  = await fetch(`${process.env.REACT_APP_API_URL}/auth/google`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ idToken }),
      });
      const data = await res.json();

      if (!res.ok) {
        // New Google user — needs to fill in university
        if (data.needsUniversity) {
          // Store token temporarily and redirect to a "complete profile" page
          // or handle inline (see note below)
          setError("Please complete your profile: we need your university name.");
          return;
        }
        setError(data.error || "Google sign-up failed.");
        return;
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      localStorage.setItem("email", data.user.email);
      setSuccess("Account created with Google! Redirecting…");
      setTimeout(() => navigate("/home"), 1200);
    } catch (err) {
      if (err.code === "auth/popup-closed-by-user" ||
          err.code === "auth/cancelled-popup-request") return;
      setError("Google sign-up failed. Please try again.");
      console.error(err);
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <main className="main">
      <div className="wrapper">

        {/* Header banner */}
        <div className="header">
          <div className="su-brand-icon">
            <svg viewBox="0 0 48 48" fill="none" className="su-bus-svg">
              <rect x="4" y="17" width="36" height="21" rx="4" fill="white" opacity="0.9"/>
              <rect x="8" y="13" width="24" height="11" rx="3" fill="white" opacity="0.7"/>
              <circle cx="13" cy="38" r="4.5" fill="white"/>
              <circle cx="35" cy="38" r="4.5" fill="white"/>
              <rect x="14" y="20" width="6" height="5" rx="1.5" fill="#ff6b35" opacity="0.9"/>
              <rect x="22" y="20" width="6" height="5" rx="1.5" fill="#ff6b35" opacity="0.9"/>
            </svg>
          </div>
          <h1>Create your account</h1>
          <div className="light-text">Join CampusRides and travel together</div>
        </div>

        <div className="mainbody">
          <h3>Create Account</h3>

          {error   && <p className="error-message">{error}</p>}
          {success && <p className="success-message">{success}</p>}

          {/* ── Google sign-up ── */}
          <button
            type="button"
            className="google-btn"
            onClick={handleGoogleSignup}
            disabled={googleLoading}
          >
            {googleLoading ? (
              <span className="su-spinner" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
            )}
            {googleLoading ? "Signing up…" : "Continue with Google"}
          </button>

          <div className="auth-divider">
            <span>or create account with email</span>
          </div>

          {/* ── Email form ── */}
          <form onSubmit={handleSubmit}>
            <label>Full Name</label>
            <input type="text" name="name" placeholder="Enter your name"
              value={formData.name} onChange={handleChange} required />

            <label>University</label>
            <input type="text" name="university" placeholder="Enter your university"
              value={formData.university} onChange={handleChange} required />

            <label>Email</label>
            <input type="email" name="email" placeholder="Enter your email"
              value={formData.email} onChange={handleChange} required />

            <label>Password</label>
            <input type="password" name="password" placeholder="Enter your password"
              value={formData.password} onChange={handleChange} required />

            <label>Confirm Password</label>
            <input type="password" name="confirmPassword" placeholder="Re-enter your password"
              value={formData.confirmPassword} onChange={handleChange} required />

            <button type="submit">Create Account</button>
          </form>

          <div className="signin-link">
            Already have an account? <Link to="/">Sign in here</Link>
          </div>
        </div>
      </div>
    </main>
  );
}