import { createContext, useContext, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { API_ORIGIN } from "../config/api.js";

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const socketRef = useRef(null);
  const tokenRef = useRef("");

  useEffect(() => {
    const syncConnection = () => {
      const token = localStorage.getItem("token") || "";
      if (token === tokenRef.current) return;

      socketRef.current?.disconnect();
      socketRef.current = null;
      tokenRef.current = token;
      setSocket(null);

      if (!token) return;

      const nextSocket = io(API_ORIGIN, { auth: { token }, reconnection: true });
      socketRef.current = nextSocket;
      setSocket(nextSocket);
    };

    syncConnection();
    window.addEventListener("roommate-auth-changed", syncConnection);
    window.addEventListener("storage", syncConnection);
    return () => {
      window.removeEventListener("roommate-auth-changed", syncConnection);
      window.removeEventListener("storage", syncConnection);
      socketRef.current?.disconnect();
      socketRef.current = null;
      tokenRef.current = "";
    };
  }, []);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  return useContext(SocketContext);
}
