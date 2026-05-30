import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "./supabaseClient";

// ─── Constants ───────────────────────────────────────────────────────
const MONTHS = ["January","February","March","April","May","June",
  "July","August","September","October","November","December"];
const WEEKDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const getDaysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
const getFirstDay = (y, m) => new Date(y, m, 1).getDay();
const dateKey = (y, m, d) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const fmt = (n) => {
  const sign = n >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(n).toLocaleString()}`;
};

const TF_OPTIONS = ["1m", "5m", "15m", "1H"];
const SETUP_OPTIONS = ["MSS", "FVG", "OB"];

// ─── Styles ──────────────────────────────────────────────────────────
const inputStyle = {
  width: "100%", padding: "10px 14px", borderRadius: 8,
  border: "1px solid #2a2a2a", background: "#050505", color: "#e0e0e0",
  fontSize: 14, fontFamily: "'DM Mono',monospace", outline: "none",
  boxSizing: "border-box", transition: "border-color 0.15s",
};
const selectStyle = {
  ...inputStyle,
  appearance: "none", WebkitAppearance: "none",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23444' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center",
  paddingRight: 32, cursor: "pointer",
};
const labelStyle = {
  display: "block", fontSize: 11, fontFamily: "'DM Mono',monospace",
  color: "#444", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6,
};

function getPnlTextColor(pnl) {
  if (pnl == null) return "#e0e0e0";
  return pnl > 0 ? "#4de894" : "#ff6b78";
}

// ─── Field wrapper ────────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

// ─── Toggle group (Buy/Sell, Limit/Market) ────────────────────────────
function ToggleGroup({ options, value, onChange, colors }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {options.map((opt, i) => {
        const active = value === opt;
        const color = colors?.[i] || "#f0f0f0";
        return (
          <button key={opt} onClick={() => onChange(opt)} style={{
            flex: 1, padding: "10px", borderRadius: 8, border: "1px solid",
            cursor: "pointer", fontFamily: "'DM Mono',monospace", fontSize: 13,
            fontWeight: 600, transition: "all 0.15s",
            background: active ? `${color}18` : "transparent",
            borderColor: active ? color : "#2a2a2a",
            color: active ? color : "#555",
          }}>{opt}</button>
        );
      })}
    </div>
  );
}

// ─── Multi-select chips ───────────────────────────────────────────────
function MultiChips({ options, value = [], onChange }) {
  const toggle = (opt) => {
    if (value.includes(opt)) onChange(value.filter(v => v !== opt));
    else onChange([...value, opt]);
  };
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {options.map(opt => {
        const active = value.includes(opt);
        return (
          <button key={opt} onClick={() => toggle(opt)} style={{
            padding: "8px 16px", borderRadius: 8, border: "1px solid",
            cursor: "pointer", fontFamily: "'DM Mono',monospace", fontSize: 13,
            fontWeight: 600, transition: "all 0.15s",
            background: active ? "rgba(255,255,255,0.08)" : "transparent",
            borderColor: active ? "#f0f0f0" : "#2a2a2a",
            color: active ? "#f0f0f0" : "#555",
          }}>{opt}</button>
        );
      })}
    </div>
  );
}

// ─── Log Trade Modal ─────────────────────────────────────────────────
function LogTradeModal({ date, dateStr, onSave, onDelete, onClose, existing }) {
  const [pair, setPair] = useState(existing?.pair || "");
  const [direction, setDirection] = useState(existing?.direction || "Buy");
  const [orderType, setOrderType] = useState(existing?.order_type || "Limit");
  const [entryTf, setEntryTf] = useState(existing?.entry_tf || "");
  const [rr, setRr] = useState(existing?.risk_reward || "");
  const [pnl, setPnl] = useState(existing?.pnl?.toString() || "");
  const [numTrades, setNumTrades] = useState(existing?.num_trades?.toString() || "1");
  const [setup, setSetup] = useState(existing?.setup || []);
  const [notes, setNotes] = useState(existing?.notes || "");
  const [screenshotUrl, setScreenshotUrl] = useState(existing?.screenshot_url || null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const [imgError, setImgError] = useState(false);
  const fileRef = useRef();

  const handleScreenshot = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const ext = file.name.split(".").pop();
    const path = `${user.id}/${dateStr}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("trade-screenshots")
      .upload(path, file, { upsert: true });
    if (!error) {
      const { data } = supabase.storage.from("trade-screenshots").getPublicUrl(path);
      setScreenshotUrl(data.publicUrl);
    }
    setUploading(false);
  };

  const removeScreenshot = () => setScreenshotUrl(null);

  const handleSave = async () => {
    if (!pnl) return;
    setSaving(true);
    await onSave({
      pair, direction, order_type: orderType, entry_tf: entryTf,
      risk_reward: rr, pnl: parseFloat(pnl),
      num_trades: parseInt(numTrades) || 1,
      setup, notes, screenshot_url: screenshotUrl, date: dateStr,
    });
    setSaving(false);
    onClose();
  };

  const handleDelete = async () => {
    if (!confirming) { setConfirming(true); return; }
    await onDelete(existing.id);
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, backdropFilter: "blur(6px)", padding: "20px" }}>
      <div style={{ background: "#0e0e0e", border: "1px solid #222", borderRadius: 16,
        padding: "28px", width: "100%", maxWidth: 480,
        maxHeight: "90vh", overflowY: "auto",
        boxShadow: "0 24px 80px rgba(0,0,0,0.95)" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between",
          alignItems: "center", marginBottom: 24 }}>
          <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 700,
            color: "#f0f0f0", letterSpacing: "-0.02em" }}>
            {existing ? "Edit Entry" : "Log Trade"}
          </span>
          <span style={{ color: "#444", fontSize: 12,
            fontFamily: "'DM Mono',monospace" }}>{date}</span>
        </div>

        {/* Row: Pair + R:R */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Pair">
            <input value={pair} onChange={e => setPair(e.target.value)}
              placeholder="EURUSD, NQ…" style={inputStyle} />
          </Field>
          <Field label="Risk / Reward">
            <input value={rr} onChange={e => setRr(e.target.value)}
              placeholder="1:2.5" style={inputStyle} />
          </Field>
        </div>

        {/* Buy / Sell */}
        <Field label="Direction">
          <ToggleGroup
            options={["Buy", "Sell"]}
            value={direction}
            onChange={setDirection}
            colors={["#4de894", "#ff6b78"]}
          />
        </Field>

        {/* Limit / Market */}
        <Field label="Order Type">
          <ToggleGroup
            options={["Limit", "Market"]}
            value={orderType}
            onChange={setOrderType}
            colors={["#a78bfa", "#60a5fa"]}
          />
        </Field>

        {/* Row: Entry TF + Num trades */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Entry Timeframe">
            <select value={entryTf} onChange={e => setEntryTf(e.target.value)} style={selectStyle}>
              <option value="">Select TF</option>
              {TF_OPTIONS.map(tf => <option key={tf} value={tf}>{tf}</option>)}
            </select>
          </Field>
          <Field label="Number of Trades">
            <input value={numTrades} onChange={e => setNumTrades(e.target.value)}
              type="number" min="1" style={inputStyle} />
          </Field>
        </div>

        {/* PnL */}
        <Field label="Net P&L ($)">
          <input value={pnl} onChange={e => setPnl(e.target.value)}
            placeholder="+420 or -180" type="number" style={inputStyle} />
        </Field>

        {/* Setup */}
        <Field label="Setup">
          <MultiChips options={SETUP_OPTIONS} value={setup} onChange={setSetup} />
        </Field>

        {/* Notes */}
        <Field label="Notes">
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="What went well? What didn't?" rows={3}
            style={{ ...inputStyle, resize: "none", lineHeight: 1.6 }} />
        </Field>

        {/* Screenshot */}
        <Field label="Screenshot">
          {screenshotUrl && !imgError ? (
            <div style={{ position: "relative" }}>
              <img
                src={screenshotUrl}
                alt="Trade screenshot"
                onError={() => setImgError(true)}
                onClick={() => setLightbox(true)}
                style={{ width: "100%", borderRadius: 8, border: "1px solid #2a2a2a",
                  display: "block", maxHeight: 220, objectFit: "cover",
                  cursor: "zoom-in" }} />
              <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 6 }}>
                <button onClick={() => setLightbox(true)} style={{
                  width: 28, height: 28, borderRadius: "50%", border: "none",
                  background: "rgba(0,0,0,0.75)", color: "#ccc", cursor: "pointer",
                  fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}
                  title="View full size">⤢</button>
                <button onClick={removeScreenshot} style={{
                  width: 28, height: 28, borderRadius: "50%", border: "none",
                  background: "rgba(0,0,0,0.75)", color: "#ccc", cursor: "pointer",
                  fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}
                  title="Remove">×</button>
              </div>
              <button onClick={() => { setImgError(false); fileRef.current?.click(); }} style={{
                marginTop: 8, width: "100%", padding: "8px", borderRadius: 8,
                border: "1px solid #2a2a2a", background: "transparent", color: "#444",
                cursor: "pointer", fontFamily: "'DM Mono',monospace", fontSize: 12 }}>
                Replace image
              </button>
            </div>
          ) : screenshotUrl && imgError ? (
            <div style={{ padding: "16px", borderRadius: 8, border: "1px solid #2a2a2a",
              background: "#0a0a0a", textAlign: "center" }}>
              <div style={{ color: "#444", fontFamily: "'DM Mono',monospace", fontSize: 12,
                marginBottom: 10 }}>Image saved — tap below to view or replace</div>
              <div style={{ display: "flex", gap: 8 }}>
                <a href={screenshotUrl} target="_blank" rel="noreferrer" style={{
                  flex: 1, padding: "8px", borderRadius: 8, border: "1px solid #2a2a2a",
                  background: "transparent", color: "#555", cursor: "pointer",
                  fontFamily: "'DM Mono',monospace", fontSize: 12, textAlign: "center",
                  textDecoration: "none", display: "block" }}>Open image ↗</a>
                <button onClick={() => { setImgError(false); fileRef.current?.click(); }} style={{
                  flex: 1, padding: "8px", borderRadius: 8, border: "1px solid #2a2a2a",
                  background: "transparent", color: "#555", cursor: "pointer",
                  fontFamily: "'DM Mono',monospace", fontSize: 12 }}>Replace</button>
                <button onClick={removeScreenshot} style={{
                  padding: "8px 12px", borderRadius: 8, border: "1px solid #2a2a2a",
                  background: "transparent", color: "#555", cursor: "pointer",
                  fontFamily: "'DM Mono',monospace", fontSize: 12 }}>✕</button>
              </div>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{
              width: "100%", padding: "20px", borderRadius: 8,
              border: "1px dashed #2a2a2a", background: "transparent",
              color: uploading ? "#444" : "#555", cursor: uploading ? "not-allowed" : "pointer",
              fontFamily: "'DM Mono',monospace", fontSize: 13, transition: "all 0.15s",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 22 }}>↑</span>
              <span>{uploading ? "Uploading…" : "Click to upload screenshot"}</span>
              <span style={{ fontSize: 10, color: "#333" }}>JPG, PNG, WEBP</span>
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*"
            onChange={handleScreenshot} style={{ display: "none" }} />
        </Field>

        {/* Lightbox */}
        {lightbox && screenshotUrl && (
          <div onClick={() => setLightbox(false)} style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.95)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 2000, cursor: "zoom-out", padding: 20 }}>
            <img src={screenshotUrl} alt="Trade screenshot full"
              style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8,
                objectFit: "contain", boxShadow: "0 0 80px rgba(0,0,0,0.8)" }} />
            <button onClick={() => setLightbox(false)} style={{
              position: "fixed", top: 20, right: 20, width: 36, height: 36,
              borderRadius: "50%", border: "1px solid #333", background: "#111",
              color: "#aaa", cursor: "pointer", fontSize: 18,
              display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          {existing && (
            <button onClick={handleDelete} style={{
              flex: 1, padding: "12px", borderRadius: 10, border: "1px solid",
              borderColor: confirming ? "#c8323c" : "#2a2a2a",
              background: confirming ? "rgba(200,50,60,0.12)" : "transparent",
              color: confirming ? "#ff6b78" : "#555",
              cursor: "pointer", fontFamily: "'DM Mono',monospace",
              fontSize: 12, transition: "all 0.2s" }}>
              {confirming ? "Confirm?" : "Delete"}
            </button>
          )}
          <button onClick={onClose} style={{ flex: 1, padding: "12px", borderRadius: 10,
            border: "1px solid #2a2a2a", background: "transparent", color: "#555",
            cursor: "pointer", fontFamily: "'DM Mono',monospace", fontSize: 13 }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || uploading} style={{
            flex: 2, padding: "12px", borderRadius: 10, border: "none",
            background: (saving || uploading) ? "#444" : "#f0f0f0",
            color: "#0a0a0a", cursor: (saving || uploading) ? "not-allowed" : "pointer",
            fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 700 }}>
            {saving ? "Saving…" : uploading ? "Wait…" : "Save Entry"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Auth Page ───────────────────────────────────────────────────────
function AuthPage({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [hovered, setHovered] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) return;
    if (mode === "signup" && !username.trim()) return;
    setLoading(true); setError("");
    try {
      if (mode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({
          email, password, options: { data: { username: username.trim() } }
        });
        if (err) throw err;
        if (data.user && !data.session) {
          setError("Check your email to confirm your account, then sign in.");
          setLoading(false); return;
        }
        onAuth(data.user);
      } else {
        const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        onAuth(data.user);
      }
    } catch (err) { setError(err.message || "Something went wrong."); }
    setLoading(false);
  };

  const fields = mode === "signup"
    ? [
        { label: "Username", value: username, set: setUsername, placeholder: "yourname", type: "text" },
        { label: "Email", value: email, set: setEmail, placeholder: "you@example.com", type: "email" },
        { label: "Password", value: password, set: setPassword, placeholder: "••••••••", type: "password" },
      ]
    : [
        { label: "Email", value: email, set: setEmail, placeholder: "you@example.com", type: "email" },
        { label: "Password", value: password, set: setPassword, placeholder: "••••••••", type: "password" },
      ];

  return (
    <div style={{ minHeight: "100vh", background: "#040404", display: "flex",
      alignItems: "center", justifyContent: "center",
      fontFamily: "'Syne',sans-serif", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0,
        backgroundImage: "linear-gradient(rgba(255,255,255,0.018) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.018) 1px,transparent 1px)",
        backgroundSize: "64px 64px", pointerEvents: "none" }} />
      <div style={{ position: "absolute", top: "30%", left: "50%", transform: "translate(-50%,-50%)",
        width: 500, height: 500,
        background: "radial-gradient(circle,rgba(255,255,255,0.025) 0%,transparent 70%)",
        pointerEvents: "none" }} />

      <div style={{ position: "relative", width: 440, zIndex: 1 }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, border: "1.5px solid #fff", borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 12, height: 12, background: "#fff", borderRadius: 2 }} />
            </div>
            <span style={{ fontSize: 22, fontWeight: 800, color: "#f0f0f0",
              letterSpacing: "-0.04em", textTransform: "uppercase" }}>TradeLog</span>
          </div>
          <p style={{ marginTop: 12, color: "#2e2e2e", fontSize: 13,
            fontFamily: "'DM Mono',monospace", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            {mode === "login" ? "Welcome back" : "Start your record"}
          </p>
        </div>

        <div style={{ background: "#080808", border: "1px solid #181818", borderRadius: 20,
          padding: "40px", boxShadow: "0 40px 120px rgba(0,0,0,0.8)" }}>
          <div style={{ display: "flex", marginBottom: 32, background: "#050505",
            borderRadius: 10, padding: 4, border: "1px solid #161616" }}>
            {["login", "signup"].map(m => (
              <button key={m} onClick={() => { setMode(m); setError(""); }} style={{
                flex: 1, padding: "9px", borderRadius: 7, border: "none", cursor: "pointer",
                transition: "all 0.2s", background: mode === m ? "#1a1a1a" : "transparent",
                color: mode === m ? "#f0f0f0" : "#333",
                fontFamily: "'Syne',sans-serif", fontSize: 13, fontWeight: 700 }}>
                {m === "login" ? "Sign In" : "Create Account"}
              </button>
            ))}
          </div>

          {fields.map(({ label, value, set, placeholder, type }) => (
            <div key={label} style={{ marginBottom: 18 }}>
              <label style={{ ...labelStyle, color: "#333", marginBottom: 8 }}>{label}</label>
              <input type={type} value={value} onChange={e => set(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSubmit()}
                placeholder={placeholder}
                style={{ ...inputStyle, background: "#040404", width: "100%",
                  fontSize: 15, color: "#e8e8e8" }} />
            </div>
          ))}

          {error && (
            <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 8,
              background: "rgba(200,50,60,0.08)", border: "1px solid rgba(200,50,60,0.2)",
              color: "#ff6b78", fontSize: 13, fontFamily: "'DM Mono',monospace" }}>
              {error}
            </div>
          )}

          <button onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
            onClick={handleSubmit} disabled={loading}
            style={{ width: "100%", marginTop: 8, padding: "14px", borderRadius: 12,
              border: "none", background: loading ? "#555" : hovered ? "#e0e0e0" : "#f0f0f0",
              color: "#080808", cursor: loading ? "not-allowed" : "pointer",
              fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 800,
              transform: hovered && !loading ? "translateY(-1px)" : "translateY(0)",
              boxShadow: hovered && !loading ? "0 8px 24px rgba(255,255,255,0.1)" : "none",
              transition: "all 0.18s" }}>
            {loading ? "Please wait…" : mode === "login" ? "Sign In →" : "Create Account →"}
          </button>
        </div>

        <p style={{ textAlign: "center", marginTop: 24, fontSize: 11, color: "#1e1e1e",
          fontFamily: "'DM Mono',monospace", letterSpacing: "0.05em" }}>
          Your journal. Your discipline. Your edge.
        </p>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input::placeholder { color: #222; }
        textarea::placeholder { color: #222; }
        select option { background: #0e0e0e; color: #e0e0e0; }
      `}</style>
    </div>
  );
}

// ─── Stat pill ───────────────────────────────────────────────────────
function Stat({ label, value, color = "#f0f0f0" }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#2a2a2a", fontFamily: "'DM Mono',monospace",
        letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color, letterSpacing: "-0.03em" }}>{value}</div>
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────────
function Dashboard({ user, onLogout }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [trades, setTrades] = useState({});
  const [loadingTrades, setLoadingTrades] = useState(true);
  const [modal, setModal] = useState(null);
  const [hoveredDay, setHoveredDay] = useState(null);

  const displayName = user.user_metadata?.username || user.email?.split("@")[0] || "Trader";

  useEffect(() => {
    const fetchTrades = async () => {
      setLoadingTrades(true);
      const startDate = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-01`;
      const endDate = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${getDaysInMonth(viewYear, viewMonth)}`;
      const { data, error } = await supabase
        .from("trades").select("*")
        .eq("user_id", user.id)
        .gte("date", startDate).lte("date", endDate);
      if (!error && data) {
        const map = {};
        data.forEach(t => { if (!map[t.date]) map[t.date] = []; map[t.date].push(t); });
        setTrades(map);
      }
      setLoadingTrades(false);
    };
    fetchTrades();
  }, [viewYear, viewMonth, user.id]);

  const monthStats = useMemo(() => {
    const daysInMonth = getDaysInMonth(viewYear, viewMonth);
    let totalPnl = 0, totalTrades = 0, winDays = 0, tradedDays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const k = dateKey(viewYear, viewMonth, d);
      const entry = trades[k];
      if (entry?.length) {
        const dayPnl = entry.reduce((s, t) => s + t.pnl, 0);
        totalPnl += dayPnl;
        totalTrades += entry.reduce((s, t) => s + t.num_trades, 0);
        if (dayPnl > 0) winDays++;
        tradedDays++;
      }
    }
    return { totalPnl, totalTrades, tradedDays,
      winRate: tradedDays ? Math.round((winDays / tradedDays) * 100) : 0 };
  }, [trades, viewYear, viewMonth]);

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDay(viewYear, viewMonth);
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const goMonth = (dir) => {
    let m = viewMonth + dir, y = viewYear;
    if (m > 11) { m = 0; y++; }
    if (m < 0) { m = 11; y--; }
    setViewMonth(m); setViewYear(y);
  };

  const getDayData = (d) => {
    if (!d) return null;
    const entry = trades[dateKey(viewYear, viewMonth, d)];
    if (!entry?.length) return null;
    return { pnl: entry.reduce((s, t) => s + t.pnl, 0),
      trades: entry.reduce((s, t) => s + t.num_trades, 0), raw: entry[0] };
  };

  const openModal = (d, dow) => {
    if (!d || dow === 0 || dow === 6) return;
    const k = dateKey(viewYear, viewMonth, d);
    setModal({ dateKey: k, date: `${MONTHS[viewMonth]} ${d}, ${viewYear}`,
      dateStr: k, existing: trades[k]?.[0] });
  };

  const saveTrade = async (entry) => {
    if (!modal) return;
    const existing = trades[modal.dateKey]?.[0];
    if (existing) {
      const { data, error } = await supabase.from("trades")
        .update({ pair: entry.pair, direction: entry.direction, order_type: entry.order_type,
          entry_tf: entry.entry_tf, risk_reward: entry.risk_reward, pnl: entry.pnl,
          num_trades: entry.num_trades, setup: entry.setup, notes: entry.notes,
          screenshot_url: entry.screenshot_url })
        .eq("id", existing.id).select();
      if (!error && data) setTrades(prev => ({ ...prev, [modal.dateKey]: [data[0]] }));
    } else {
      const { data, error } = await supabase.from("trades")
        .insert([{ ...entry, user_id: user.id }]).select();
      if (!error && data) setTrades(prev => ({ ...prev, [modal.dateKey]: [data[0]] }));
    }
  };

  const deleteTrade = async (id) => {
    if (!modal) return;
    const { error } = await supabase.from("trades").delete().eq("id", id);
    if (!error) setTrades(prev => { const u = { ...prev }; delete u[modal.dateKey]; return u; });
  };

  const handleLogout = async () => { await supabase.auth.signOut(); onLogout(); };

  let bestDay = null, worstDay = null;
  for (let d = 1; d <= daysInMonth; d++) {
    const data = getDayData(d);
    if (data) {
      if (bestDay === null || data.pnl > bestDay) bestDay = data.pnl;
      if (worstDay === null || data.pnl < worstDay) worstDay = data.pnl;
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#030303", color: "#e0e0e0",
      fontFamily: "'Syne',sans-serif", paddingBottom: 80 }}>

      {/* Top bar */}
      <div style={{ borderBottom: "1px solid #111", padding: "18px 40px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        background: "rgba(3,3,3,0.97)", backdropFilter: "blur(12px)",
        position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 28, height: 28, border: "1.5px solid #f0f0f0", borderRadius: 6,
            display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 9, height: 9, background: "#f0f0f0", borderRadius: 2 }} />
          </div>
          <span style={{ fontSize: 16, fontWeight: 800, color: "#f0f0f0",
            letterSpacing: "-0.04em", textTransform: "uppercase" }}>TradeLog</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <span style={{ fontSize: 14, color: "#3a3a3a", fontFamily: "'DM Mono',monospace" }}>
            Hello, <span style={{ color: "#a0a0a0", fontWeight: 600 }}>{displayName}</span>
          </span>
          <button onClick={handleLogout}
            style={{ padding: "7px 16px", borderRadius: 8, border: "1px solid #1a1a1a",
              background: "transparent", color: "#333", cursor: "pointer",
              fontSize: 12, fontFamily: "'DM Mono',monospace", transition: "all 0.15s" }}
            onMouseEnter={e => { e.target.style.color = "#777"; e.target.style.borderColor = "#2a2a2a"; }}
            onMouseLeave={e => { e.target.style.color = "#333"; e.target.style.borderColor = "#1a1a1a"; }}>
            Sign out
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 40px 0" }}>

        {/* Month header */}
        <div style={{ display: "flex", alignItems: "flex-start",
          justifyContent: "space-between", marginBottom: 32 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 6 }}>
              <button onClick={() => goMonth(-1)} style={{
                width: 32, height: 32, borderRadius: 8, border: "1px solid #1a1a1a",
                background: "transparent", color: "#555", cursor: "pointer", fontSize: 18,
                display: "flex", alignItems: "center", justifyContent: "center" }}
                onMouseEnter={e => { e.target.style.borderColor = "#2a2a2a"; e.target.style.color = "#aaa"; }}
                onMouseLeave={e => { e.target.style.borderColor = "#1a1a1a"; e.target.style.color = "#555"; }}>
                ‹
              </button>
              <h1 style={{ fontSize: 32, fontWeight: 800, color: "#f0f0f0",
                letterSpacing: "-0.04em", margin: 0 }}>
                {MONTHS[viewMonth]} <span style={{ color: "#222" }}>{viewYear}</span>
              </h1>
              <button onClick={() => goMonth(1)} style={{
                width: 32, height: 32, borderRadius: 8, border: "1px solid #1a1a1a",
                background: "transparent", color: "#555", cursor: "pointer", fontSize: 18,
                display: "flex", alignItems: "center", justifyContent: "center" }}
                onMouseEnter={e => { e.target.style.borderColor = "#2a2a2a"; e.target.style.color = "#aaa"; }}
                onMouseLeave={e => { e.target.style.borderColor = "#1a1a1a"; e.target.style.color = "#555"; }}>
                ›
              </button>
            </div>
            <div style={{ display: "flex", gap: 28, marginTop: 12 }}>
              <Stat label="Days Traded" value={monthStats.tradedDays} />
              <Stat label="Total Trades" value={monthStats.totalTrades} />
              <Stat label="Win Rate" value={`${monthStats.winRate}%`}
                color={monthStats.winRate >= 50 ? "#4de894" : "#ff6b78"} />
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "#2a2a2a", fontFamily: "'DM Mono',monospace",
              letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Monthly P&L</div>
            <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1,
              color: monthStats.totalPnl >= 0 ? "#4de894" : "#ff6b78" }}>
              {fmt(monthStats.totalPnl)}
            </div>
          </div>
        </div>

        {/* Calendar */}
        <div style={{ background: "#080808", border: "1px solid #141414", borderRadius: 20,
          overflow: "hidden", boxShadow: "0 8px 48px rgba(0,0,0,0.6)", position: "relative" }}>

          {loadingTrades && (
            <div style={{ position: "absolute", inset: 0, background: "rgba(3,3,3,0.75)",
              display: "flex", alignItems: "center", justifyContent: "center",
              zIndex: 10, borderRadius: 20 }}>
              <span style={{ color: "#333", fontFamily: "'DM Mono',monospace", fontSize: 13 }}>Loading…</span>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr) 90px",
            borderBottom: "1px solid #141414" }}>
            {WEEKDAYS.map((d, i) => (
              <div key={d} style={{ padding: "14px 0", textAlign: "center", fontSize: 11,
                fontFamily: "'DM Mono',monospace", letterSpacing: "0.08em", textTransform: "uppercase",
                color: (i === 0 || i === 6) ? "#1e1e1e" : "#2e2e2e" }}>{d}</div>
            ))}
            <div style={{ padding: "14px 0", textAlign: "center", fontSize: 11,
              fontFamily: "'DM Mono',monospace", letterSpacing: "0.08em", textTransform: "uppercase",
              color: "#1e1e1e", borderLeft: "1px solid #141414" }}>Week</div>
          </div>

          {weeks.map((week, wi) => {
            let weekPnl = 0;
            const hasWeekData = week.some(d => {
              const data = getDayData(d);
              if (data) { weekPnl += data.pnl; return true; }
              return false;
            });
            return (
              <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr) 90px",
                borderBottom: wi < weeks.length - 1 ? "1px solid #0e0e0e" : "none" }}>
                {week.map((d, di) => {
                  const dow = d ? (firstDay + (d - 1)) % 7 : di;
                  const isWeekend = dow === 0 || dow === 6;
                  const dayData = getDayData(d);
                  const textColor = dayData ? getPnlTextColor(dayData.pnl) : null;
                  const isToday = d && viewYear === today.getFullYear()
                    && viewMonth === today.getMonth() && d === today.getDate();
                  const hKey = d ? `${wi}-${di}` : null;

                  return (
                    <div key={di} onClick={() => openModal(d, dow)}
                      onMouseEnter={() => hKey && setHoveredDay(hKey)}
                      onMouseLeave={() => setHoveredDay(null)}
                      style={{ minHeight: 88, padding: "12px", boxSizing: "border-box",
                        borderRight: "1px solid #0e0e0e",
                        background: !d ? "transparent"
                          : hoveredDay === hKey && !isWeekend ? "rgba(255,255,255,0.018)"
                          : isWeekend ? "rgba(255,255,255,0.004)" : "transparent",
                        cursor: d && !isWeekend ? "pointer" : "default",
                        transition: "background 0.15s" }}>
                      {d && (
                        <>
                          <span style={{ fontSize: 13, fontWeight: 700,
                            fontFamily: "'DM Mono',monospace", display: "block", marginBottom: 4,
                            color: isToday ? "#f0f0f0" : isWeekend ? "#1e1e1e" : "#303030" }}>
                            {d}
                            {isToday && <span style={{ display: "inline-block", width: 5, height: 5,
                              borderRadius: "50%", background: "#f0f0f0", marginLeft: 5,
                              verticalAlign: "middle" }} />}
                          </span>
                          {dayData && (
                            <>
                              <span style={{ fontSize: 15, fontWeight: 800, display: "block",
                                fontFamily: "'DM Mono',monospace", letterSpacing: "-0.02em",
                                color: textColor }}>{fmt(dayData.pnl)}</span>
                              {dayData.raw?.pair && (
                                <span style={{ fontSize: 10, color: "#333", display: "block",
                                  fontFamily: "'DM Mono',monospace", marginTop: 2 }}>
                                  {dayData.raw.pair}
                                </span>
                              )}
                              {dayData.raw?.setup?.length > 0 && (
                                <span style={{ fontSize: 9, color: "#2a2a2a", display: "block",
                                  fontFamily: "'DM Mono',monospace", marginTop: 1 }}>
                                  {dayData.raw.setup.join(" · ")}
                                </span>
                              )}
                            </>
                          )}
                          {!dayData && !isWeekend && hoveredDay === hKey && (
                            <span style={{ fontSize: 10, color: "#252525",
                              fontFamily: "'DM Mono',monospace" }}>+ log</span>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
                <div style={{ borderLeft: "1px solid #141414", display: "flex",
                  alignItems: "center", justifyContent: "center" }}>
                  {hasWeekData ? (
                    <span style={{ fontSize: 12, fontWeight: 800,
                      fontFamily: "'DM Mono',monospace", letterSpacing: "-0.02em",
                      color: weekPnl >= 0 ? "#4de894" : "#ff6b78" }}>
                      {fmt(weekPnl)}
                    </span>
                  ) : (
                    <span style={{ fontSize: 10, color: "#181818",
                      fontFamily: "'DM Mono',monospace" }}>—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Stats strip */}
        <div style={{ marginTop: 20, display: "flex", gap: 12 }}>
          {[
            { label: "Best Day", value: bestDay !== null ? fmt(bestDay) : "—", color: "#4de894" },
            { label: "Worst Day", value: worstDay !== null ? fmt(worstDay) : "—", color: "#ff6b78" },
            { label: "Avg Per Day", value: monthStats.tradedDays
              ? fmt(Math.round(monthStats.totalPnl / monthStats.tradedDays)) : "—", color: "#a0a0a0" },
            { label: "Win Rate", value: `${monthStats.winRate}%`,
              color: monthStats.winRate >= 50 ? "#4de894" : "#ff6b78" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ flex: 1, background: "#080808", border: "1px solid #141414",
              borderRadius: 12, padding: "16px 20px" }}>
              <div style={{ fontSize: 10, color: "#252525", fontFamily: "'DM Mono',monospace",
                letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color, letterSpacing: "-0.03em" }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ position: "fixed", bottom: 24, left: 32, fontFamily: "'DM Mono',monospace",
        fontSize: 11, color: "#181818", letterSpacing: "0.12em", textTransform: "uppercase" }}>
        Dashboard
      </div>

      {modal && (
        <LogTradeModal date={modal.date} dateStr={modal.dateStr}
          existing={modal.existing} onSave={saveTrade}
          onDelete={deleteTrade} onClose={() => setModal(null)} />
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; background: #030303; }
        ::-webkit-scrollbar-thumb { background: #181818; border-radius: 3px; }
        input::placeholder { color: #222; }
        textarea::placeholder { color: #222; }
        select option { background: #0e0e0e; color: #e0e0e0; }
      `}</style>
    </div>
  );
}

// ─── App Root ────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#030303", display: "flex",
        alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#1e1e1e", fontFamily: "'DM Mono',monospace",
          fontSize: 13, letterSpacing: "0.1em" }}>Loading…</div>
      </div>
    );
  }

  if (!user) return <AuthPage onAuth={setUser} />;
  return <Dashboard user={user} onLogout={() => setUser(null)} />;
}
