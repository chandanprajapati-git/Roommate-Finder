import { CallContext } from "./CallContextValue";
import { useSocket } from "./SocketContext";
import { useFeedback } from "../hooks/useFeedback";
import { useRoommateCalls } from "../hooks/useRoommateCalls";
import CallOverlay from "../components/CallOverlay";

export function CallProvider({ children }) {
  const socket = useSocket();
  const { notify } = useFeedback();
  const token = localStorage.getItem("token");
  const controls = useRoommateCalls({ socket, token, notify });
  return <CallContext.Provider value={controls}>{children}
    <CallOverlay call={controls.call} onAccept={controls.acceptCall} onReject={controls.rejectCall} onEnd={controls.endCall} onToggleMute={controls.toggleMute} onToggleCamera={controls.toggleCamera} onSwitchCamera={controls.switchCamera} />
  </CallContext.Provider>;
}
