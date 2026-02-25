/**
 * TodoFlow — A full-featured Todo application
 * Fixed: API uses "name" instead of "title", and "status" instead of "completed"
 */

import {
  useState, useEffect, useCallback, useRef, useReducer,
  Suspense, createContext, useContext, useMemo, startTransition,
  Component
} from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const BASE_URL = "https://api.oluwasetemi.dev";
const WS_URL   = "wss://api.oluwasetemi.dev/ws/tasks";
const PAGE_SIZE = 10;

// ─── Normalize API task → our shape ──────────────────────────────────────────
// The API returns { name, status } — we normalize to { title, completed }
function normalizeTask(t) {
  if (!t) return t;
  return {
    ...t,
    title:     t.name     ?? t.title     ?? "",
    completed: t.status === "DONE" ? true
             : t.status === "TODO" || t.status === "IN_PROGRESS" || t.status === "CANCELLED" ? false
             : t.completed ?? false,
  };
}

// ─── Auth Context ─────────────────────────────────────────────────────────────
const AuthCtx = createContext(null);
function useAuth() { return useContext(AuthCtx); }

function AuthProvider({ children }) {
  const [user,  setUser]  = useState(() => {
    try { return JSON.parse(localStorage.getItem("todo_user") || "null"); } catch { return null; }
  });
  const [token, setToken] = useState(() => localStorage.getItem("todo_token") || null);

  const login = useCallback((userData, jwt) => {
    setUser(userData); setToken(jwt);
    localStorage.setItem("todo_user",  JSON.stringify(userData));
    localStorage.setItem("todo_token", jwt);
  }, []);

  const logout = useCallback(async () => {
    try { await apiFetch("/auth/logout", { method: "POST" }, token); } catch {}
    setUser(null); setToken(null);
    localStorage.removeItem("todo_user");
    localStorage.removeItem("todo_token");
  }, [token]);

  return <AuthCtx.Provider value={{ user, token, login, logout, isAuthed: !!token }}>
    {children}
  </AuthCtx.Provider>;
}

// ─── Notifications Context ────────────────────────────────────────────────────
const NotifCtx = createContext(null);
function useNotif() { return useContext(NotifCtx); }

function NotifProvider({ children }) {
  const [notifs, dispatch] = useReducer((state, action) => {
    switch (action.type) {
      case "ADD":    return [action.notif, ...state].slice(0, 50);
      case "REMOVE": return state.filter(n => n.id !== action.id);
      case "CLEAR":  return [];
      default:       return state;
    }
  }, []);
  const [toast, setToast] = useState(null);

  const addNotif = useCallback((msg, type = "info", source = "system") => {
    // Always ensure msg is a plain string
    const safeMsg = typeof msg === "string" ? msg
      : msg?.message ?? msg?.error ?? JSON.stringify(msg);
    const notif = { id: Date.now() + Math.random(), msg: safeMsg, type, source, time: new Date() };
    dispatch({ type: "ADD", notif });
    setToast(notif);
    setTimeout(() => setToast(t => t?.id === notif.id ? null : t), 4000);
  }, []);

  const removeNotif = useCallback(id => dispatch({ type: "REMOVE", id }), []);
  const clearNotifs = useCallback(() => dispatch({ type: "CLEAR" }), []);

  return <NotifCtx.Provider value={{ notifs, addNotif, removeNotif, clearNotifs }}>
    {children}
    {toast && (
      <div
        role="alert" aria-live="polite"
        className={`toast-enter fixed bottom-4 right-4 z-50 max-w-sm rounded-lg shadow-xl p-4 flex items-start gap-3
          ${toast.type === "success" ? "bg-emerald-900 border border-emerald-600 text-emerald-100"
          : toast.type === "error"   ? "bg-red-900 border border-red-600 text-red-100"
          : toast.type === "ws"      ? "bg-violet-900 border border-violet-600 text-violet-100"
          : "bg-slate-800 border border-slate-600 text-slate-100"}`}
      >
        <span className="text-lg mt-0.5">
          {toast.type === "success" ? "✓" : toast.type === "error" ? "✕" : toast.type === "ws" ? "⚡" : "ℹ"}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-snug">{toast.msg}</p>
          {toast.source === "websocket" && (
            <p className="text-xs opacity-60 mt-0.5">Real-time update</p>
          )}
        </div>
        <button onClick={() => setToast(null)} className="opacity-60 hover:opacity-100 ml-2 text-lg leading-none" aria-label="Dismiss">×</button>
      </div>
    )}
  </NotifCtx.Provider>;
}

// ─── Cache / Offline ──────────────────────────────────────────────────────────
const cache = {
  _store: {},
  set(key, data) { this._store[key] = { data, ts: Date.now() }; try { localStorage.setItem("tc_" + key, JSON.stringify({ data, ts: Date.now() })); } catch {} },
  get(key, maxAge = 300_000) {
    const mem = this._store[key];
    if (mem && Date.now() - mem.ts < maxAge) return mem.data;
    try { const s = localStorage.getItem("tc_" + key); if (s) { const p = JSON.parse(s); if (Date.now() - p.ts < maxAge * 10) return p.data; } } catch {}
    return null;
  }
};

