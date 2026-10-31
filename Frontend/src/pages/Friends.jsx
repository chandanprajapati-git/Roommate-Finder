import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import Navbar from "../components/Navbar";
import { UserName } from "../components/UserDisplay";
import { useSocket } from "../contexts/SocketContext";
import "./Friends.css";

export default function Friends() {
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const socket = useSocket();

  const fetchFriends = useCallback(async () => {
    try {
      const { data } = await axios.get("http://localhost:5000/api/request/accepted", { headers: { Authorization: `Bearer ${token}` } });
      setFriends(data.users || []);
      setError("");
    } catch (err) { setError(err.response?.data?.message || "Could not load friends."); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchFriends(); }, [fetchFriends]);
  useEffect(() => {
    if (!socket) return undefined;
    const updateAvailability = ({ userId, totalBeds, occupiedBeds, requirementFulfilled }) => {
      setFriends((previous) => previous.map((friend) => String(friend._id) === String(userId)
        ? { ...friend, totalBeds, occupiedBeds, requirementFulfilled }
        : friend));
    };
    socket.on("roommateRequestAccepted", fetchFriends);
    socket.on("roommateConnectionRemoved", fetchFriends);
    socket.on("roomAvailabilityUpdated", updateAvailability);
    return () => { socket.off("roommateRequestAccepted", fetchFriends); socket.off("roommateConnectionRemoved", fetchFriends); socket.off("roomAvailabilityUpdated", updateAvailability); };
  }, [socket, fetchFriends]);

  return <><Navbar /><main className="friends-page">
    <header><h1>Friends</h1><p>Your accepted roommate connections</p></header>
    {loading && <p>Loading friends…</p>}
    {!loading && error && <p role="alert">{error}</p>}
    {!loading && !error && friends.length === 0 && <p>You don’t have any accepted connections yet.</p>}
    <div className="friends-grid">{friends.map((friend) => <motion.button key={friend._id} className="friend-card" type="button" onClick={() => navigate("/chat", { state: { selectedUser: friend } })} whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }}>
      {friend.profileImage ? <img src={friend.profileImage} alt="" /> : <span className="friend-avatar-fallback">{(friend.name || "U").charAt(0).toUpperCase()}</span>}
      <span className="friend-card-copy"><strong><UserName user={friend} /></strong><span>{[friend.city, friend.state].filter(Boolean).join(", ") || "Location not provided"}</span></span>
      <span className="friend-card-arrow" aria-hidden="true">›</span>
    </motion.button>)}</div>
  </main></>;
}
