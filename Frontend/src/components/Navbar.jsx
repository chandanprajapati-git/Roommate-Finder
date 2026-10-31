
import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { motion } from "motion/react";
import { useTheme } from "../contexts/ThemeContext";
import { useSocket } from "../contexts/SocketContext";
import "./Navbar.css";

const API = "http://localhost:5000/api";

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [chatCount, setChatCount] = useState(0);
  const [requestCount, setRequestCount] = useState(0);
  const { theme, toggleTheme } = useTheme();
  const socketRef = useRef(null);
  const audioContextRef = useRef(null);
  const soundEnabledRef = useRef(true);
  const acceptedIdsRef = useRef(new Set());
  const acceptedSyncInitializedRef = useRef(false);
  const [acceptedToast, setAcceptedToast] = useState(null);
  const socket = useSocket();
  const [acceptedCount, setAcceptedCount] = useState(0);

  const token = localStorage.getItem("token");

  const user = JSON.parse(
    localStorage.getItem("user") || "{}"
  );

  const myId = user._id;

  // PLAY NOTIFICATION SOUND
  const playSound = () => {
    try {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;

      if (!AudioContextClass) return;

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContextClass();
      }

      const audioContext = audioContextRef.current;

      if (audioContext.state === "suspended") {
        audioContext.resume();
      }

      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(
        850,
        audioContext.currentTime
      );

      gainNode.gain.setValueAtTime(
        0.3,
        audioContext.currentTime
      );

      gainNode.gain.exponentialRampToValueAtTime(
        0.001,
        audioContext.currentTime + 0.35
      );

      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.35);
    } catch (error) {
      console.log("Sound Error:", error);
    }
  };

  // Prime the audio context on the user's first interaction so later
  // notification sounds can play without a separate enable button.
  useEffect(() => {
    soundEnabledRef.current = localStorage.getItem("notificationSoundEnabled") !== "false";
    const syncSound = () => { soundEnabledRef.current = localStorage.getItem("notificationSoundEnabled") !== "false"; };
    window.addEventListener("roommate-sound-preference-changed", syncSound);
    window.addEventListener("storage", syncSound);
    return () => { window.removeEventListener("roommate-sound-preference-changed", syncSound); window.removeEventListener("storage", syncSound); };
  }, []);

  useEffect(() => {
    const primeAudio = () => {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass || !soundEnabledRef.current) return;
      audioContextRef.current ??= new AudioContextClass();
      audioContextRef.current.resume().catch(() => {});
      window.removeEventListener("pointerdown", primeAudio);
      window.removeEventListener("keydown", primeAudio);
    };

    window.addEventListener("pointerdown", primeAudio, { once: true });
    window.addEventListener("keydown", primeAudio, { once: true });
    return () => {
      window.removeEventListener("pointerdown", primeAudio);
      window.removeEventListener("keydown", primeAudio);
    };
  }, []);

  // FETCH PENDING ROOMMATE REQUEST COUNT
  const fetchRequestCount = async () => {
    try {
      const response = await axios.get(
        `${API}/request/pending-count`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setRequestCount(response.data.count || 0);
    } catch (error) {
      console.log(
        "Request Count Error:",
        error.response?.data || error
      );
    }
  };

  // SOCKET CONNECTION AND NOTIFICATIONS
  useEffect(() => {
    if (!token || !myId) return;
    if (!socket) return;

    fetchRequestCount();
    const eventNames = ["connect", "unreadCounts", "receiveMessage", "newRoommateRequest", "roommateRequestAccepted", "pendingRequestsRead", "roommateConnectionRemoved"];
    const priorListeners = Object.fromEntries(eventNames.map((name) => [name, socket.listeners(name)]));

    const syncAcceptedRequests = async () => {
      try {
        const response = await axios.get(`${API}/request/sent`, { headers: { Authorization: `Bearer ${token}` } });
        const accepted = (response.data.requests || []).filter((request) => request.status === "accepted");
        const currentIds = accepted.map((request) => String(request._id));
        const storedIds = localStorage.getItem("knownAcceptedRoommateRequestIds");
        if (!acceptedSyncInitializedRef.current) {
          acceptedSyncInitializedRef.current = true;
          if (storedIds === null) {
            currentIds.forEach((id) => acceptedIdsRef.current.add(id));
            localStorage.setItem("knownAcceptedRoommateRequestIds", JSON.stringify(currentIds));
            return;
          }
        }
        const knownIds = new Set(JSON.parse(storedIds || "[]").map(String));
        const newlyAccepted = accepted.filter((request) => !knownIds.has(String(request._id)) && !acceptedIdsRef.current.has(String(request._id)));
        currentIds.forEach((id) => acceptedIdsRef.current.add(id));
        localStorage.setItem("knownAcceptedRoommateRequestIds", JSON.stringify(currentIds));
        if (newlyAccepted.length) {
          const newest = newlyAccepted[0];
          setAcceptedCount((count) => count + newlyAccepted.length);
          setAcceptedToast(`${newest.receiver?.name || "Your roommate"} accepted your roommate request.`);
          playSound();
        }
      } catch (error) {
        console.log("Accepted request sync error:", error.response?.data || error);
      }
    };

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("Navbar socket connected:", socket.id);

      socket.emit("getUnreadCounts");
      syncAcceptedRequests();
    });
    if (socket.connected) { socket.emit("getUnreadCounts"); syncAcceptedRequests(); }
    syncAcceptedRequests();

    // RECEIVE UNREAD CHAT COUNTS
    socket.on("unreadCounts", (counts) => {
      const total = Object.values(counts || {}).reduce(
        (sum, count) => sum + Number(count || 0),
        0
      );

      setChatCount(total);
    });

    // NEW CHAT MESSAGE
    socket.on("receiveMessage", (newMessage) => {
      const receiverId =
        typeof newMessage.receiver === "object"
          ? newMessage.receiver?._id
          : newMessage.receiver;

      if (String(receiverId) !== String(myId)) return;

      setChatCount((prev) => prev + 1);

      playSound();
    });

    // NEW ROOMMATE REQUEST
    socket.on("newRoommateRequest", () => {
      fetchRequestCount();
      playSound();
    });
    socket.on("pendingRequestsRead", fetchRequestCount);
    socket.on("roommateConnectionRemoved", fetchRequestCount);

    socket.on("roommateRequestAccepted", ({ requestId, acceptedBy }) => {
      if (requestId && acceptedIdsRef.current.has(String(requestId))) return;
      if (requestId) acceptedIdsRef.current.add(String(requestId));
      if (requestId) {
        try {
          const ids = new Set(JSON.parse(localStorage.getItem("knownAcceptedRoommateRequestIds") || "[]").map(String));
          ids.add(String(requestId));
          localStorage.setItem("knownAcceptedRoommateRequestIds", JSON.stringify([...ids]));
        } catch { localStorage.setItem("knownAcceptedRoommateRequestIds", JSON.stringify([String(requestId)])); }
      }
      setAcceptedCount((count) => count + 1);
      setAcceptedToast(`${acceptedBy?.name || "Your roommate"} accepted your roommate request.`);
      playSound();
      window.dispatchEvent(new CustomEvent("roommate-request-accepted"));
      window.setTimeout(() => setAcceptedToast(null), 5000);
    });

    return () => {
      eventNames.forEach((name) => socket.listeners(name).forEach((listener) => {
        if (!priorListeners[name].includes(listener)) socket.off(name, listener);
      }));
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [token, myId, socket]);

  // LOGOUT
  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.dispatchEvent(new Event("roommate-auth-changed"));

    navigate("/login", { replace: true });
  };

  const isActive = (path) => location.pathname === path;

  return (
    <nav className="navbar">
      <Link to="/dashboard" className="navbar-logo">
        Roommate<span>Finder</span>
      </Link>

      <div className="navbar-links">
        <Link
          to="/dashboard"
          className={isActive("/dashboard") ? "active" : ""}
        >
          Dashboard
        </Link>

        <Link
          to="/requests"
          className={`navbar-notification-link ${
            isActive("/requests") ? "active" : ""
          }`}
        >
          Requests

          {requestCount > 0 && (
            <motion.span className="navbar-badge" initial={{ scale: 0.6 }} animate={{ scale: 1 }}>
              {requestCount > 99 ? "99+" : requestCount}
            </motion.span>
          )}
        </Link>

        <Link to="/friends" onClick={() => setAcceptedCount(0)} className={`navbar-notification-link ${isActive("/friends") ? "active" : ""}`}>Friends{acceptedCount > 0 && <motion.span className="navbar-badge" initial={{ scale: 0.6 }} animate={{ scale: 1 }}>{acceptedCount > 99 ? "99+" : acceptedCount}</motion.span>}</Link>

        <Link
          to="/chat"
          className={`navbar-notification-link ${
            isActive("/chat") ? "active" : ""
          }`}
        >
          Chat

          {chatCount > 0 && (
            <motion.span className="navbar-badge" initial={{ scale: 0.6 }} animate={{ scale: 1 }}>
              {chatCount > 99 ? "99+" : chatCount}
            </motion.span>
          )}
        </Link>

        <Link
          to="/profile"
          className={isActive("/profile") ? "active" : ""}
        >
          Profile
        </Link>
      </div>

      <div className="navbar-actions">
        <motion.button
          className="theme-toggle"
          type="button"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === "dark" ? "day" : "dark"} mode`}
          title={`Switch to ${theme === "dark" ? "day" : "dark"} mode`}
          whileHover={{ rotate: 12, scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
        >
          <motion.span key={theme} initial={{ rotate: -40, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }}>
            {theme === "dark" ? "☀️" : "🌙"}
          </motion.span>
        </motion.button>

        <motion.button
          className="navbar-logout"
          onClick={handleLogout}
          type="button"
          aria-label="Log out"
          title="Log out"
          whileHover={{ x: 2, scale: 1.05 }}
          whileTap={{ scale: 0.94 }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5M15 12H3m9-7h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-6" /></svg>
          <span className="sr-only">Log out</span>
        </motion.button>
      </div>
      {acceptedToast && <motion.div className="roommate-accepted-toast" role="status" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>{acceptedToast}<button type="button" onClick={() => setAcceptedToast(null)} aria-label="Dismiss notification">×</button></motion.div>}
    </nav>
  );
};

export default Navbar;