// ─── API Helpers ──────────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}, token = null) {
  const headers = { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...opts.headers };
  const res = await fetch(BASE_URL + path, { ...opts, headers });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (typeof j.message === "string") msg = j.message;
      else if (typeof j.error === "string") msg = j.error;
      else if (j.issues) msg = j.issues.map(i => i.message).join(", ");
      else msg = JSON.stringify(j);
    } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ─── Simple Query Hook ────────────────────────────────────────────────────────
function useQuery(key, fetcher, { enabled = true } = {}) {
  const [state, setState] = useState({ data: cache.get(key) || null, loading: !cache.get(key) && enabled, error: null });
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const cached = cache.get(key);
    if (cached) { setState({ data: cached, loading: false, error: null }); return; }
    setState(s => ({ ...s, loading: true, error: null }));
    fetchRef.current().then(data => {
      if (cancelled) return;
      cache.set(key, data);
      setState({ data, loading: false, error: null });
    }).catch(err => {
      if (cancelled) return;
      setState(s => ({ ...s, loading: false, error: err.message }));
    });
    return () => { cancelled = true; };
  }, [key, enabled]);

  const refetch = useCallback(() => {
    setState(s => ({ ...s, loading: true, error: null }));
    fetchRef.current().then(data => {
      cache.set(key, data);
      setState({ data, loading: false, error: null });
    }).catch(err => setState(s => ({ ...s, loading: false, error: err.message })));
  }, [key]);

  return { ...state, refetch };
}

// ─── Error Boundary ───────────────────────────────────────────────────────────
class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("ErrorBoundary caught:", error, info); }
  render() {
    if (this.state.error) {
      return this.props.fallback
        ? this.props.fallback({ error: this.state.error, reset: () => this.setState({ error: null }) })
        : <ErrorPage error={this.state.error} reset={() => this.setState({ error: null })} />;
    }
    return this.props.children;
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────
const RouterCtx = createContext(null);

function Router({ children }) {
  const [path, setPath] = useState(window.location.pathname + window.location.search);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname + window.location.search);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const navigate = useCallback((to) => {
    window.history.pushState({}, "", to);
    setPath(to);
    window.scrollTo(0, 0);
  }, []);
  return <RouterCtx.Provider value={{ path, navigate }}>{children}</RouterCtx.Provider>;
}

function useRouter() { return useContext(RouterCtx); }

function Link({ to, children, className = "", ...props }) {
  const { navigate } = useRouter();
  return (
    <a href={to} className={className} onClick={e => { e.preventDefault(); navigate(to); }} {...props}>
      {children}
    </a>
  );
}

function Routes({ routes }) {
  const { path } = useRouter();
  const pathOnly = path.split("?")[0];
  for (const route of routes) {
    const match = matchRoute(route.path, pathOnly);
    if (match !== null) {
      const Comp = route.component;
      return <ErrorBoundary key={pathOnly}><Comp params={match} /></ErrorBoundary>;
    }
  }
  return <NotFoundPage />;
}

function matchRoute(pattern, path) {
  const pParts = pattern.split("/").filter(Boolean);
  const uParts = path.split("/").filter(Boolean);
  if (pParts.length !== uParts.length) return null;
  const params = {};
  for (let i = 0; i < pParts.length; i++) {
    if (pParts[i].startsWith(":")) { params[pParts[i].slice(1)] = uParts[i]; }
    else if (pParts[i] !== uParts[i]) return null;
  }
  return params;
}

// ─── Shared UI ────────────────────────────────────────────────────────────────
function Spinner({ size = "md" }) {
  const s = size === "sm" ? "w-4 h-4" : size === "lg" ? "w-10 h-10" : "w-6 h-6";
  return (
    <div role="status" aria-label="Loading">
      <div className={`${s} border-2 border-slate-600 border-t-violet-400 rounded-full animate-spin`} />
    </div>
  );
}

function Badge({ children, variant = "default" }) {
  const cls = {
    default:    "bg-slate-700 text-slate-300",
    success:    "bg-emerald-900 text-emerald-300 border border-emerald-700",
    pending:    "bg-amber-900 text-amber-300 border border-amber-700",
    destructive:"bg-red-900 text-red-300 border border-red-700",
  }[variant] || "bg-slate-700 text-slate-300";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{children}</span>;
}

function Button({ children, variant = "primary", size = "md", className = "", loading, ...props }) {
  const base = "inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed";
  const sz   = { sm: "px-3 py-1.5 text-sm", md: "px-4 py-2 text-sm", lg: "px-6 py-3 text-base" }[size];
  const v    = {
    primary:   "bg-violet-600 hover:bg-violet-500 text-white shadow-sm",
    secondary: "bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600",
    ghost:     "hover:bg-slate-800 text-slate-300",
    danger:    "bg-red-700 hover:bg-red-600 text-white",
    success:   "bg-emerald-700 hover:bg-emerald-600 text-white",
  }[variant];
  return (
    <button className={`${base} ${sz} ${v} ${className}`} disabled={loading || props.disabled} {...props}>
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  );
}

