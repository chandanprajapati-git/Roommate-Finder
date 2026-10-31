
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import './App.css'
import Chat from "./components/Chat";
import Login from "./components/Login";
import Signup from "./components/Signup";
import Dashboard from "./pages/Dashboard";
import Requests from "./pages/Requests";
import Profile from "./pages/Profile";
import Friends from "./pages/Friends";
import { ThemeProvider } from "./contexts/ThemeContext";
import { SocketProvider } from "./contexts/SocketContext";
import { FeedbackProvider } from "./contexts/FeedbackContext";
import { CallProvider } from "./contexts/CallContext";

// Protect pages that require login
const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem("token");

  return token ? children : <Navigate to="/login" replace />;
};

function App() {
  return (
    <ThemeProvider>
    <FeedbackProvider>
    <BrowserRouter>
      <SocketProvider>
      <CallProvider>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        {/* Protected routes */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
  path="/profile"
  element={
    <ProtectedRoute>
      <Profile />
    </ProtectedRoute>
  }
/>
        <Route
          path="/requests"
          element={
            <ProtectedRoute>
              <Requests />
            </ProtectedRoute>
          }
        />

        <Route
          path="/chat"
          element={
            <ProtectedRoute>
              <Chat />
            </ProtectedRoute>
          }
        />
        <Route path="/friends" element={<ProtectedRoute><Friends /></ProtectedRoute>} />

        {/* Unknown routes */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      </CallProvider>
      </SocketProvider>
    </BrowserRouter>
    </FeedbackProvider>
    </ThemeProvider>
  );
}

export default App;
