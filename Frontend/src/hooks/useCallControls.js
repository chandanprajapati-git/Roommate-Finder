import { useContext } from "react";
import { CallContext } from "../contexts/CallContextValue";

export function useCallControls() {
  const context = useContext(CallContext);
  if (!context) throw new Error("useCallControls must be used inside CallProvider");
  return context;
}