function Input({ label, error, id, className = "", required, ...props }) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-slate-300">
          {label}{required && <span className="text-red-400 ml-1" aria-hidden="true">*</span>}
        </label>
      )}
      <input
        id={inputId}
        aria-required={required}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-error` : undefined}
        className={`bg-slate-800 border ${error ? "border-red-500" : "border-slate-600"} text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent placeholder-slate-500 ${className}`}
        {...props}
      />
      {error && <p id={`${inputId}-error`} role="alert" className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

function Modal({ open, onClose, title, children }) {
  const ref = useRef(null);
  useEffect(() => {
    if (open) { ref.current?.focus(); document.body.style.overflow = "hidden"; }
    else { document.body.style.overflow = ""; }
    return () => { document.body.style.overflow = ""; };
  }, [open]);
  useEffect(() => {
    const onKey = e => { if (e.key === "Escape" && open) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-40 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden="true" />
      <div ref={ref} tabIndex={-1} className="relative bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto focus:outline-none">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
          <button onClick={onClose} aria-label="Close dialog" className="text-slate-400 hover:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded p-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function ConfirmDialog({ open, onClose, onConfirm, title, description, loading }) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-sm text-slate-400 mb-6">{description}</p>
      <div className="flex gap-3 justify-end">
        <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
        <Button variant="danger" onClick={onConfirm} loading={loading}>Delete</Button>
      </div>
    </Modal>
  );
}

// ─── Todo Form ────────────────────────────────────────────────────────────────
function TodoForm({ initial, onSubmit, onCancel, loading }) {
  const [title,       setTitle]       = useState(initial?.title || initial?.name || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [completed,   setCompleted]   = useState(initial?.completed ?? false);
  const [errors,      setErrors]      = useState({});

  const validate = () => {
    const e = {};
    if (!title.trim()) e.title = "Title is required";
    if (title.length > 200) e.title = "Title must be under 200 characters";
    return e;
  };

  const handleSubmit = e => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    onSubmit({ title: title.trim(), description: description.trim(), completed });
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <Input label="Title" required value={title} onChange={e => { setTitle(e.target.value); setErrors(s => ({ ...s, title: "" })); }} error={errors.title} placeholder="What needs to be done?" />
      <div className="flex flex-col gap-1">
        <label htmlFor="desc" className="text-sm font-medium text-slate-300">Description</label>
        <textarea id="desc" rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional details..." className="bg-slate-800 border border-slate-600 text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent placeholder-slate-500 resize-none" />
      </div>
      {initial && (
        <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-slate-300">
          <input type="checkbox" checked={completed} onChange={e => setCompleted(e.target.checked)} className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-violet-500 focus:ring-violet-500" />
          Mark as completed
        </label>
      )}
      <div className="flex gap-3 justify-end pt-2">
        <Button variant="secondary" type="button" onClick={onCancel}>Cancel</Button>
        <Button type="submit" loading={loading}>{initial ? "Save Changes" : "Create Todo"}</Button>
      </div>
    </form>
  );
}

// ─── Todo Card ────────────────────────────────────────────────────────────────
function TodoCard({ todo, onEdit, onDelete, onToggle, userId }) {
  const { navigate } = useRouter();
  const title     = todo.title || todo.name || "Untitled";
  const completed = todo.completed ?? (todo.status === "DONE");
  const isOwner   = !userId || todo.owner === userId;

  return (
    <article className="group bg-slate-800/60 border border-slate-700 rounded-xl p-4 hover:border-violet-500/50 transition-all hover:shadow-lg hover:shadow-violet-900/20 focus-within:ring-2 focus-within:ring-violet-500" aria-label={`Todo: ${title}`}>
      <div className="flex items-start gap-3">
        <button onClick={() => onToggle(todo)} aria-label={completed ? "Mark incomplete" : "Mark complete"} className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${completed ? "bg-emerald-500 border-emerald-500" : "border-slate-500 hover:border-violet-400"}`}>
          {completed && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        </button>
        <div className="flex-1 min-w-0">
          <button onClick={() => navigate(`/todos/${todo.id || todo._id}`)} className={`text-left font-medium text-sm leading-snug transition-colors focus:outline-none focus-visible:underline w-full ${completed ? "line-through text-slate-500" : "text-slate-100 hover:text-violet-300"}`}>
            {title}
          </button>
          {todo.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{todo.description}</p>}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge variant={completed ? "success" : "pending"}>{completed ? "Done" : "Pending"}</Badge>
            {todo.createdAt && <span className="text-xs text-slate-600">{new Date(todo.createdAt).toLocaleDateString()}</span>}
          </div>
        </div>
        {isOwner && <div className="flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <button onClick={() => onEdit(todo)} aria-label="Edit todo" className="p-1.5 text-slate-400 hover:text-violet-300 hover:bg-slate-700 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button onClick={() => onDelete(todo)} aria-label="Delete todo" className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
          </button>
        </div>}
      </div>
    </article>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────
function Pagination({ page, totalPages, onChange }) {
  const pages = useMemo(() => {
    const p = []; const delta = 2;
    for (let i = Math.max(1, page - delta); i <= Math.min(totalPages, page + delta); i++) p.push(i);
    return p;
  }, [page, totalPages]);
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="flex items-center justify-center gap-1">
      <Button variant="ghost" size="sm" onClick={() => onChange(page - 1)} disabled={page === 1} aria-label="Previous page">←</Button>
      {pages[0] > 1 && <><Button variant="ghost" size="sm" onClick={() => onChange(1)}>1</Button>{pages[0] > 2 && <span className="text-slate-600 px-1">…</span>}</>}
      {pages.map(p => <Button key={p} size="sm" variant={p === page ? "primary" : "ghost"} onClick={() => onChange(p)} aria-label={`Page ${p}`} aria-current={p === page ? "page" : undefined}>{p}</Button>)}
      {pages[pages.length - 1] < totalPages && <>{pages[pages.length - 1] < totalPages - 1 && <span className="text-slate-600 px-1">…</span>}<Button variant="ghost" size="sm" onClick={() => onChange(totalPages)}>{totalPages}</Button></>}
      <Button variant="ghost" size="sm" onClick={() => onChange(page + 1)} disabled={page === totalPages} aria-label="Next page">→</Button>
    </nav>
  );
}

