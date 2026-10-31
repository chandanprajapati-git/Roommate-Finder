import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Navbar from "../components/Navbar";
import { useSocket } from "../contexts/SocketContext";
import { UserName, formatName } from "../components/UserDisplay";
import "./Requests.css";
import { useFeedback } from "../hooks/useFeedback";

import { API_BASE_URL as API } from "../config/api.js";

export default function Requests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [profile, setProfile] = useState(null);
  const [noteId, setNoteId] = useState(null);
  const [activeTab, setActiveTab] = useState("pending");
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const initialPendingViewed = useRef(false);
  const reduceMotion = useReducedMotion();
  const navigate = useNavigate();
  const socket = useSocket();
  const { notify, confirm: confirmAction } = useFeedback();
  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const fetchRequests = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/request/received/${user._id}`, { headers: { Authorization: `Bearer ${token}` } });
      setRequests(response.data.requests || []);
      setUnreadCount(Number(response.data.unreadCount || 0));
    } catch (error) {
      console.error("Fetch requests error:", error.response?.data || error);
    } finally { setLoading(false); }
  }, [token, user._id]);

  const fetchBlockedUsers = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/user/blocked`, { headers: { Authorization: `Bearer ${token}` } });
      setBlockedUsers(response.data.users || []);
    } catch (error) {
      console.error("Fetch blocked users error:", error.response?.data || error);
    }
  }, [token]);

  useEffect(() => {
    if (!token || !user._id) { navigate("/login", { replace: true }); return; }
    fetchRequests();
    fetchBlockedUsers();
  }, [token, user._id, navigate, fetchRequests, fetchBlockedUsers]);

  const markPendingRead = useCallback(async () => {
    if (unreadCount <= 0) return;
    try {
      await axios.patch(`${API}/request/read-pending`, {}, { headers: { Authorization: `Bearer ${token}` } });
      setUnreadCount(0);
      setRequests((previous) => previous.map((request) => request.status === "pending" ? { ...request, isRead: true } : request));
    } catch (error) {
      console.error("Mark pending requests read error:", error.response?.data || error);
    }
  }, [token, unreadCount]);

  const selectTab = (tab) => {
    setActiveTab(tab);
    if (tab === "pending") markPendingRead();
  };

  useEffect(() => {
    if (!loading && activeTab === "pending" && !initialPendingViewed.current) {
      initialPendingViewed.current = true;
      markPendingRead();
    }
  }, [loading, activeTab, markPendingRead]);

  useEffect(() => {
    if (!socket) return undefined;
    const refresh = () => fetchRequests();
    const updateAvailability = ({ userId, totalBeds, occupiedBeds, requirementFulfilled }) => {
      setRequests((previous) => previous.map((request) => String(request.sender?._id) === String(userId)
        ? { ...request, sender: { ...request.sender, totalBeds, occupiedBeds, requirementFulfilled } }
        : request));
    };
    socket.on("newRoommateRequest", refresh);
    socket.on("roommateRequestCancelled", refresh);
    const refreshBlockState = () => { fetchBlockedUsers(); fetchRequests(); };
    socket.on("roommateConnectionRemoved", refreshBlockState);
    socket.on("roomAvailabilityUpdated", updateAvailability);
    return () => { socket.off("newRoommateRequest", refresh); socket.off("roommateRequestCancelled", refresh); socket.off("roommateConnectionRemoved", refreshBlockState); socket.off("roomAvailabilityUpdated", updateAvailability); };
  }, [socket, fetchRequests, fetchBlockedUsers]);

  useEffect(() => {
    if (!profile) return undefined;
    const onKeyDown = (event) => { if (event.key === "Escape") setProfile(null); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [profile]);

  const updateStatus = async (requestId, status) => {
    try {
      setUpdatingId(requestId);
      await axios.patch(`${API}/request/${requestId}/status`, { status }, { headers: { Authorization: `Bearer ${token}` } });
      await fetchRequests();
      if (status === "rejected") setActiveTab("rejected");
    } catch (error) { notify(error.response?.data?.message || "Something went wrong", "error"); }
    finally { setUpdatingId(null); }
  };

  const unblockUser = async (blockedUser) => {
    if (!await confirmAction(`Unblock ${formatName(blockedUser.name) || "this user"}? They can send a new request if other requirements are met.`, { title: "Unblock user", confirmLabel: "Unblock" })) return;
    try {
      setUpdatingId(blockedUser._id);
      await axios.delete(`${API}/user/${blockedUser._id}/block`, { headers: { Authorization: `Bearer ${token}` } });
      setBlockedUsers((previous) => previous.filter((item) => String(item._id) !== String(blockedUser._id)));
      notify("User unblocked.", "success");
    } catch (error) { notify(error.response?.data?.message || "Could not unblock user.", "error"); }
    finally { setUpdatingId(null); }
  };

  const blockUser = async (blockedUser) => {
    if (!await confirmAction(`Block ${formatName(blockedUser.name) || "this user"}? They will be unable to send you roommate requests.`, { title: "Block user", danger: true, confirmLabel: "Block" })) return;
    try {
      setUpdatingId(blockedUser._id);
      await axios.post(`${API}/user/${blockedUser._id}/block`, {}, { headers: { Authorization: `Bearer ${token}` } });
      setRequests((previous) => previous.filter((request) => String(request.sender?._id) !== String(blockedUser._id)));
      setBlockedUsers((previous) => previous.some((item) => String(item._id) === String(blockedUser._id)) ? previous : [...previous, blockedUser]);
      notify("User blocked.", "success");
    } catch (error) { notify(error.response?.data?.message || "Could not block user.", "error"); }
    finally { setUpdatingId(null); }
  };

  const visibleRequests = requests.filter((request) => activeTab === "pending" ? request.status === "pending" : activeTab === "rejected" && request.status === "rejected");

  return <><Navbar /><main className="requests-container">
    <header className="requests-heading"><h1>Roommate requests</h1><p>Review requests, past decisions, and blocked users.</p></header>
    <div className="request-tabs" role="tablist" aria-label="Request categories">
      {[['pending', 'Pending'], ['rejected', 'Rejected'], ['blocked', 'Blocked']].map(([tab, label]) => <motion.button key={tab} type="button" role="tab" aria-selected={activeTab === tab} className={`request-tab${activeTab === tab ? " active" : ""}`} onClick={() => selectTab(tab)} whileTap={reduceMotion ? undefined : { scale: .97 }}>
        {label}{tab === "pending" && unreadCount > 0 && <motion.span className="pending-tab-badge" initial={reduceMotion ? false : { scale: .7 }} animate={{ scale: 1 }} key={unreadCount}>{unreadCount > 99 ? "99+" : unreadCount}</motion.span>}
      </motion.button>)}
    </div>
    {loading && <p>Loading…</p>}
    {!loading && activeTab !== "blocked" && visibleRequests.length === 0 && <p className="requests-empty">{activeTab === "pending" ? "No pending requests." : "No rejected requests."}</p>}
    {activeTab === "blocked" && blockedUsers.length === 0 && !loading && <p className="requests-empty">You have not blocked anyone.</p>}
    {activeTab === "blocked" ? <div className="requests-list blocked-users-list">{blockedUsers.map((blockedUser) => <motion.article className="request-card blocked-user-card" key={blockedUser._id} initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} layout>
      <button className="request-profile-trigger" type="button" onClick={() => setProfile(blockedUser)} aria-label={`View ${formatName(blockedUser.name) || "blocked user"}'s profile`}>
        {blockedUser.profileImage ? <img src={blockedUser.profileImage} alt="" /> : <span className="request-avatar-fallback">{(blockedUser.name || "U").charAt(0).toUpperCase()}</span>}
      </button>
      <button className="request-person-summary" type="button" onClick={() => setProfile(blockedUser)}><strong><UserName user={blockedUser} /></strong><span>{[blockedUser.city, blockedUser.state].filter(Boolean).join(", ") || "Location not provided"}</span></button>
      <span className="request-status request-status-blocked">Blocked</span>
      <div className="request-card-actions"><button type="button" disabled={updatingId === blockedUser._id} onClick={() => unblockUser(blockedUser)}>{updatingId === blockedUser._id ? "Unblocking…" : "Unblock"}</button></div>
    </motion.article>)}</div> : <div className="requests-list">{visibleRequests.map((request) => {
      const sender = request.sender || {};
      const location = [sender.city, sender.state].filter(Boolean).join(", ");
      return <motion.article className="request-card" key={request._id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} layout>
        <button className="request-profile-trigger" type="button" onClick={() => setProfile(sender)} aria-label={`View ${formatName(sender.name) || "sender"}'s profile`}>
          {sender.profileImage ? <img src={sender.profileImage} alt="" /> : <span className="request-avatar-fallback">{(sender.name || "U").charAt(0).toUpperCase()}</span>}
        </button>
        <button className="request-person-summary" type="button" onClick={() => setProfile(sender)}>
          <strong><UserName user={sender} /></strong><span>{location || "Location not provided"}</span>
        </button>
        <span className={`request-status request-status-${request.status}`} aria-label={`Request ${request.status}`}>
          {request.status === "pending" ? <><motion.span className="request-status-dot pending" animate={reduceMotion ? undefined : { opacity: [1, .55, 1], scale: [1, .85, 1] }} transition={{ duration: 1.5, repeat: Infinity }} />Pending</> : request.status === "rejected" ? "Rejected" : <><motion.svg className="request-status-check" viewBox="0 0 20 20" aria-hidden="true" initial={reduceMotion ? false : { scale: .7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}><path d="m4 10 4 4 8-8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></motion.svg>Accepted</>}
        </span>
        <div className="request-card-actions">
          {request.note && <button type="button" className="request-note-view" onClick={() => setNoteId(noteId === request._id ? null : request._id)}>{noteId === request._id ? "Hide note" : "View note"}</button>}
          {activeTab === "pending" && request.status === "pending" && <>
            <motion.button type="button" className="request-accept" disabled={updatingId === request._id} onClick={() => updateStatus(request._id, "accepted")} whileTap={{ scale: .95 }}>{updatingId === request._id ? "Saving…" : "Accept"}</motion.button>
            <motion.button type="button" className="request-reject" disabled={updatingId === request._id} onClick={() => updateStatus(request._id, "rejected")} whileTap={{ scale: .95 }}>Reject</motion.button>
          </>}
          <button type="button" className="request-block-user" disabled={updatingId === sender._id} onClick={() => blockUser(sender)}>Block</button>
        </div>
        <AnimatePresence>{noteId === request._id && <motion.p className="request-note-text" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>{request.note}</motion.p>}</AnimatePresence>
      </motion.article>;
    })}</div>}
  </main>
  <AnimatePresence>{profile && <motion.div className="request-profile-backdrop" onClick={() => setProfile(null)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
    <motion.section className="request-profile-dialog" role="dialog" aria-modal="true" aria-labelledby="request-profile-name" onClick={(event) => event.stopPropagation()} initial={{ opacity: 0, scale: .92, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .96 }}>
      <button type="button" className="request-profile-close" onClick={() => setProfile(null)} aria-label="Close profile">×</button>
      {profile.profileImage ? <img className="request-profile-large" src={profile.profileImage} alt={`${formatName(profile.name) || "Roommate"}'s profile`} /> : <span className="request-profile-large request-avatar-fallback">{(profile.name || "U").charAt(0).toUpperCase()}</span>}
      <h2 id="request-profile-name">{formatName(profile.name) || "Roommate"}</h2>
      <dl>{[["Location", [profile.city, profile.state].filter(Boolean).join(", ")], ["Age", profile.age], ["Gender", profile.gender]].filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </motion.section>
  </motion.div>}</AnimatePresence></>;
}
