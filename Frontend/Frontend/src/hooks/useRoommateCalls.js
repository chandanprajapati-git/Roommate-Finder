import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";

import { API_BASE_URL as API } from "../config/api.js";

export function useRoommateCalls({ socket, token, notify }) {
  const [call, setCall] = useState(null);
  const [callHistory, setCallHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const callRef = useRef(null);
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const pendingCandidatesRef = useRef([]);
  const finishTimerRef = useRef(null);
  const negotiationTimerRef = useRef(null);
  const statsTimerRef = useRef(null);
  const ringtoneTimerRef = useRef(null);
  const ringtoneContextRef = useRef(null);
  const facingModeRef = useRef("user");

  const publish = useCallback((changes) => {
    const current = callRef.current;
    if (!current) return;
    const next = { ...current, ...changes };
    callRef.current = next;
    setCall(next);
  }, []);

  const stopRingtone = useCallback(() => {
    if (ringtoneTimerRef.current) window.clearInterval(ringtoneTimerRef.current);
    ringtoneTimerRef.current = null;
    ringtoneContextRef.current?.close().catch(() => {});
    ringtoneContextRef.current = null;
  }, []);

  const startRingtone = useCallback(() => {
    stopRingtone();
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      ringtoneContextRef.current = context;
      const playTone = () => {
        if (context.state !== "running") return;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = 660;
        gain.gain.setValueAtTime(0.0001, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.32);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.34);
      };
      playTone();
      ringtoneTimerRef.current = window.setInterval(playTone, 1000);
    } catch {
      // Browser autoplay policies may prevent ringtone playback until user interaction.
    }
  }, [stopRingtone]);

  const clearMedia = useCallback(() => {
    window.clearTimeout(negotiationTimerRef.current);
    window.clearInterval(statsTimerRef.current);
    negotiationTimerRef.current = null;
    statsTimerRef.current = null;
    stopRingtone();
    if (peerRef.current) {
      peerRef.current.onicecandidate = null;
      peerRef.current.ontrack = null;
      peerRef.current.onconnectionstatechange = null;
      peerRef.current.close();
      peerRef.current = null;
    }
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    callRef.current?.remoteStream?.getTracks().forEach((track) => track.stop());
    pendingCandidatesRef.current = [];
  }, [stopRingtone]);

  const finishCall = useCallback((payload = {}, notifyUser = true) => {
    const current = callRef.current;
    if (!current || (payload.callId && current.callId && payload.callId !== current.callId)) return;
    clearMedia();
    callRef.current = null;
    const finalCall = { ...current, state: payload.state || "ended", message: payload.message || "Call ended.", localStream: null, remoteStream: null };
    setCall(finalCall);
    if (notifyUser && payload.message) notify(payload.message, payload.state === "failed" ? "error" : "info");
    window.clearTimeout(finishTimerRef.current);
    finishTimerRef.current = window.setTimeout(() => setCall(null), 2200);
  }, [clearMedia, notify]);

  const flushCandidates = useCallback(async (peer) => {
    const queued = pendingCandidatesRef.current.splice(0);
    for (const candidate of queued) {
      try { await peer.addIceCandidate(new RTCIceCandidate(candidate)); }
      catch (error) { console.warn("Ignoring invalid ICE candidate:", error.message); }
    }
  }, []);

  const inspectRoute = useCallback(async (peer, attemptId) => {
    try {
      const stats = await peer.getStats();
      let pair;
      for (const report of stats.values()) {
        if (report.type === "transport" && report.selectedCandidatePairId) pair = stats.get(report.selectedCandidatePairId);
      }
      if (!pair) pair = [...stats.values()].find((report) => report.type === "candidate-pair" && (report.selected || (report.nominated && report.state === "succeeded")));
      const localCandidate = pair?.localCandidateId ? stats.get(pair.localCandidateId) : null;
      if (callRef.current?.attemptId === attemptId && localCandidate) publish({ iceRoute: localCandidate.candidateType === "relay" ? "TURN relay" : "Direct connection", turnRelay: localCandidate.candidateType === "relay" });
    } catch { /* getStats support varies by browser */ }
  }, [publish]);

  const createPeer = useCallback((attemptId, iceServers, stream) => {
    const peer = new RTCPeerConnection({ iceServers, iceTransportPolicy: "all" });
    peerRef.current = peer;
    localStreamRef.current = stream;
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));
    peer.onicecandidate = ({ candidate }) => {
      if (!candidate) return;
      const current = callRef.current;
      if (!current || current.attemptId !== attemptId) return;
      if (!current.callId) {
        current.pendingLocalCandidates.push(candidate.toJSON());
      } else {
        socket?.emit("iceCandidate", { callId: current.callId, candidate: candidate.toJSON() });
      }
    };
    peer.ontrack = (event) => {
      const remoteStream = event.streams?.[0] || new MediaStream([event.track]);
      if (callRef.current?.attemptId === attemptId) publish({ remoteStream });
    };
    peer.onconnectionstatechange = () => {
      if (callRef.current?.attemptId !== attemptId) return;
      if (peer.connectionState === "connected") {
        publish({ state: "connected", connectedAt: callRef.current.connectedAt || Date.now(), iceRoute: "Checking route…", turnRelay: null });
        socket?.emit("callConnected", { callId: callRef.current.callId });
        void inspectRoute(peer, attemptId);
        window.clearInterval(statsTimerRef.current);
        statsTimerRef.current = window.setInterval(() => { void inspectRoute(peer, attemptId); }, 2500);
        window.clearTimeout(negotiationTimerRef.current);
      } else if (peer.connectionState === "failed") {
        const callId = callRef.current.callId;
        socket?.emit("callFailed", { callId });
        finishCall({ callId, state: "failed", message: "The call connection failed. Check your network or TURN settings." });
      }
    };
    return peer;
  }, [finishCall, inspectRoute, publish, socket]);

  const fetchIceServers = useCallback(async () => {
    const response = await axios.get(`${API}/calls/ice-servers`, { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 });
    if (!Array.isArray(response.data.iceServers) || response.data.iceServers.length === 0) throw new Error("ICE server configuration is unavailable.");
    return response.data.iceServers;
  }, [token]);

  const startCall = useCallback(async (friend, callType) => {
    if (!socket?.connected) { notify("Call signaling is offline. Reconnect and try again.", "error"); return; }
    if (!friend?._id || !["audio", "video"].includes(callType) || callRef.current) return;
    window.clearTimeout(finishTimerRef.current);
    const attemptId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const initial = { attemptId, callId: null, peerUser: friend, role: "caller", callType, state: "requesting", localStream: null, remoteStream: null, pendingLocalCandidates: [], iceRoute: "", turnRelay: null };
    callRef.current = initial;
    setCall(initial);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Calls require a secure browser context with microphone support.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: callType === "video" ? { facingMode: "user" } : false });
      if (callRef.current?.attemptId !== attemptId) { stream.getTracks().forEach((track) => track.stop()); return; }
      localStreamRef.current = stream;
      const iceServers = await fetchIceServers();
      if (callRef.current?.attemptId !== attemptId) { stream.getTracks().forEach((track) => track.stop()); localStreamRef.current = null; return; }
      facingModeRef.current = "user";
      publish({ localStream: stream, state: "initiating" });
      const peer = createPeer(attemptId, iceServers, stream);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      if (callRef.current?.attemptId !== attemptId) return;
      publish({ state: "ringing" });
      negotiationTimerRef.current = window.setTimeout(() => {
        if (callRef.current?.attemptId !== attemptId) return;
        const id = callRef.current.callId;
        if (id) socket.emit("endCall", { callId: id });
        finishCall({ callId: id, state: "failed", message: "The call could not connect in time." });
      }, 60000);
      socket.emit("callUser", { receiverId: friend._id, callType, offer: peer.localDescription }, (result) => {
        if (callRef.current?.attemptId !== attemptId) {
          if (result?.ok && result.callId) socket.emit("endCall", { callId: result.callId });
          return;
        }
        if (!result?.ok) {
          finishCall({ state: "failed", message: result?.message || "Unable to place call." });
          return;
        }
        publish({ callId: result.callId });
        const current = callRef.current;
        current.pendingLocalCandidates.splice(0).forEach((candidate) => socket.emit("iceCandidate", { callId: result.callId, candidate }));
      });
    } catch (error) {
      finishCall({ state: "failed", message: error.name === "NotAllowedError" ? "Allow microphone and camera access to call." : error.response?.data?.message || error.message || "Unable to start the call." });
    }
  }, [createPeer, fetchIceServers, finishCall, notify, publish, socket]);

  const acceptCall = useCallback(async () => {
    const current = callRef.current;
    if (!current || current.state !== "incoming" || !socket?.connected) return;
    const attemptId = current.attemptId;
    stopRingtone();
    publish({ state: "requesting" });
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Calls require a secure browser context with microphone support.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: current.callType === "video" ? { facingMode: "user" } : false });
      if (callRef.current?.attemptId !== attemptId) { stream.getTracks().forEach((track) => track.stop()); return; }
      localStreamRef.current = stream;
      const iceServers = await fetchIceServers();
      if (callRef.current?.attemptId !== attemptId) { stream.getTracks().forEach((track) => track.stop()); localStreamRef.current = null; return; }
      const peer = createPeer(attemptId, iceServers, stream);
      await peer.setRemoteDescription(new RTCSessionDescription(current.offer));
      await flushCandidates(peer);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      publish({ state: "connecting", localStream: stream });
      const result = await new Promise((resolve) => socket.emit("acceptCall", { callId: current.callId, answer: peer.localDescription }, resolve));
      if (!result?.ok) throw new Error(result?.message || "This call is no longer available.");
      negotiationTimerRef.current = window.setTimeout(() => {
        if (callRef.current?.attemptId !== attemptId) return;
        const id = callRef.current.callId;
        socket.emit("endCall", { callId: id });
        finishCall({ callId: id, state: "failed", message: "The call could not connect in time." });
      }, 60000);
    } catch (error) {
      socket.emit("callFailed", { callId: current.callId });
      finishCall({ callId: current.callId, state: "failed", message: error.name === "NotAllowedError" ? "Allow microphone and camera access to answer." : error.response?.data?.message || error.message || "Unable to answer the call." });
    }
  }, [createPeer, fetchIceServers, finishCall, flushCandidates, publish, socket, stopRingtone]);

  const rejectCall = useCallback(() => {
    const current = callRef.current;
    if (!current?.callId) return finishCall({ state: "ended", message: "Call declined." }, false);
    socket?.emit("rejectCall", { callId: current.callId });
    finishCall({ callId: current.callId, state: "ended", message: "Call declined." }, false);
  }, [finishCall, socket]);

  const endCall = useCallback(() => {
    const current = callRef.current;
    if (current?.callId) socket?.emit("endCall", { callId: current.callId });
    finishCall({ callId: current?.callId, state: "ended", message: "Call ended." }, false);
  }, [finishCall, socket]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const enabled = stream.getAudioTracks().some((track) => track.enabled);
    stream.getAudioTracks().forEach((track) => { track.enabled = !enabled; });
    publish({ muted: enabled });
  }, [publish]);

  const toggleCamera = useCallback(() => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    publish({ cameraOff: !track.enabled });
  }, [publish]);

  const switchCamera = useCallback(async () => {
    const current = callRef.current;
    if (!current || current.callType !== "video" || !navigator.mediaDevices?.getUserMedia) return;
    const nextFacing = facingModeRef.current === "user" ? "environment" : "user";
    try {
      const replacementStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: nextFacing } }, audio: false });
      const replacement = replacementStream.getVideoTracks()[0];
      const sender = peerRef.current?.getSenders().find((item) => item.track?.kind === "video");
      if (!replacement || !sender) { replacement?.stop(); return; }
      await sender.replaceTrack(replacement);
      localStreamRef.current.getVideoTracks().forEach((track) => { localStreamRef.current.removeTrack(track); track.stop(); });
      localStreamRef.current.addTrack(replacement);
      facingModeRef.current = nextFacing;
      publish({ localStream: new MediaStream(localStreamRef.current.getTracks()) });
    } catch { notify("Could not switch camera on this device.", "warning"); }
  }, [notify, publish]);

  const loadCallHistory = useCallback(async (friendId) => {
    if (!friendId || !token) return;
    setHistoryLoading(true);
    try {
      const response = await axios.get(`${API}/calls/history/${friendId}`, { headers: { Authorization: `Bearer ${token}` } });
      setCallHistory(response.data.calls || []);
    } catch (error) { notify(error.response?.data?.message || "Could not load call history.", "error"); }
    finally { setHistoryLoading(false); }
  }, [notify, token]);

  useEffect(() => {
    if (!socket) return undefined;
    const handleIncoming = (incoming) => {
      if (callRef.current) { socket.emit("rejectCall", { callId: incoming.callId }); return; }
      window.clearTimeout(finishTimerRef.current);
      const attemptId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
      const next = { ...incoming, attemptId, peerUser: incoming.caller, role: "receiver", state: "incoming", pendingLocalCandidates: [], iceRoute: "", turnRelay: null };
      callRef.current = next;
      setCall(next);
      startRingtone();
    };
    const handleAccepted = async ({ callId, answer }) => {
      const current = callRef.current;
      if (!current || current.callId !== callId || current.role !== "caller" || !peerRef.current) return;
      try {
        await peerRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        await flushCandidates(peerRef.current);
        publish({ state: "connecting" });
      } catch (error) {
        socket.emit("callFailed", { callId });
        finishCall({ callId, state: "failed", message: error.message || "Could not establish the call." });
      }
    };
    const handleCandidate = async ({ callId, candidate }) => {
      const current = callRef.current;
      if (!current || current.callId !== callId) return;
      if (!peerRef.current || !peerRef.current.remoteDescription) { pendingCandidatesRef.current.push(candidate); return; }
      try { await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate)); }
      catch (error) { console.warn("Ignoring invalid ICE candidate:", error.message); }
    };
    const handleConnected = ({ callId }) => {
      if (callRef.current?.callId === callId) publish({ state: "connected", connectedAt: callRef.current.connectedAt || Date.now() });
    };
    const handleEnded = (payload) => finishCall({ ...payload, state: payload.status === "failed" ? "failed" : "ended" });
    const handleFailed = (payload) => finishCall({ ...payload, state: "failed" });
    const handleBusy = (payload) => {
      if (!payload.callId && callRef.current?.role === "caller") finishCall({ state: "failed", message: payload.message || "This user is busy." });
      else finishCall({ ...payload, state: "failed", message: payload.message || "This user is busy." });
    };
    const handleDisconnect = () => {
      const current = callRef.current;
      if (current) finishCall({ callId: current.callId, state: "failed", message: "Call ended because signaling disconnected." });
    };
    const handleConnectionRemoved = ({ userId }) => {
      const current = callRef.current;
      if (current && String(current.peerUser?._id || current.callerId) === String(userId)) endCall();
    };
    socket.on("incomingCall", handleIncoming);
    socket.on("callAccepted", handleAccepted);
    socket.on("callRejected", handleEnded);
    socket.on("callEnded", handleEnded);
    socket.on("callTimeout", handleFailed);
    socket.on("callFailed", handleFailed);
    socket.on("userBusy", handleBusy);
    socket.on("iceCandidate", handleCandidate);
    socket.on("callConnected", handleConnected);
    socket.on("disconnect", handleDisconnect);
    socket.on("roommateConnectionRemoved", handleConnectionRemoved);
    return () => {
      socket.off("incomingCall", handleIncoming);
      socket.off("callAccepted", handleAccepted);
      socket.off("callRejected", handleEnded);
      socket.off("callEnded", handleEnded);
      socket.off("callTimeout", handleFailed);
      socket.off("callFailed", handleFailed);
      socket.off("userBusy", handleBusy);
      socket.off("iceCandidate", handleCandidate);
      socket.off("callConnected", handleConnected);
      socket.off("disconnect", handleDisconnect);
      socket.off("roommateConnectionRemoved", handleConnectionRemoved);
    };
  }, [endCall, finishCall, flushCandidates, publish, socket, startRingtone]);

  useEffect(() => {
    const endBeforeUnload = () => {
      const current = callRef.current;
      if (current?.callId) socket?.emit("endCall", { callId: current.callId });
      clearMedia();
      callRef.current = null;
    };
    window.addEventListener("pagehide", endBeforeUnload);
    return () => {
      window.removeEventListener("pagehide", endBeforeUnload);
      endBeforeUnload();
      window.clearTimeout(finishTimerRef.current);
    };
  }, [clearMedia, socket]);

  return { call, callHistory, historyLoading, startCall, acceptCall, rejectCall, endCall, toggleMute, toggleCamera, switchCamera, loadCallHistory };
}