// ─── WebSocket Hook ───────────────────────────────────────────────────────────
function useWebSocket(token, onMessage) {
  const wsRef = useRef(null);
  const cbRef = useRef(onMessage);
  cbRef.current = onMessage;
  useEffect(() => {
    if (!token) return;
    let reconnectTimer; let dead = false;
    function connect() {
      try {
        const ws = new WebSocket(`${WS_URL}?token=${token}`);
        wsRef.current = ws;
        ws.onmessage = e => { try { cbRef.current(JSON.parse(e.data)); } catch {} };
        ws.onclose = () => { if (!dead) reconnectTimer = setTimeout(connect, 5000); };
        ws.onerror = () => ws.close();
      } catch {}
    }
    connect();
    return () => { dead = true; clearTimeout(reconnectTimer); wsRef.current?.close(); };
  }, [token]);
}

// ─── Layout ───────────────────────────────────────────────────────────────────
// ─── Theme Context ────────────────────────────────────────────────────────────
const ThemeCtx = createContext(null);
function useTheme() { return useContext(ThemeCtx); }

function ThemeProvider({ children }) {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem("todo_theme");
    if (saved) return saved === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("todo_theme", dark ? "dark" : "light");
  }, [dark]);

  const toggle = useCallback(() => setDark(d => !d), []);
  return <ThemeCtx.Provider value={{ dark, toggle }}>{children}</ThemeCtx.Provider>;
}

