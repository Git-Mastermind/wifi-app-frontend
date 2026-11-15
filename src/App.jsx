import React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

async function apiRequest(path, options = {}) {
  if (!API_BASE) {
    throw new Error("API URL missing. Set VITE_API_BASE_URL in your .env file, then restart Vite.");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "ngrok-skip-browser-warning": "true",
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

  useEffect(() => {
    loadWifis();
  }, [loadWifis]);

  const filteredWifis = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return wifis;
    return wifis.filter((item) => (item.name || "").toLowerCase().includes(term));
  }, [wifis, query]);

  async function vote(id, action) {
    setBusyId(id);
    setNotice("");
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
      // The existing Flask API reads these values from request.args.
      await apiRequest(`/new-entry?name=${encodeURIComponent(ssid.trim())}&password=${encodeURIComponent(password)}`, {
        method: "POST",
      });
      setSsid("");
      setPassword("");
      setAuthorized(false);
      setShowForm(false);
      setNotice("Entry submitted. Thanks for contributing!");
      await loadWifis();
    } catch (err) {
      setError(err.message || "The entry could not be submitted.");
    } finally {
      setSubmitting(false);
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
          <button className="button button-primary top-submit" onClick={() => setShowForm((v) => !v)}>
            <span>＋</span> Add network
          </button>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="eyebrow"><span className="eyebrow-line" /> LOCAL CONNECTIONS, SHARED RESPONSIBLY</div>
          <h1>Free<br /><span>Wi-Fi.</span></h1>
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
            <form onSubmit={submitEntry} className="submit-form">
              <label>
                Wi-Fi network name
                <input value={ssid} onChange={(e) => setSsid(e.target.value)} placeholder="e.g. Cafe_Guest" maxLength={255} required />
              </label>
              <label>
                Guest Wi-Fi password
                <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter the authorized guest password" maxLength={255} required />
              </label>
              <label className="permission-check">
                <input type="checkbox" checked={authorized} onChange={(e) => setAuthorized(e.target.checked)} />
                <span>I confirm this is a guest network and the business has authorized sharing these credentials.</span>
              </label>
              <button className="button button-primary submit-form-button" disabled={submitting}>
                {submitting ? "Submitting..." : "Submit network"}
              </button>
            </form>
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
