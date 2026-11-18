import React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

async function apiRequest(path, options = {}) {
  if (!API_BASE) {
    throw new Error("API URL missing. Set VITE_API_BASE_URL in your .env file, then restart Vite.");
  }

  const savedToken = window.localStorage.getItem("opensignal_token");

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "ngrok-skip-browser-warning": "true",
      ...(savedToken ? { Authorization: `Bearer ${savedToken}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (response.status === 204) return null;

  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message = typeof body === "object" && body
      ? body.status || body.error || `Request failed (${response.status})`
      : `Request failed (${response.status})`;
    throw new Error(message);
  }

  return body;
}

function WifiCard({ wifi, onVote, busy }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <article className="wifi-card">
      <div className="card-topline">
        <div className="network-icon"><span className="wifi-glyph">⌁</span></div>
        <span className="guest-tag">Community entry</span>
      </div>
      <div className="network-name">{wifi.name || "Unnamed network"}</div>
      <div className="network-label">Wi-Fi network name (SSID)</div>
      <div className="network-author">Posted by {wifi.submitted_by || "Community"}</div>

      <div className="password-row">
        <div>
          <div className="password-label">Password</div>
          <div className="password-value">
            {revealed ? (wifi.password || "No password provided") : "••••••••••••"}
          </div>
        </div>
        <button
          className="button button-soft reveal-button"
          onClick={() => setRevealed((value) => !value)}
          type="button"
        >
          {revealed ? "Hide" : "Reveal"}
        </button>
      </div>

      <div className="card-footer">
        <div className="vote-counts">
          <span title="Upvotes">↑ {wifi.upvotes ?? 0}</span>
          <span title="Downvotes">↓ {wifi.downvotes ?? 0}</span>
        </div>
        <div className="vote-actions">
          <button disabled={busy} className="vote-button up" onClick={() => onVote(wifi.id, "upvote")}>
            ↑ Helpful
          </button>
          <button disabled={busy} className="vote-button down" onClick={() => onVote(wifi.id, "downvote")}>
            ↓ Report
          </button>
        </div>
      </div>
      <p className="card-note">Only connect if the business has authorized customers to use this network.</p>
    </article>
  );
}

function App() {
  const [wifis, setWifis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [pendingWifis, setPendingWifis] = useState([]);
  const [moderationBusyId, setModerationBusyId] = useState(null);

  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [username, setUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  const loadWifis = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await apiRequest("/get-wifis");
      setWifis(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Could not load Wi-Fi entries.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCurrentUser = useCallback(async () => {
    try {
      const data = await apiRequest("/me");
      setCurrentUser(data.user);
      return data.user;
    } catch {
      setCurrentUser(null);
      return null;
    }
  }, []);

  const loadPendingWifis = useCallback(async () => {
    try {
      const data = await apiRequest("/pending-wifis");
      setPendingWifis(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Could not load submissions waiting for approval.");
    }
  }, []);

  useEffect(() => {
    loadWifis();
    loadCurrentUser();
  }, [loadWifis, loadCurrentUser]);

  useEffect(() => {
    if (currentUser?.is_admin) {
      loadPendingWifis();
    } else {
      setPendingWifis([]);
    }
  }, [currentUser, loadPendingWifis]);

  const filteredWifis = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return wifis;
    return wifis.filter((item) => (item.name || "").toLowerCase().includes(term));
  }, [wifis, query]);

  function openAuth(mode) {
    setAuthMode(mode);
    setShowAuth(true);
    setError("");
    setNotice("");
  }

  async function submitAuth(event) {
    event.preventDefault();

    if (!username.trim() || !authPassword) {
      setError("Enter a username and password.");
      return;
    }

    setAuthSubmitting(true);
    setError("");
    setNotice("");

    try {
      const endpoint = authMode === "signup" ? "/signup" : "/login";

      const data = await apiRequest(
        `${endpoint}?username=${encodeURIComponent(username.trim())}&password=${encodeURIComponent(authPassword)}`,
        { method: "POST" }
      );

      if (authMode === "signup") {
        setAuthMode("login");
        setAuthPassword("");
        setNotice("Account created. Log in to report a network.");
      } else {
        if (!data.token) {
          throw new Error("Login succeeded but the API did not return an authentication token.");
        }
        window.localStorage.setItem("opensignal_token", data.token);
        const refreshedUser = await loadCurrentUser();
        if (!refreshedUser) {
          throw new Error("Login succeeded, but the API could not confirm your session. Please try again.");
        }
        setUsername("");
        setAuthPassword("");
        setShowAuth(false);
        setNotice(`Logged in as ${refreshedUser.username}.`);
      }
    } catch (err) {
      setError(err.message || "Your account request could not be completed.");
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function logout() {
    setError("");
    setNotice("");

    try {
      await apiRequest("/logout", { method: "POST" });
      window.localStorage.removeItem("opensignal_token");
      setCurrentUser(null);
      setNotice("You are logged out.");
    } catch (err) {
      setError(err.message || "Could not log out.");
    }
  }

  async function vote(id, action) {
    if (action === "downvote" && !currentUser) {
      openAuth("login");
      setError("Log in before reporting a network.");
      return;
    }

    setBusyId(id);
    setNotice("");
    setError("");

    try {
      await apiRequest(`/${action}?id=${encodeURIComponent(id)}`, { method: "POST" });
      setNotice(action === "upvote" ? "Thanks for confirming this entry!" : "Thanks for flagging this entry.");
      await loadWifis();
    } catch (err) {
      setError(err.message || "Your vote could not be saved.");
    } finally {
      setBusyId(null);
    }
  }

  async function submitEntry(event) {
    event.preventDefault();

    if (!currentUser) {
      setShowForm(false);
      openAuth("login");
      setError("Log in before adding a network.");
      return;
    }

    if (!authorized) {
      setError("Please confirm that the business has authorized sharing this guest Wi-Fi information.");
      return;
    }

    if (!ssid.trim() || !password.trim()) {
      setError("Enter both the network name and password.");
      return;
    }

    setSubmitting(true);
    setError("");
    setNotice("");

    try {
      await apiRequest(
        `/new-entry?name=${encodeURIComponent(ssid.trim())}&password=${encodeURIComponent(password)}`,
        { method: "POST" }
      );

      setSsid("");
      setPassword("");
      setAuthorized(false);
      setShowForm(false);
      setNotice("Entry submitted for approval. It will appear after review.");
      await loadWifis();
      if (currentUser?.is_admin) await loadPendingWifis();
    } catch (err) {
      setError(err.message || "The entry could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  }

  async function moderateEntry(id, decision) {
    setModerationBusyId(id);
    setError("");
    setNotice("");
    try {
      await apiRequest(`/${decision}-entry?id=${encodeURIComponent(id)}`, { method: "POST" });
      setNotice(decision === "approve" ? "Entry approved and published." : "Entry rejected and removed.");
      await Promise.all([loadPendingWifis(), loadWifis()]);
    } catch (err) {
      setError(err.message || "Could not update this submission.");
    } finally {
      setModerationBusyId(null);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="OpenSignal home">
          <span className="brand-mark"><span>⌁</span></span>
          <span>opensignal<span className="brand-dot">.</span></span>
        </a>

        <div className="topbar-right">
          <span className="status-dot" />
          <span className="status-text">Community directory</span>

          {currentUser ? (
            <>
              <button className="button button-soft" type="button" onClick={() => setShowAuth((value) => !value)}>
                {currentUser.username}
              </button>
              <button className="button button-soft" type="button" onClick={logout}>
                Log out
              </button>
            </>
          ) : (
            <button className="button button-soft" type="button" onClick={() => openAuth("login")}>
              Log in / Sign up
            </button>
          )}

          <button className="button button-primary top-submit" onClick={() => {
            if (!currentUser) {
              openAuth("login");
              setError("Log in before adding a network.");
              return;
            }
            setShowForm((value) => !value);
          }}>
            <span>＋</span> Add network
          </button>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="eyebrow"><span className="eyebrow-line" /> LOCAL CONNECTIONS, SHARED RESPONSIBLY</div>
          <h1>Local Wi-Fi<br /><span>unlocked.</span></h1>
          <p className="hero-copy">
            A community-powered directory of guest Wi-Fi networks shared with permission by local businesses.
          </p>

          <div className="search-wrap">
            <span className="search-icon">⌕</span>
            <input
              aria-label="Search Wi-Fi networks"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by Wi-Fi network name..."
            />
            {query && <button className="clear-search" onClick={() => setQuery("")}>Clear</button>}
            <span className="search-shortcut">⌘ K</span>
          </div>

          <div className="hero-meta">
            <span><strong>{wifis.length}</strong> {wifis.length === 1 ? "network" : "networks"} listed</span>
            <span className="meta-separator">·</span>
            <span>Only business-authorized guest networks</span>
          </div>
        </section>

        {showAuth && (
          <div className="auth-overlay" onClick={() => setShowAuth(false)}>
            <section
              className="auth-modal"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="auth-title"
            >
              <div className="panel-heading">
                <div>
                  <div className="section-kicker">ACCOUNT</div>
                  <h2 id="auth-title">
                    {authMode === "login" ? "Welcome back" : "Create an account"}
                  </h2>
                  <p>
                    {authMode === "login"
                      ? "Log in to report a network."
                      : "Create an account to report networks once each."}
                  </p>
                </div>
                <button
                  className="icon-close"
                  onClick={() => setShowAuth(false)}
                  aria-label="Close account form"
                  type="button"
                >
                  ×
                </button>
              </div>

              {error && (
                <div className="alert alert-error" role="alert">
                  <span>!</span>
                  {error}
                  <button type="button" onClick={() => setError("")} aria-label="Dismiss">×</button>
                </div>
              )}

              {notice && (
                <div className="alert alert-success" role="status">
                  <span>✓</span>
                  {notice}
                  <button type="button" onClick={() => setNotice("")} aria-label="Dismiss">×</button>
                </div>
              )}

              <form onSubmit={submitAuth} className="submit-form">
                <label>
                  Username
                  <input
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="Choose a username"
                    minLength={3}
                    maxLength={32}
                    autoComplete="username"
                    required
                  />
                </label>

                <label>
                  Password
                  <input
                    type="password"
                    value={authPassword}
                    onChange={(event) => setAuthPassword(event.target.value)}
                    placeholder="At least 8 characters"
                    minLength={8}
                    maxLength={128}
                    autoComplete={authMode === "login" ? "current-password" : "new-password"}
                    required
                  />
                </label>

                <button
                  className="button button-primary submit-form-button"
                  disabled={authSubmitting}
                  type="submit"
                >
                  {authSubmitting
                    ? "Please wait..."
                    : authMode === "login"
                      ? "Log in"
                      : "Create account"}
                </button>

                <button
                  className="button button-soft"
                  type="button"
                  onClick={() => {
                    setAuthMode(authMode === "login" ? "signup" : "login");
                    setAuthPassword("");
                    setError("");
                    setNotice("");
                  }}
                >
                  {authMode === "login"
                    ? "Need an account? Sign up"
                    : "Already have an account? Log in"}
                </button>
              </form>
            </section>
          </div>
        )}

        {showForm && (
          <section className="submit-panel">
            <div className="panel-heading">
              <div>
                <div className="section-kicker">CONTRIBUTE</div>
                <h2>Add a guest network</h2>
                <p>Only submit credentials the business has explicitly authorized customers to share.</p>
              </div>
              <button className="icon-close" onClick={() => setShowForm(false)} aria-label="Close form">×</button>
            </div>

            <p className="posting-as">Posting as <strong>{currentUser?.username}</strong></p>

            <form onSubmit={submitEntry} className="submit-form">
              <label>
                Wi-Fi network name
                <input value={ssid} onChange={(event) => setSsid(event.target.value)} placeholder="e.g. Cafe_Guest" maxLength={255} required />
              </label>

              <label>
                Guest Wi-Fi password
                <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter the authorized guest password" maxLength={255} required />
              </label>

              <label className="permission-check">
                <input type="checkbox" checked={authorized} onChange={(event) => setAuthorized(event.target.checked)} />
                <span>I confirm this is a guest network and the business has authorized sharing these credentials.</span>
              </label>

              <button className="button button-primary submit-form-button" disabled={submitting}>
                {submitting ? "Submitting..." : "Submit network"}
              </button>
            </form>
          </section>
        )}

        {currentUser?.is_admin && (
          <section className="submit-panel moderation-panel">
            <div className="section-kicker">ADMIN REVIEW</div>
            <div className="panel-heading">
              <div>
                <h2>Waiting for approval</h2>
                <p>These entries are hidden from the public directory until approved.</p>
              </div>
              <span className="results-count">{pendingWifis.length} PENDING</span>
            </div>
            {pendingWifis.length === 0 ? (
              <p className="moderation-empty">No submissions are waiting for review.</p>
            ) : (
              <div className="moderation-list">
                {pendingWifis.map((wifi) => (
                  <article className="moderation-item" key={wifi.id}>
                    <div>
                      <strong>{wifi.name || "Unnamed network"}</strong>
                      <span>Submitted by {wifi.submitted_by || "Unknown user"}</span>
                    </div>
                    <div className="moderation-actions">
                      <button className="button button-primary" type="button" disabled={moderationBusyId === wifi.id} onClick={() => moderateEntry(wifi.id, "approve")}>
                        Approve
                      </button>
                      <button className="button button-soft" type="button" disabled={moderationBusyId === wifi.id} onClick={() => moderateEntry(wifi.id, "reject")}>
                        Reject
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {(error || notice) && (
          <div className={`alert ${error ? "alert-error" : "alert-success"}`} role="status">
            <span>{error ? "!" : "✓"}</span>
            {error || notice}
            <button onClick={() => { setError(""); setNotice(""); }} aria-label="Dismiss">×</button>
          </div>
        )}

        <section className="directory-section">
          <div className="section-header">
            <div>
              <div className="section-kicker">THE DIRECTORY</div>
              <h2>{query ? "Search results" : "Available networks"}</h2>
            </div>
            <div className="results-count">{filteredWifis.length} RESULTS <span>↗</span></div>
          </div>

          {loading ? (
            <div className="empty-state"><div className="loader" /><p>Loading networks...</p></div>
          ) : error && wifis.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">⌁</div>
              <h3>Couldn't reach the API</h3>
              <p>Check that Flask and its ngrok tunnel are running, and that your API URL is set in <code>.env</code>.</p>
              <button className="button button-soft" onClick={loadWifis}>Try again</button>
            </div>
          ) : filteredWifis.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">⌕</div>
              <h3>{query ? "No matching networks" : "No networks yet"}</h3>
              <p>{query ? "Try another search term." : "Be the first to contribute an authorized guest network."}</p>
              {!query && <button className="button button-primary" onClick={() => setShowForm(true)}>Add the first network</button>}
            </div>
          ) : (
            <div className="wifi-grid">
              {filteredWifis.map((wifi) => (
                <WifiCard key={wifi.id} wifi={wifi} onVote={vote} busy={busyId === wifi.id} />
              ))}
            </div>
          )}
        </section>

        <section className="trust-strip">
          <div className="trust-icon">✳</div>
          <div>
            <strong>Share responsibly.</strong>
            <p>This directory is for guest networks that businesses have authorized for customer use. Never submit private, employee-only, or otherwise restricted credentials.</p>
          </div>
        </section>
      </main>

      <footer>
        <a className="brand footer-brand" href="#"><span className="brand-mark"><span>⌁</span></span><span>opensignal<span className="brand-dot">.</span></span></a>
        <span>Community-powered guest Wi-Fi directory</span>
        <span>Built with care <span className="footer-star">✳</span></span>
      </footer>
    </div>
  );
}

export default App;
