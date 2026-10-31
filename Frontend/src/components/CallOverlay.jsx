import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Camera, CameraOff, Mic, MicOff, Phone, PhoneOff, SwitchCamera, X } from "lucide-react";
import { formatName } from "./UserDisplay";
import "./CallOverlay.css";

export default function CallOverlay({ call, onAccept, onReject, onEnd, onToggleMute, onToggleCamera, onSwitchCamera }) {
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const localVideoRef = useRef(null);
  const [clock, setClock] = useState(0);
  const name = formatName(call?.peerUser?.name || call?.caller?.name) || "Roommate";
  const isIncoming = call?.state === "incoming";

  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = call?.remoteStream || null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = call?.remoteStream || null;
    if (localVideoRef.current) localVideoRef.current.srcObject = call?.localStream || null;
  }, [call?.localStream, call?.remoteStream, call?.state]);

  useEffect(() => {
    if (call?.state !== "connected" || !call.connectedAt) return undefined;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [call?.connectedAt, call?.state]);

  const elapsed = call?.connectedAt ? Math.max(0, Math.floor((clock - call.connectedAt) / 1000)) : 0;
  const duration = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;

  return <AnimatePresence>
    {call && <motion.div className="call-overlay-backdrop" role="presentation" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.section className={`call-panel ${call.callType === "video" ? "video-call-panel" : "audio-call-panel"}`} role="dialog" aria-modal="true" aria-labelledby="call-title" initial={{ opacity: 0, y: 14, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: .98 }}>
        <header className="call-panel-header">
          <div><h2 id="call-title">{name}</h2><p>{call.callType === "video" ? "Video call" : "Voice call"} · {call.state === "connected" ? duration : call.state === "requesting" ? "Waiting for permission…" : call.state === "initiating" ? "Connecting…" : call.state === "ringing" ? "Calling…" : call.state === "incoming" ? "Incoming call" : call.state === "connecting" ? "Connecting…" : call.message || "Call ended"}</p></div>
          {!isIncoming && <button type="button" className="call-close-button" onClick={onEnd} aria-label="End call"><X size={19} /></button>}
        </header>
        <div className="call-stage">
          {call.callType === "video" ? <>
            <video ref={remoteVideoRef} className="call-remote-video" autoPlay playsInline aria-label={`${name}'s video`} />
            {!call.remoteStream && <div className="call-remote-placeholder"><span>{(name || "R").charAt(0)}</span><p>{call.state === "connected" ? "Waiting for video…" : "Connecting video…"}</p></div>}
            {call.localStream && <video ref={localVideoRef} className="call-local-video" autoPlay muted playsInline aria-label="Your camera preview" />}
            <audio ref={remoteAudioRef} autoPlay />
          </> : <>
            <div className="audio-call-avatar">{call.peerUser?.profileImage || call.caller?.profileImage ? <img src={call.peerUser?.profileImage || call.caller?.profileImage} alt="" /> : <span>{(name || "R").charAt(0)}</span>}</div>
            <p className="audio-call-status">{call.state === "connected" ? "Connected" : call.state === "incoming" ? "Roommate is calling" : call.state === "ringing" ? "Ringing…" : call.state === "requesting" ? "Waiting for permission…" : call.state === "connecting" ? "Connecting…" : "Call in progress"}</p>
            <audio ref={remoteAudioRef} autoPlay />
          </>}
          {call.iceRoute && call.state === "connected" && <span className="call-route-badge" title="Selected ICE candidate pair">{call.iceRoute}</span>}
        </div>
        <footer className="call-controls">
          {isIncoming ? <>
            <button type="button" className="call-reject-control" onClick={onReject} aria-label="Reject call"><PhoneOff size={20} /></button>
            <button type="button" className="call-accept-control" onClick={onAccept} aria-label="Accept call"><Phone size={20} /></button>
          </> : <>
            <button type="button" className={call.muted ? "call-control active" : "call-control"} onClick={onToggleMute} aria-label={call.muted ? "Unmute microphone" : "Mute microphone"} title={call.muted ? "Unmute" : "Mute"}>{call.muted ? <MicOff size={19} /> : <Mic size={19} />}</button>
            {call.callType === "video" && <>
              <button type="button" className={call.cameraOff ? "call-control active" : "call-control"} onClick={onToggleCamera} aria-label={call.cameraOff ? "Enable camera" : "Disable camera"} title={call.cameraOff ? "Enable camera" : "Disable camera"}>{call.cameraOff ? <CameraOff size={19} /> : <Camera size={19} />}</button>
              <button type="button" className="call-control" onClick={onSwitchCamera} aria-label="Switch camera" title="Switch camera"><SwitchCamera size={19} /></button>
            </>}
            <button type="button" className="call-reject-control" onClick={onEnd} aria-label="End call" title="End call"><PhoneOff size={20} /></button>
          </>}
        </footer>
      </motion.section>
    </motion.div>}
  </AnimatePresence>;
}