function Navbar() {
  const { user, logout, isAuthed } = useAuth();
  const { notifs } = useNotif();
  const { navigate } = useRouter();
  const { dark, toggle: toggleTheme } = useTheme();
  const [showNotifs, setShowNotifs] = useState(false);
  const [menuOpen,   setMenuOpen]   = useState(false);

  return (
    <header className="fixed top-0 inset-x-0 z-30 bg-slate-950/90 backdrop-blur border-b border-slate-800">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-bold text-slate-100 hover:text-violet-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-violet-400"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 12l2 2 4-4"/></svg>
          <span className="text-sm tracking-wide">TodoFlow</span>
        </Link>
        <div className="flex items-center gap-2">
          {isAuthed && (
            <>
              <div className="relative">
                <button onClick={() => setShowNotifs(s => !s)} aria-label={`Notifications (${notifs.length} unread)`} className="relative p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
                  {notifs.length > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-violet-500 rounded-full" aria-hidden="true" />}
                </button>
                {showNotifs && <NotifPanel onClose={() => setShowNotifs(false)} />}
              </div>
              <div className="relative">
                <button onClick={() => setMenuOpen(s => !s)} aria-expanded={menuOpen} aria-label="User menu" className="flex items-center gap-2 text-sm text-slate-300 hover:text-slate-100 px-2 py-1 rounded-lg hover:bg-slate-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">
                  <div className="w-7 h-7 rounded-full bg-violet-600 flex items-center justify-center text-xs font-bold text-white">{(user?.name || user?.email || "U")[0].toUpperCase()}</div>
                  <span className="hidden sm:block max-w-24 truncate">{user?.name || user?.email}</span>
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-full mt-1 bg-slate-900 border border-slate-700 rounded-xl shadow-xl w-44 overflow-hidden z-50">
                    <Link to="/profile" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors">Profile</Link>
                    <button onClick={() => { setMenuOpen(false); logout(); navigate("/login"); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:bg-slate-800 transition-colors">Sign out</button>
                  </div>
                )}
              </div>
            </>
          )}
          {!isAuthed && (
            <div className="flex gap-2">
              <button
                onClick={toggleTheme}
                aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
                className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              >
                {dark
                  ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                  : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
                }
              </button>
              <Link to="/login"><Button variant="ghost" size="sm">Sign in</Button></Link>
              <Link to="/register"><Button size="sm">Sign up</Button></Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function NotifPanel({ onClose }) {
  const { notifs, removeNotif, clearNotifs } = useNotif();
  const ref = useRef(null);
  useEffect(() => {
    const handler = e => { if (!ref.current?.contains(e.target)) onClose(); };
    setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);
  return (
    <div ref={ref} className="absolute right-0 top-full mt-1 w-80 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden" aria-label="Notifications">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <h3 className="text-sm font-semibold text-slate-200">Notifications</h3>
        {notifs.length > 0 && <button onClick={clearNotifs} className="text-xs text-slate-500 hover:text-slate-300">Clear all</button>}
      </div>
      <div className="max-h-72 overflow-y-auto">
        {notifs.length === 0 ? <p className="text-center text-slate-600 text-sm py-8">No notifications</p>
        : notifs.map(n => (
          <div key={n.id} className="flex items-start gap-3 px-4 py-3 border-b border-slate-800/50 hover:bg-slate-800/50">
            <span className="mt-0.5 text-sm">{n.type === "ws" ? "⚡" : n.type === "success" ? "✓" : "ℹ"}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-300 leading-snug">{n.msg}</p>
              <p className="text-xs text-slate-600 mt-0.5">{n.time.toLocaleTimeString()}</p>
            </div>
            <button onClick={() => removeNotif(n.id)} className="text-slate-600 hover:text-slate-400 text-sm" aria-label="Dismiss">×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Layout({ children }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Navbar />
      <main id="main-content" className="pt-14 min-h-screen">{children}</main>
    </div>
  );
}

// ─── Pages ────────────────────────────────────────────────────────────────────

// Decode userId from JWT
function getUserId(tok) {
  try { return JSON.parse(atob(tok.split(".")[1])).userId; } catch { return null; }
}

function HomePage() {
  const { token, isAuthed } = useAuth();
  const userId = token ? getUserId(token) : null;
  const { addNotif } = useNotif();

  const [page,       setPage]       = useState(1);
  const [search,     setSearch]     = useState("");
  const [filter,     setFilter]     = useState("all");
  const [editTodo,   setEditTodo]   = useState(null);
  const [deleteTodo, setDeleteTodo] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [mutating,   setMutating]   = useState(false);
  const [offline,    setOffline]    = useState(!navigator.onLine);

  useEffect(() => {
    const on = () => setOffline(false); const off = () => setOffline(true);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  const qKey = `tasks-${page}-${filter}-${search}`;

  const fetchTasks = useCallback(async () => {
    if (!isAuthed) return { data: [], total: 0 };
    const params = new URLSearchParams({ page, limit: PAGE_SIZE });
    if (filter === "complete")   params.set("status", "DONE");
    if (filter === "incomplete") params.set("status", "TODO");
    if (search) params.set("search", search);
    const res = await apiFetch(`/tasks?${params}`, {}, token);
    // Normalize so title/completed are always set
    if (Array.isArray(res)) return res.map(normalizeTask);
    if (res?.data)  return { ...res, data:  res.data.map(normalizeTask) };
    if (res?.tasks) return { ...res, tasks: res.tasks.map(normalizeTask) };
    return res;
  }, [page, filter, search, token, isAuthed]);

  const { data: resp, loading, error, refetch } = useQuery(qKey, fetchTasks, { enabled: isAuthed });

  const allTodos   = resp?.data || resp?.tasks || (Array.isArray(resp) ? resp : []);
  // Only show tasks owned by the current logged-in user
  const todos       = userId ? allTodos.filter(t => t.owner === userId) : allTodos;
  const total       = todos.length;
  const totalPages  = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useWebSocket(token, evt => {
    if (!evt?.type) return;
    const map = { TASK_CREATED: "Task created", TASK_UPDATED: "Task updated", TASK_DELETED: "Task deleted" };
    const msg = map[evt.type];
    if (msg) { addNotif(msg + (evt.data?.name ? `: "${evt.data.name}"` : ""), "ws", "websocket"); refetch(); }
  });

  // ── CRUD: send { name, status } which is what the API requires ──
  const createTodo = async (data) => {
    setMutating(true);
    try {
      await apiFetch("/tasks", {
        method: "POST",
        body: JSON.stringify({ name: data.title, status: data.completed ? "DONE" : "TODO", ...(data.description ? { description: data.description } : {}) })
      }, token);
      addNotif("Todo created!", "success");
      cache._store = {};
      setShowCreate(false);
      refetch();
    } catch (e) { addNotif(e.message, "error"); }
    finally { setMutating(false); }
  };

  const updateTodo = async (data) => {
    setMutating(true);
    try {
      await apiFetch(`/tasks/${editTodo.id || editTodo._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name:        data.title,
          status:      data.completed ? "DONE" : "TODO",
          description: data.description,
        })
      }, token);
      addNotif("Todo updated!", "success");
      cache._store = {};
      setEditTodo(null);
      refetch();
    } catch (e) { addNotif(e.message, "error"); }
    finally { setMutating(false); }
  };

  const deleteTodoConfirm = async () => {
    setMutating(true);
    try {
      await apiFetch(`/tasks/${deleteTodo.id || deleteTodo._id}`, { method: "DELETE" }, token);
      addNotif("Todo deleted.", "info");
      cache._store = {};
      setDeleteTodo(null);
      refetch();
    } catch (e) { addNotif(e.message, "error"); }
    finally { setMutating(false); }
  };

  const toggleTodo = async (todo) => {
    try {
      await apiFetch(`/tasks/${todo.id || todo._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name:   todo.title || todo.name,
          status: todo.completed ? "TODO" : "DONE",
        })
      }, token);
      cache._store = {};
      refetch();
    } catch (e) { addNotif(e.message, "error"); }
  };

  if (!isAuthed) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-24 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-violet-900/30 border border-violet-700/50 mb-6">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-violet-400"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 12l2 2 4-4"/></svg>
        </div>
        <h1 className="text-3xl font-bold text-slate-100 mb-3">TodoFlow</h1>
        <p className="text-slate-400 mb-8 text-lg">Organize your work. Stay in flow.</p>
        <div className="flex gap-3 justify-center">
          <Link to="/login"><Button size="lg" variant="secondary">Sign in</Button></Link>
          <Link to="/register"><Button size="lg">Get started</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">My Tasks</h1>
          {!loading && <p className="text-sm text-slate-500 mt-0.5">{total} task{total !== 1 ? "s" : ""} total</p>}
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New task
        </Button>
      </div>

      {offline && (
        <div role="alert" className="bg-amber-900/30 border border-amber-700 text-amber-300 text-sm px-4 py-2.5 rounded-lg mb-4 flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          You're offline — showing cached data
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="search" placeholder="Search tasks…" value={search} onChange={e => { startTransition(() => { setSearch(e.target.value); setPage(1); }); }} aria-label="Search tasks" className="w-full bg-slate-800 border border-slate-600 text-slate-100 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 placeholder-slate-500" />
        </div>
        <div role="group" aria-label="Filter by status" className="flex gap-1">
          {["all", "complete", "incomplete"].map(f => (
            <button key={f} onClick={() => { setFilter(f); setPage(1); }} aria-pressed={filter === f} className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${filter === f ? "bg-violet-600 text-white" : "bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700"}`}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="flex justify-center py-20"><Spinner size="lg" /></div>}
      {error && (
        <div role="alert" className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-sm">
          Failed to load tasks: {error}
          <button onClick={refetch} className="ml-3 underline hover:no-underline">Retry</button>
        </div>
      )}
      {!loading && !error && (
        <>
          {todos.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-slate-600 text-lg mb-2">{search || filter !== "all" ? "No tasks match your filters" : "No tasks yet"}</p>
              {!search && filter === "all" && <Button variant="secondary" size="sm" onClick={() => setShowCreate(true)}>Create your first task</Button>}
            </div>
          ) : (
            <div className="flex flex-col gap-3 mb-6">
              {todos.map(todo => <TodoCard key={todo.id || todo._id} todo={todo} onEdit={setEditTodo} onDelete={setDeleteTodo} onToggle={toggleTodo} userId={userId} />)}
            </div>
          )}
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Task">
        <TodoForm onSubmit={createTodo} onCancel={() => setShowCreate(false)} loading={mutating} />
      </Modal>
      <Modal open={!!editTodo} onClose={() => setEditTodo(null)} title="Edit Task">
        {editTodo && <TodoForm initial={editTodo} onSubmit={updateTodo} onCancel={() => setEditTodo(null)} loading={mutating} />}
      </Modal>
      <ConfirmDialog open={!!deleteTodo} onClose={() => setDeleteTodo(null)} onConfirm={deleteTodoConfirm} loading={mutating} title="Delete Task" description={`Are you sure you want to delete "${deleteTodo?.title || deleteTodo?.name}"? This cannot be undone.`} />
    </div>
  );
}

function TodoDetailPage({ params }) {
  const { token } = useAuth();
  const { navigate } = useRouter();
  const { addNotif } = useNotif();
  const [editing, setEditing]   = useState(false);
  const [mutating, setMutating] = useState(false);

  const { data: todo, loading, error, refetch } = useQuery(
    `task-${params.id}`,
    async () => normalizeTask(await apiFetch(`/tasks/${params.id}`, {}, token)),
    { enabled: !!token }
  );

  const update = async (data) => {
    setMutating(true);
    try {
      await apiFetch(`/tasks/${params.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: data.title, status: data.completed ? "DONE" : "TODO", description: data.description })
      }, token);
      addNotif("Task updated!", "success");
      cache._store = {};
      setEditing(false);
      refetch();
    } catch (e) { addNotif(e.message, "error"); }
    finally { setMutating(false); }
  };

  if (loading) return <div className="flex justify-center pt-32"><Spinner size="lg" /></div>;
  if (error)   return <ErrorPage error={{ message: error }} reset={() => navigate("/")} />;
  if (!todo)   return <NotFoundPage />;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button onClick={() => navigate("/")} className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 mb-6 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
        Back to tasks
      </button>
      <article className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${todo.completed ? "bg-emerald-500 border-emerald-500" : "border-slate-500"}`}>
              {todo.completed && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </div>
            <h1 className={`text-xl font-semibold ${todo.completed ? "line-through text-slate-500" : "text-slate-100"}`}>{todo.title}</h1>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>Edit</Button>
        </div>
        {todo.description && <p className="text-slate-400 text-sm leading-relaxed mb-6 ml-9">{todo.description}</p>}
        <dl className="ml-9 grid grid-cols-2 gap-4 text-sm">
          <div><dt className="text-slate-500 text-xs uppercase tracking-wide mb-1">Status</dt><dd><Badge variant={todo.completed ? "success" : "pending"}>{todo.completed ? "Completed" : "Pending"}</Badge></dd></div>
          {todo.createdAt && <div><dt className="text-slate-500 text-xs uppercase tracking-wide mb-1">Created</dt><dd className="text-slate-300">{new Date(todo.createdAt).toLocaleString()}</dd></div>}
          {todo.updatedAt && <div><dt className="text-slate-500 text-xs uppercase tracking-wide mb-1">Updated</dt><dd className="text-slate-300">{new Date(todo.updatedAt).toLocaleString()}</dd></div>}
          <div><dt className="text-slate-500 text-xs uppercase tracking-wide mb-1">ID</dt><dd className="text-slate-500 font-mono text-xs">{todo.id || todo._id}</dd></div>
        </dl>
      </article>
      <Modal open={editing} onClose={() => setEditing(false)} title="Edit Task">
        <TodoForm initial={todo} onSubmit={update} onCancel={() => setEditing(false)} loading={mutating} />
      </Modal>
    </div>
  );
}

function AuthForm({ mode }) {
  const { login } = useAuth();
  const { navigate } = useRouter();
  const { addNotif } = useNotif();
  const [form,    setForm]    = useState({ name: "", email: "", password: "" });
  const [errors,  setErrors]  = useState({});
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const e = {};
    if (mode === "register" && !form.name.trim()) e.name = "Name is required";
    if (!form.email.trim()) e.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = "Invalid email";
    if (!form.password) e.password = "Password is required";
    else if (form.password.length < 6) e.password = "Minimum 6 characters";
    return e;
  };

  const handleSubmit = async e => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setLoading(true);
    try {
      const path = mode === "login" ? "/auth/login" : "/auth/register";
      const body = mode === "login" ? { email: form.email, password: form.password } : { name: form.name, email: form.email, password: form.password };
      const res = await apiFetch(path, { method: "POST", body: JSON.stringify(body) });
      const token = res.token || res.accessToken || res.access_token;
      const user  = res.user  || res.data || { email: form.email, name: form.name };
      if (!token) throw new Error("No token received");
      login(user, token);
      addNotif(mode === "login" ? "Welcome back!" : "Account created!", "success");
      navigate("/");
    } catch (err) { addNotif(err.message, "error"); setErrors({ server: err.message }); }
    finally { setLoading(false); }
  };

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(s => ({ ...s, [k]: "", server: "" })); };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-violet-900/30 border border-violet-700/50 mb-4">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-violet-400"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 12l2 2 4-4"/></svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-100">{mode === "login" ? "Welcome back" : "Create account"}</h1>
          <p className="text-slate-400 text-sm mt-1">{mode === "login" ? "Sign in to access your tasks" : "Start organizing your work"}</p>
        </div>
        <form onSubmit={handleSubmit} noValidate className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col gap-4">
          {errors.server && <p role="alert" className="text-sm text-red-400 bg-red-900/20 border border-red-800 px-3 py-2 rounded-lg">{errors.server}</p>}
          {mode === "register" && <Input label="Name" required type="text" value={form.name} onChange={e => set("name", e.target.value)} error={errors.name} placeholder="Your name" autoComplete="name" />}
          <Input label="Email" required type="email" value={form.email} onChange={e => set("email", e.target.value)} error={errors.email} placeholder="you@example.com" autoComplete="email" />
          <Input label="Password" required type="password" value={form.password} onChange={e => set("password", e.target.value)} error={errors.password} placeholder={mode === "register" ? "Min 6 characters" : "Your password"} autoComplete={mode === "login" ? "current-password" : "new-password"} />
          <Button type="submit" loading={loading} className="mt-2">{mode === "login" ? "Sign in" : "Create account"}</Button>
        </form>
        <p className="text-center text-sm text-slate-500 mt-4">
          {mode === "login" ? "No account? " : "Already have one? "}
          <Link to={mode === "login" ? "/register" : "/login"} className="text-violet-400 hover:text-violet-300 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded">
            {mode === "login" ? "Sign up" : "Sign in"}
          </Link>
        </p>
      </div>
    </div>
  );
}

function ProfilePage() {
  const { user, token, logout } = useAuth();
  const { navigate } = useRouter();
  const { data: me } = useQuery("auth-me", () => apiFetch("/auth/me", {}, token), { enabled: !!token });
  const profile = me?.user || me?.data || user || {};

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-100 mb-6">Profile</h1>
      <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-2xl bg-violet-600 flex items-center justify-center text-2xl font-bold text-white">{(profile.name || profile.email || "U")[0].toUpperCase()}</div>
          <div><h2 className="text-lg font-semibold text-slate-100">{profile.name || "—"}</h2><p className="text-sm text-slate-400">{profile.email || user?.email}</p></div>
        </div>
        <dl className="grid grid-cols-2 gap-4 text-sm border-t border-slate-700 pt-4">
          {[["ID", profile.id || profile._id], ["Role", profile.role], ["Verified", profile.verified ? "Yes" : "No"], ["Joined", profile.createdAt ? new Date(profile.createdAt).toLocaleDateString() : "—"]].map(([k, v]) => v ? (
            <div key={k}><dt className="text-slate-500 text-xs uppercase tracking-wide mb-1">{k}</dt><dd className="text-slate-300">{v}</dd></div>
          ) : null)}
        </dl>
        <div className="mt-6 pt-4 border-t border-slate-700">
          <Button variant="danger" onClick={async () => { await logout(); navigate("/login"); }}>Sign out</Button>
        </div>
      </div>
    </div>
  );
}

function ErrorPage({ error, reset }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-900/30 border border-red-700/50 mb-6">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-red-400"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      </div>
      <h1 className="text-2xl font-bold text-slate-100 mb-2">Something went wrong</h1>
      <p className="text-slate-400 text-sm mb-6 max-w-sm">{error?.message || "An unexpected error occurred."}</p>
      <div className="flex gap-3">
        {reset && <Button variant="secondary" onClick={reset}>Try again</Button>}
        <Link to="/"><Button>Go home</Button></Link>
      </div>
    </div>
  );
}

function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <p className="text-8xl font-black text-slate-800 mb-4" aria-hidden="true">404</p>
      <h1 className="text-2xl font-bold text-slate-100 mb-2">Page not found</h1>
      <p className="text-slate-400 text-sm mb-6">The page you're looking for doesn't exist.</p>
      <Link to="/"><Button>Go home</Button></Link>
    </div>
  );
}

function ThrowPage() {
  throw new Error("This is a test error thrown to demonstrate the Error Boundary.");
}

function Protected({ component: Comp, params }) {
  const { isAuthed } = useAuth();
  const { navigate } = useRouter();
  useEffect(() => { if (!isAuthed) navigate("/login"); }, [isAuthed]);
  if (!isAuthed) return null;
  return <Comp params={params} />;
}

const ROUTES = [
  { path: "/",           component: HomePage },
  { path: "/todos/:id",  component: (p) => <Protected component={TodoDetailPage} params={p.params} /> },
  { path: "/login",      component: () => <AuthForm mode="login" /> },
  { path: "/register",   component: () => <AuthForm mode="register" /> },
  { path: "/profile",    component: (p) => <Protected component={ProfilePage} params={p.params} /> },
  { path: "/test-error", component: ThrowPage },
];

function SEO({ title = "TodoFlow", description = "Organize your work. Stay in flow." }) {
  useEffect(() => {
    document.title = title === "TodoFlow" ? title : `${title} | TodoFlow`;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) { meta = document.createElement("meta"); meta.name = "description"; document.head.appendChild(meta); }
    meta.content = description;
  }, [title, description]);
  return null;
}

export default function App() {
  return (
    <>
      <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%237c3aed'/%3E%3Cpath d='M8 16l5 5 11-10' stroke='white' strokeWidth='3' strokeLinecap='round' strokeLinejoin='round' fill='none'/%3E%3C/svg%3E" />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300..700;1,9..40,300..700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <style>{`
        * { box-sizing: border-box; }
        html { color-scheme: dark; }
        html.dark { color-scheme: dark; }
        html:not(.dark) { color-scheme: light; }
        /* Light mode overrides */
        html:not(.dark) body { background-color: #f8fafc; color: #0f172a; }
        html:not(.dark) .bg-slate-950 { background-color: #f8fafc !important; }
        html:not(.dark) .bg-slate-950\/90 { background-color: rgba(248,250,252,0.95) !important; }
        html:not(.dark) .bg-slate-900 { background-color: #f1f5f9 !important; }
        html:not(.dark) .bg-slate-800 { background-color: #e2e8f0 !important; }
        html:not(.dark) .bg-slate-800\/50 { background-color: rgba(226,232,240,0.5) !important; }
        html:not(.dark) .bg-slate-800\/60 { background-color: rgba(226,232,240,0.6) !important; }
        html:not(.dark) .border-slate-800 { border-color: #cbd5e1 !important; }
        html:not(.dark) .border-slate-700 { border-color: #94a3b8 !important; }
        html:not(.dark) .border-slate-600 { border-color: #94a3b8 !important; }
        html:not(.dark) .text-slate-100 { color: #0f172a !important; }
        html:not(.dark) .text-slate-200 { color: #1e293b !important; }
        html:not(.dark) .text-slate-300 { color: #334155 !important; }
        html:not(.dark) .text-slate-400 { color: #475569 !important; }
        html:not(.dark) .text-slate-500 { color: #64748b !important; }
        html:not(.dark) .text-slate-600 { color: #94a3b8 !important; }
        html:not(.dark) .text-slate-800 { color: #cbd5e1 !important; }
        html:not(.dark) .hover\:bg-slate-800:hover { background-color: #e2e8f0 !important; }
        html:not(.dark) .hover\:bg-slate-700:hover { background-color: #e2e8f0 !important; }
        html:not(.dark) .placeholder-slate-500::placeholder { color: #94a3b8 !important; }
        body { font-family: 'DM Sans', system-ui, sans-serif; }
        code, .font-mono { font-family: 'DM Mono', monospace; }
        .toast-enter { animation: slideUp 0.3s ease; }
        @keyframes slideUp { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        :focus-visible { outline: 2px solid #7c3aed; outline-offset: 2px; }
      `}</style>
      <script src="https://cdn.tailwindcss.com" />
      <SEO />
      <Router>
        <ThemeProvider>
        <AuthProvider>
          <NotifProvider>
            <Layout>
              <Suspense fallback={<div className="flex justify-center pt-32"><Spinner size="lg" /></div>}>
                <ErrorBoundary>
                  <Routes routes={ROUTES} />
                </ErrorBoundary>
              </Suspense>
              <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:bg-violet-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm font-medium">
                Skip to main content
              </a>
            </Layout>
          </NotifProvider>
        </AuthProvider>
        </ThemeProvider>
      </Router>
    </>
  );
}