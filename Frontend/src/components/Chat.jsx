
import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Contact, FileText, Image, MapPin, Paperclip, Phone, Radio, Send, Smile, UserRound, Video } from "lucide-react";
import "./Chat.css";
import Navbar from "./Navbar";
import { UserName, formatName } from "./UserDisplay";
import { useSocket } from "../contexts/SocketContext";
import { useDismissiblePopup } from "../hooks/useDismissiblePopup";
import { useFeedback } from "../hooks/useFeedback";
import { useCallControls } from "../hooks/useCallControls";

import { API_BASE_URL as API } from "../config/api.js";

const getId = (value) => {
  return typeof value === "object" ? value?._id : value;
};

const Chat = () => {
  const [users, setUsers] = useState([]);
  const [myProfile, setMyProfile] = useState(JSON.parse(localStorage.getItem("user") || "{}"));
  const [selectedUser, setSelectedUser] = useState(null);
  const [profilePreviewOpen, setProfilePreviewOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [mediaGalleryOpen, setMediaGalleryOpen] = useState(false);
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const [callHistoryOpen, setCallHistoryOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [isTyping, setIsTyping] = useState(false);

  const [notificationPermission, setNotificationPermission] = useState(
    typeof window !== "undefined" && "Notification" in window
      ? Notification.permission
      : "unsupported"
  );

  const [selectedFile, setSelectedFile] = useState(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [liveLocationActive, setLiveLocationActive] = useState(false);
  const [contactShareOpen, setContactShareOpen] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);

  const bottomRef = useRef(null);
  const socketRef = useRef(null);
  const socket = useSocket();
  const { notify, confirm: confirmAction } = useFeedback();
  const chatMenuRef = useRef(null);
  const attachmentMenuRef = useRef(null);
  const attachmentButtonRef = useRef(null);
  const emojiPickerRef = useRef(null);
  const emojiButtonRef = useRef(null);
  const selectedUserRef = useRef(null);
  const photosInputRef = useRef(null);
  const documentsInputRef = useRef(null);
  const messageInputRef = useRef(null);
  const liveLocationWatchRef = useRef(null);
  const lastLiveLocationSentRef = useRef(0);
  const typingTimeoutRef = useRef(null);

  const navigate = useNavigate();
  const location = useLocation();
  const reduceMotion = useReducedMotion();

  useDismissiblePopup(chatMenuOpen, () => setChatMenuOpen(false), chatMenuRef);
  useDismissiblePopup(attachmentMenuOpen, () => setAttachmentMenuOpen(false), attachmentButtonRef, attachmentMenuRef);
  useDismissiblePopup(emojiPickerOpen, () => setEmojiPickerOpen(false), emojiButtonRef, emojiPickerRef);
  useEffect(() => { socketRef.current = socket; }, [socket]);
  useEffect(() => { if (!contactShareOpen) return undefined; const close = (event) => { if (event.key === "Escape") setContactShareOpen(false); }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, [contactShareOpen]);

  useEffect(() => {
    if (location.state?.selectedUser) setSelectedUser(location.state.selectedUser);
  }, [location.state]);

  useEffect(() => {
    if (!profilePreviewOpen) return undefined;
    const onKeyDown = (event) => { if (event.key === "Escape") setProfilePreviewOpen(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [profilePreviewOpen]);

  useEffect(() => {
    if (!mediaGalleryOpen) return undefined;
    const closeOnEscape = (event) => { if (event.key === "Escape") setMediaGalleryOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mediaGalleryOpen]);

  const token = localStorage.getItem("token");

  const currentUser = JSON.parse(
    localStorage.getItem("user") || "{}"
  );

  const myId = currentUser._id;
  const roommateCalls = useCallControls();

  useEffect(() => {
    if (!callHistoryOpen) return undefined;
    const close = (event) => { if (event.key === "Escape") setCallHistoryOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [callHistoryOpen]);

  // AUTHENTICATION CHECK
  useEffect(() => {
    if (!token || !myId) {
      navigate("/login", { replace: true });
    }
  }, [token, myId, navigate]);

  useEffect(() => {
    if (!token || !myId) return;
    axios.get(`${API}/user/${myId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => setMyProfile(response.data.user || {}))
      .catch(() => {});
  }, [token, myId]);

  // KEEP SELECTED USER UPDATED
  useEffect(() => {
    selectedUserRef.current = selectedUser;
    setIsTyping(false);
    if (liveLocationWatchRef.current !== null && liveLocationWatchRef.current !== undefined) {
      navigator.geolocation?.clearWatch(liveLocationWatchRef.current);
      liveLocationWatchRef.current = null;
      setLiveLocationActive(false);
    }
  }, [selectedUser]);

  useEffect(() => () => {
    if (liveLocationWatchRef.current !== null && liveLocationWatchRef.current !== undefined) {
      navigator.geolocation?.clearWatch(liveLocationWatchRef.current);
    }
  }, []);

  // STOP TYPING AND CLEAR TIMER
  const stopTyping = () => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    if (selectedUserRef.current && socketRef.current) {
      socketRef.current.emit(
        "stopTyping",
        selectedUserRef.current._id
      );
    }
  };

  // REQUEST BROWSER NOTIFICATION PERMISSION
  const enableNotifications = async () => {
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      notify("Your browser does not support notifications.", "warning");
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);

      if (permission === "granted") {
        new Notification("Notifications enabled", {
          body: "You will be notified when a new chat message arrives.",
        });
      }
    } catch (error) {
      console.log("Notification permission error:", error);
    }
  };

  // SOCKET.IO CONNECTION
  useEffect(() => {
    if (!token || !myId) return;
    if (!socket) return;
    const eventNames = ["connect", "connect_error", "onlineUsers", "unreadCounts", "receiveMessage", "messageStatusUpdated", "userTyping", "userStoppedTyping", "roommateConnectionRemoved", "chatDeleted", "roommateRequestAccepted", "roomAvailabilityUpdated"];
    const priorListeners = Object.fromEntries(eventNames.map((name) => [name, socket.listeners(name)]));

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("Socket connected:", socket.id);
      socket.emit("getOnlineUsers");
      socket.emit("getUnreadCounts");
    });
    if (socket.connected) { socket.emit("getOnlineUsers"); socket.emit("getUnreadCounts"); }

    socket.on("connect_error", (error) => {
      console.log("Socket connection error:", error.message);
    });

    socket.on("onlineUsers", (users) => {
      setOnlineUsers(users || []);
    });

    socket.on("unreadCounts", (counts) => {
      setUnreadCounts(counts || {});
    });

    // RECEIVE NEW MESSAGES
    socket.on("receiveMessage", (newMessage) => {
      console.log("New message received:", newMessage);

      const senderId = String(getId(newMessage.sender));
      const receiverId = String(getId(newMessage.receiver));

      const activeUser = selectedUserRef.current;

      const isIncomingMessage = receiverId === String(myId);

      const isActiveConversation =
        activeUser &&
        (
          (senderId === String(activeUser._id) &&
            receiverId === String(myId)) ||
          (senderId === String(myId) &&
            receiverId === String(activeUser._id))
        );

      // BROWSER NOTIFICATION
      if (
        isIncomingMessage &&
        !isActiveConversation &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        const senderName =
          formatName(newMessage.sender?.name) || "Your roommate";

        const notificationBody = newMessage.message?.trim()
          ? newMessage.message
          : newMessage.image
            ? "Sent you an image"
            : "You received a new message";

        const notification = new Notification(senderName, {
          body: notificationBody,
          tag: `roommate-message-${senderId}`,
        });

        notification.onclick = () => {
          window.focus();
          notification.close();
        };
      }

      // UPDATE DELIVERY / READ STATUS
      if (isIncomingMessage) {
        if (isActiveConversation) {
          socket.emit("messageRead", newMessage._id);
        } else {
          socket.emit("messageDelivered", newMessage._id);
        }
      }

      // ADD MESSAGE TO ACTIVE CONVERSATION
      if (isActiveConversation) {
        setMessages((prev) => {
          const alreadyExists = prev.some(
            (msg) => String(msg._id) === String(newMessage._id)
          );

          if (alreadyExists) return prev;

          return [...prev, newMessage];
        });
      }
    });

    // UPDATE MESSAGE STATUS
    socket.on("messageStatusUpdated", ({ messageId, status }) => {
      setMessages((prev) =>
        prev.map((msg) =>
          String(msg._id) === String(messageId)
            ? { ...msg, status }
            : msg
        )
      );
    });

    // TYPING INDICATOR
    socket.on("userTyping", ({ userId }) => {
      if (
        String(userId) ===
        String(selectedUserRef.current?._id)
      ) {
        setIsTyping(true);
      }
    });

    socket.on("userStoppedTyping", ({ userId }) => {
      if (
        String(userId) ===
        String(selectedUserRef.current?._id)
      ) {
        setIsTyping(false);
      }
    });

    socket.on("roommateConnectionRemoved", ({ userId }) => {
      setUsers((previous) => previous.filter((user) => String(user._id) !== String(userId)));
      if (String(selectedUserRef.current?._id) === String(userId)) {
        setSelectedUser(null);
        setMessages([]);
        setMediaGalleryOpen(false);
        setChatMenuOpen(false);
      }
    });

    socket.on("chatDeleted", ({ userId }) => {
      if (String(selectedUserRef.current?._id) === String(userId)) {
        setMessages([]);
        setMediaGalleryOpen(false);
        setChatMenuOpen(false);
      }
    });

    socket.on("roommateRequestAccepted", ({ acceptedBy }) => {
      if (!acceptedBy?._id) return;
      setUsers((previous) => previous.some((person) => String(person._id) === String(acceptedBy._id)) ? previous : [...previous, acceptedBy]);
    });

    socket.on("roomAvailabilityUpdated", ({ userId, totalBeds, occupiedBeds, requirementFulfilled }) => {
      const updateAvailability = (person) => String(person._id) === String(userId)
        ? { ...person, totalBeds, occupiedBeds, requirementFulfilled }
        : person;
      setUsers((previous) => previous.map(updateAvailability));
      setSelectedUser((previous) => previous ? updateAvailability(previous) : previous);
    });

    return () => {
      eventNames.forEach((name) => socket.listeners(name).forEach((listener) => {
        if (!priorListeners[name].includes(listener)) socket.off(name, listener);
      }));

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [token, myId, socket]);

  // FETCH ACCEPTED ROOMMATES
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await axios.get(
          `${API}/request/accepted`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        setUsers(response.data.users || []);
      } catch (error) {
        console.log(
          "Users Error:",
          error.response?.data || error
        );
      } finally {
        setLoadingUsers(false);
      }
    };

    if (token && myId) {
      fetchUsers();
    } else {
      setLoadingUsers(false);
    }
  }, [token, myId]);

  // FETCH MESSAGES WHEN USER SELECTED
  useEffect(() => {
    if (!selectedUser || !token) return;

    let cancelled = false;

    const fetchMessages = async () => {
      try {
        setLoadingMessages(true);
        setMessages([]);

        const response = await axios.get(
          `${API}/message/${selectedUser._id}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const fetchedMessages = response.data.messages || [];

        if (!cancelled) {
          setMessages(fetchedMessages);

          // MARK INCOMING MESSAGES AS READ
          fetchedMessages.forEach((msg) => {
            const receiverId = String(getId(msg.receiver));

            if (receiverId === String(myId)) {
              socketRef.current?.emit(
                "messageRead",
                msg._id
              );
            }
          });
        }
      } catch (error) {
        console.log(
          "Messages Error:",
          error.response?.data || error
        );

        if (!cancelled) {
          setMessages([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingMessages(false);
        }
      }
    };

    fetchMessages();

    return () => {
      cancelled = true;
    };
  }, [selectedUser, token, myId]);

  // AUTO SCROLL
  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages]);

  // HANDLE MESSAGE INPUT AND TYPING EVENT
  const handleMessageChange = (e) => {
    const value = e.target.value;

    setMessage(value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
    e.target.style.overflowY = e.target.scrollHeight > 120 ? "auto" : "hidden";

    if (!selectedUser || !socketRef.current) return;

    if (!value.trim()) {
      stopTyping();
      return;
    }

    socketRef.current.emit(
      "typing",
      selectedUser._id
    );

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      socketRef.current?.emit(
        "stopTyping",
        selectedUser._id
      );

      typingTimeoutRef.current = null;
    }, 1500);
  };

  const addEmoji = (emoji) => {
    const input = messageInputRef.current;
    const start = input?.selectionStart ?? message.length;
    const end = input?.selectionEnd ?? message.length;
    const nextMessage = `${message.slice(0, start)}${emoji}${message.slice(end)}`;
    setMessage(nextMessage);
    setEmojiPickerOpen(false);
    requestAnimationFrame(() => {
      if (!input) return;
      input.focus();
      const caret = start + emoji.length;
      input.setSelectionRange(caret, caret);
    });
  };

  const shareCurrentLocation = () => {
    setAttachmentMenuOpen(false);
    if (!navigator.geolocation) {
      notify("Location sharing is not available in this browser.", "warning");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const mapUrl = `https://www.google.com/maps?q=${coords.latitude},${coords.longitude}`;
        sendMessage(null, `📍 My current location: ${mapUrl}`);
      },
      (error) => notify(error.code === error.PERMISSION_DENIED ? "Allow location access to share your location." : "Could not get your current location.", "error"),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  };

  const toggleLiveLocation = () => {
    setAttachmentMenuOpen(false);
    if (liveLocationWatchRef.current !== null && liveLocationWatchRef.current !== undefined) {
      navigator.geolocation?.clearWatch(liveLocationWatchRef.current);
      liveLocationWatchRef.current = null;
      setLiveLocationActive(false);
      return;
    }
    if (!navigator.geolocation) {
      notify("Live location sharing is not available in this browser.", "warning");
      return;
    }
    lastLiveLocationSentRef.current = 0;
    liveLocationWatchRef.current = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const now = Date.now();
        if (now - lastLiveLocationSentRef.current < 60000) return;
        lastLiveLocationSentRef.current = now;
        const mapUrl = `https://www.google.com/maps?q=${coords.latitude},${coords.longitude}`;
        sendMessage(null, `📡 Live location update: ${mapUrl}`);
      },
      (error) => {
        navigator.geolocation.clearWatch(liveLocationWatchRef.current);
        liveLocationWatchRef.current = null;
        setLiveLocationActive(false);
        notify(error.code === error.PERMISSION_DENIED ? "Allow location access to share your live location." : "Live location could not be updated.", "error");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
    setLiveLocationActive(true);
  };

  const shareContact = async () => {
    setAttachmentMenuOpen(false);
    let contact;
    try {
      if (navigator.contacts?.select) {
        const contacts = await navigator.contacts.select(["name", "tel"], { multiple: false });
        if (!contacts?.length) return;
        contact = contacts[0];
      }
    } catch (error) {
      if (error.name === "AbortError") return;
      console.warn("Contact picker unavailable:", error);
    }
    if (!contact) { setContactName(""); setContactPhone(""); setContactShareOpen(true); return; }
    const name = Array.isArray(contact.name) ? contact.name[0] : contact.name;
    const phone = Array.isArray(contact.tel) ? contact.tel[0] : contact.tel;
    await sendMessage(null, `👤 Shared contact: ${name || "Contact"}${phone ? ` · ${phone}` : ""}`);
  };

  const sendTypedContact = async (event) => {
    event.preventDefault();
    if (!contactName.trim()) { notify("Enter a contact name to share.", "warning"); return; }
    await sendMessage(null, `👤 Shared contact: ${contactName.trim()}${contactPhone.trim() ? ` · ${contactPhone.trim()}` : ""}`);
    setContactShareOpen(false);
  };

  const handleComposerKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      sendMessage();
    }
  };

  // SELECT CHAT ATTACHMENT
  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];

    if (!file) return;

    if (file.size >= 5 * 1024 * 1024) {
      notify("Files must be smaller than 5 MB.", "warning");
      e.target.value = "";
      return;
    }

    const supported = file.type.startsWith("image/") || file.type.startsWith("video/") || file.type.startsWith("audio/") || [
      "application/pdf", "application/msword", "application/rtf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "text/plain", "text/csv"
    ].includes(file.type);
    if (!supported) {
      notify("Choose an image, video, audio, PDF, or Office document.", "warning");
      e.target.value = "";
      return;
    }

    setSelectedFile(file);
  };

  // REMOVE SELECTED ATTACHMENT
  const removeSelectedFile = () => {
    setSelectedFile(null);
    setEmojiPickerOpen(false);

    if (photosInputRef.current) photosInputRef.current.value = "";
    if (documentsInputRef.current) documentsInputRef.current.value = "";
  };

  // SEND MESSAGE
  const sendMessage = async (e, contentOverride) => {
    e?.preventDefault();
    const messageContent = typeof contentOverride === "string" ? contentOverride : message;
    const fileToSend = typeof contentOverride === "string" ? null : selectedFile;

    if (
      (!messageContent.trim() && !fileToSend) ||
      !selectedUser ||
      sending
    ) {
      return;
    }

    stopTyping();

    try {
      setSending(true);

      let attachment = null;

      // UPLOAD ATTACHMENT TO CLOUDINARY
      if (fileToSend) {
        const formData = new FormData();
        formData.append("image", fileToSend);

        const uploadResponse = await axios.post(
          `${API}/upload`,
          formData,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const fileUrl = uploadResponse.data.fileUrl;

        if (!fileUrl) {
          throw new Error("File upload failed.");
        }

        const kind = fileToSend.type.startsWith("image/") ? "image"
          : fileToSend.type.startsWith("video/") ? "video"
            : fileToSend.type.startsWith("audio/") ? "audio" : "document";
        attachment = {
          url: fileUrl,
          name: fileToSend.name,
          mimeType: fileToSend.type,
          kind,
          publicId: uploadResponse.data.publicId,
          resourceType: uploadResponse.data.resourceType,
        };
      }

      // SAVE MESSAGE IN DATABASE
      const response = await axios.post(
        `${API}/message`,
        {
          receiver: selectedUser._id,
          message: messageContent.trim(),
          image: attachment?.kind === "image" ? attachment.url : null,
          attachment,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const newMessage = response.data.data;

      setMessages((prev) => {
        const alreadyExists = prev.some(
          (msg) => String(msg._id) === String(newMessage._id)
        );

        if (alreadyExists) return prev;

        return [...prev, newMessage];
      });

      if (typeof contentOverride !== "string") {
        setMessage("");
        setSelectedFile(null);
        if (messageInputRef.current) messageInputRef.current.style.height = "44px";
        if (photosInputRef.current) photosInputRef.current.value = "";
        if (documentsInputRef.current) documentsInputRef.current.value = "";
      }
    } catch (error) {
      console.log(
        "Send Message Error:",
        error.response?.data || error
      );

      notify(error.response?.data?.message || error.message || "Unable to send message", "error");
    } finally {
      setSending(false);
    }
  };

  const removeFriend = async () => {
    if (!selectedUser) return;
    const friend = selectedUser;
    if (!await confirmAction(`Remove ${formatName(friend.name) || "this roommate"} from your roommate connections?`, { title: "Remove roommate", danger: true, confirmLabel: "Remove" })) return;

    try {
      await axios.delete(`${API}/request/accepted/${friend._id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUsers((previous) => previous.filter((user) => String(user._id) !== String(friend._id)));
      setSelectedUser(null);
      setMessages([]);
      setMediaGalleryOpen(false);
      setChatMenuOpen(false);
      notify("Roommate connection removed.", "success");
    } catch (error) {
      notify(error.response?.data?.message || "Unable to remove roommate connection.", "error");
    }
  };

  const deleteChat = async () => {
    if (!selectedUser) return;
    const friend = selectedUser;
    if (!await confirmAction(`Delete all chat messages with ${formatName(friend.name) || "this roommate"} for both of you?`, { title: "Delete chat", danger: true, confirmLabel: "Delete chat" })) return;

    try {
      const response = await axios.delete(`${API}/message/${friend._id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMessages([]);
      setMediaGalleryOpen(false);
      setChatMenuOpen(false);
      if (response.data.mediaDeleteFailures > 0) {
        notify("Chat messages were deleted, but some uploaded media could not be removed from storage.", "warning");
      } else {
        notify("Chat deleted.", "success");
      }
    } catch (error) {
      notify(error.response?.data?.message || "Unable to delete this chat.", "error");
    }
  };

  const blockUser = async () => {
    if (!selectedUser) return;
    const friend = selectedUser;
    if (!await confirmAction(`Block ${formatName(friend.name) || "this roommate"}? They will be removed from your connections and will not be able to find, contact, or send you roommate requests.`, { title: "Block user", danger: true, confirmLabel: "Block user" })) return;

    try {
      await axios.post(`${API}/user/${friend._id}/block`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUsers((previous) => previous.filter((user) => String(user._id) !== String(friend._id)));
      setSelectedUser(null);
      setMessages([]);
      setMediaGalleryOpen(false);
      setChatMenuOpen(false);
      notify("User blocked.", "success");
    } catch (error) {
      notify(error.response?.data?.message || "Unable to block this user.", "error");
    }
  };

  // SEARCH ROOMMATES
  const filteredUsers = users.filter((user) =>
    user.name?.toLowerCase().includes(search.toLowerCase())
  );

  // AVATAR INITIALS
  const getInitials = (name = "") => {
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0].toUpperCase())
      .join("");
  };

  // FORMAT MESSAGE TIME
  const formatTime = (date) => {
    if (!date) return "";

    return new Date(date).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // IDENTIFY SENDER
  const isMyMessage = (msg) => {
    return String(getId(msg.sender)) === String(myId);
  };

  // MESSAGE STATUS SYMBOL
  const getStatusSymbol = (status) => {
    if (status === "read") return "✓✓";
    if (status === "delivered") return "✓✓";
    return "✓";
  };

  const isSelectedOnline =
    selectedUser &&
    onlineUsers.includes(String(selectedUser._id));
  const selectedAvailability = users.find((person) => String(person._id) === String(selectedUser?._id)) || selectedUser;
  const isAcceptedSelectedUser = Boolean(selectedUser && users.some((person) => String(person._id) === String(selectedUser._id)));

  const sharedMedia = messages.flatMap((msg) => {
    if (msg.attachment?.url) return [{ ...msg.attachment, id: msg._id }];
    if (msg.image) return [{ url: msg.image, kind: "image", name: "Shared image", id: msg._id }];
    return [];
  });

  // REUSABLE PROFILE AVATAR
  const ProfileAvatar = ({ user, className = "" }) => (
    <div className={className}>
      {user?.profileImage ? (
        <motion.img
          src={user.profileImage}
          alt={`${formatName(user.name) || "User"}'s profile`}
          className="chat-avatar-image"
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
        />
      ) : (
        getInitials(user?.name || "")
      )}
    </div>
  );

  return (
    <>
      <Navbar />

      <div className="chat-app-shell">
        <div className="chat-page">
          <div className={`chat-container${selectedUser ? " has-selected-user" : ""}`}>

            {/* LEFT SIDEBAR */}
            <aside className="chat-sidebar">

              <div className="sidebar-top">
                <div>
                  <span className="chat-subtitle">
                    ROOMMATE CONNECTIONS
                  </span>

                  <h2>Messages</h2>
                </div>

              </div>

              {Number(myProfile.totalBeds) > 0 && Number(myProfile.occupiedBeds) >= Number(myProfile.totalBeds) && (
                <motion.div className="room-requirement-fulfilled" role="status" initial={reduceMotion ? false : { opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}>
                  <span aria-hidden="true">✓</span>
                  <div><strong>Roommate requirement fulfilled.</strong><small>No more roommates needed.</small></div>
                </motion.div>
              )}

              {/* BROWSER NOTIFICATION SETTINGS */}
              {notificationPermission !== "granted" && (
                <motion.button
                  type="button"
                  className="enable-notifications-button"
                  onClick={enableNotifications}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.96 }}
                  disabled={
                    notificationPermission === "denied" ||
                    notificationPermission === "unsupported"
                  }
                  title={
                    notificationPermission === "denied"
                      ? "Notifications are blocked in browser settings"
                      : notificationPermission === "unsupported"
                        ? "Notifications are not supported by this browser"
                        : "Enable browser notifications"
                  }
                >
                  {notificationPermission === "denied"
                    ? "Notifications blocked in browser"
                    : notificationPermission === "unsupported"
                      ? "Notifications not supported"
                      : "🔔 Enable notifications"}
                </motion.button>
              )}

              {/* SEARCH */}
              <div className="chat-search">
                <span>⌕</span>

                <input
                  type="text"
                  placeholder="Search roommates..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="conversation-label">
                YOUR CONNECTIONS
              </div>

              {/* USERS LIST */}
              <div className="chat-user-list">
                {loadingUsers ? (
                  <div className="chat-info">
                    Loading connections...
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="chat-info">
                    {search
                      ? "No roommate found."
                      : "No accepted roommate connections yet."}
                  </div>
                ) : (
                  filteredUsers.map((user) => {
                    const unreadCount =
                      unreadCounts[String(user._id)] || 0;

                    return (
                      <div
                        key={user._id}
                        className={`chat-user ${
                          selectedUser?._id === user._id
                            ? "active"
                            : ""
                        }`}
                        onClick={() => {
                          stopTyping();
                          setSelectedUser(user);

                          setUnreadCounts((prev) => ({
                            ...prev,
                            [String(user._id)]: 0,
                          }));

                          setMessage("");
                          setSelectedFile(null);
                          setEmojiPickerOpen(false);
                          setAttachmentMenuOpen(false);
                          setMediaGalleryOpen(false);
                          setChatMenuOpen(false);
                        }}
                      >
                        <ProfileAvatar
                          user={user}
                          className="user-avatar"
                        />

                        <div className="user-details">
                          <h4><UserName user={user} /> <motion.span role="img" className={`sidebar-online-dot ${onlineUsers.includes(String(user._id)) ? "is-online" : "is-offline"}`} aria-label={onlineUsers.includes(String(user._id)) ? "Online" : "Offline"} animate={onlineUsers.includes(String(user._id)) && !reduceMotion ? { scale: [1, 1.18, 1], opacity: [1, .72, 1] } : undefined} transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }} /></h4>

                          <p>
                            {user.city || "Location not added"}
                            {user.state ? `, ${user.state}` : ""}
                          </p>
                        </div>

                        {unreadCount > 0 && (
                          <span className="unread-count">
                            {unreadCount > 99 ? "99+" : unreadCount}
                          </span>
                        )}

                        <span className="user-arrow">›</span>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="sidebar-footer">
                <span className="footer-dot"></span>
                Connected with your roommates
              </div>

            </aside>

            {/* RIGHT CHAT AREA */}
            <main className="chat-main">
              {!selectedUser ? (
                <div className="empty-chat-screen">
                  <div className="empty-chat-icon">
                    <span>✉</span>
                  </div>

                  <h2>Your conversations</h2>

                  <p>
                    Select a roommate from the sidebar
                    to start your conversation.
                  </p>
                </div>
              ) : (
                <>
                  {/* CHAT HEADER */}
                  <div className="chat-header">
                    <div className="header-user">
                      <button
                        type="button"
                        className="chat-back-button"
                        aria-label="Back to roommate list"
                        onClick={() => {
                          stopTyping();
                          setSelectedUser(null);
                          setMessages([]);
                          setMediaGalleryOpen(false);
                          setChatMenuOpen(false);
                        }}
                      >
                        ‹
                      </button>
                      <button type="button" className="header-avatar-trigger" onClick={() => { setChatMenuOpen(false); setAttachmentMenuOpen(false); setEmojiPickerOpen(false); setMediaGalleryOpen(false); setProfilePreviewOpen(true); }} aria-label={`Enlarge ${formatName(selectedUser.name) || "roommate"}'s profile picture`}>
                        <ProfileAvatar user={selectedUser} className="user-avatar header-avatar" />
                      </button>

                      <div className="header-user-info">
                        <h3><UserName user={selectedUser} /></h3>
                        <div className="header-user-status">
                        <span className={isTyping ? "typing-text" : ""}>
                          {isTyping
                            ? "Typing..."
                            : `${selectedUser.city || "Roommate connection"}${
                                selectedUser.state
                                  ? `, ${selectedUser.state}`
                                  : ""
                              }`}
                        </span>
                        <span className="header-online-status"><motion.span className={`header-dot ${isSelectedOnline ? "online" : "offline"}`} animate={isSelectedOnline && !reduceMotion ? { scale: [1, 1.2, 1], opacity: [1, .72, 1] } : undefined} transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }} />{isSelectedOnline ? "Online" : "Offline"}</span>
                        </div>
                      </div>
                    </div>

                    <div className="chat-header-actions">
                      <div className="chat-call-actions" aria-label="Call actions">
                        <motion.button type="button" className="chat-call-button" aria-label={`Voice call ${formatName(selectedUser.name) || "roommate"}`} title={!isAcceptedSelectedUser ? "Calls are available for accepted roommates only" : !isSelectedOnline ? "Roommate is offline" : "Start voice call"} disabled={!isAcceptedSelectedUser || !isSelectedOnline || Boolean(roommateCalls.call)} onClick={() => roommateCalls.startCall(selectedUser, "audio")} whileHover={reduceMotion ? undefined : { scale: 1.08 }} whileTap={reduceMotion ? undefined : { scale: .93 }}><Phone size={18} aria-hidden="true" /></motion.button>
                        <motion.button type="button" className="chat-call-button" aria-label={`Video call ${formatName(selectedUser.name) || "roommate"}`} title={!isAcceptedSelectedUser ? "Calls are available for accepted roommates only" : !isSelectedOnline ? "Roommate is offline" : "Start video call"} disabled={!isAcceptedSelectedUser || !isSelectedOnline || Boolean(roommateCalls.call)} onClick={() => roommateCalls.startCall(selectedUser, "video")} whileHover={reduceMotion ? undefined : { scale: 1.08 }} whileTap={reduceMotion ? undefined : { scale: .93 }}><Video size={18} aria-hidden="true" /></motion.button>
                      </div>
                      {Number.isFinite(Number(selectedAvailability?.totalBeds)) && Number(selectedAvailability.totalBeds) > 0 && <div className="chat-seat-availability" aria-label={`${Number(selectedAvailability.occupiedBeds) || 0} occupied, ${Math.max(0, Number(selectedAvailability.totalBeds) - (Number(selectedAvailability.occupiedBeds) || 0))} available`}><span><UserRound size={15} className="occupied-person" /> {Number(selectedAvailability.occupiedBeds) || 0} Occupied</span><b>·</b><span><UserRound size={15} className="available-person" /> {Math.max(0, Number(selectedAvailability.totalBeds) - (Number(selectedAvailability.occupiedBeds) || 0))} Available</span></div>}
                      <div className="chat-menu-container" ref={chatMenuRef}>
                        <motion.button
                          type="button"
                          className="chat-menu-trigger"
                          aria-label="Open chat options"
                          aria-expanded={chatMenuOpen}
                          title="Chat options"
                          onClick={() => { setEmojiPickerOpen(false); setAttachmentMenuOpen(false); setChatMenuOpen((open) => !open); }}
                          whileHover={{ scale: 1.08 }}
                          whileTap={{ scale: 0.92 }}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>
                        </motion.button>
                        <AnimatePresence>
                          {chatMenuOpen && (
                            <motion.div
                              className="chat-options-menu"
                              initial={{ opacity: 0, y: -6, scale: 0.96 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: -6, scale: 0.96 }}
                              transition={{ duration: 0.14 }}
                            >
                              <button type="button" onClick={() => { setMediaGalleryOpen(true); setChatMenuOpen(false); setEmojiPickerOpen(false); }}>
                                <motion.span aria-hidden="true" whileHover={{ rotate: -8, scale: 1.12 }}>▧</motion.span> Shared media <span className="chat-menu-count">{sharedMedia.length}</span>
                              </button>
                              <button type="button" onClick={() => { setChatMenuOpen(false); setCallHistoryOpen(true); roommateCalls.loadCallHistory(selectedUser._id); }}>
                                <motion.span aria-hidden="true" whileHover={{ scale: 1.12 }}><Phone size={16} /></motion.span> Call history
                              </button>
                              <button type="button" onClick={removeFriend}>
                                <motion.span aria-hidden="true" whileHover={{ y: -2, scale: 1.1 }}>♙</motion.span> Unfriend
                              </button>
                              <button type="button" className="chat-delete-button" onClick={deleteChat}>
                                <motion.span aria-hidden="true" whileHover={{ rotate: -8, scale: 1.1 }}>⌫</motion.span> Delete chat
                              </button>
                              <button type="button" className="chat-block-button" onClick={blockUser}>
                                <motion.span aria-hidden="true" whileHover={{ scale: 1.12 }}>⊘</motion.span> Block user
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>

                  {mediaGalleryOpen && (
                    <div className="chat-media-backdrop" onClick={() => setMediaGalleryOpen(false)}>
                      <section className="chat-media-dialog" role="dialog" aria-modal="true" aria-labelledby="chat-media-title" onClick={(event) => event.stopPropagation()}>
                        <div className="chat-media-heading">
                          <div>
                            <h2 id="chat-media-title">Shared media</h2>
                            <p>{formatName(selectedUser.name)} · {sharedMedia.length} {sharedMedia.length === 1 ? "file" : "files"}</p>
                          </div>
                          <button type="button" className="chat-media-close" onClick={() => setMediaGalleryOpen(false)} aria-label="Close shared media">✕</button>
                        </div>
                        {sharedMedia.length === 0 ? (
                          <p className="chat-media-empty">No shared files in this conversation yet.</p>
                        ) : (
                          <div className="chat-media-grid">
                            {sharedMedia.map((item) => (
                              <div className="chat-media-item" key={item.id}>
                                {item.kind === "image" ? (
                                  <a href={item.url} target="_blank" rel="noreferrer"><img src={item.url} alt={item.name || "Shared image"} /></a>
                                ) : item.kind === "video" ? (
                                  <video src={item.url} controls preload="metadata" />
                                ) : item.kind === "audio" ? (
                                  <audio src={item.url} controls preload="metadata" />
                                ) : (
                                  <a className="chat-media-document-link" href={item.url} target="_blank" rel="noreferrer">📄 {item.name || "Open shared document"}</a>
                                )}
                                <span>{item.name || (item.kind === "image" ? "Image" : item.kind)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </section>
                    </div>
                  )}

                  {callHistoryOpen && <div className="call-history-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCallHistoryOpen(false); }}><section className="call-history-dialog" role="dialog" aria-modal="true" aria-labelledby="call-history-title"><header><div><h2 id="call-history-title">Call history</h2><p>{formatName(selectedUser.name)}</p></div><button type="button" onClick={() => setCallHistoryOpen(false)} aria-label="Close call history">×</button></header>{roommateCalls.historyLoading ? <p className="call-history-empty">Loading calls…</p> : roommateCalls.callHistory.length === 0 ? <p className="call-history-empty">No calls with this roommate yet.</p> : <ul>{roommateCalls.callHistory.map((item) => <li key={item._id}><span className={`call-history-icon ${item.status}`} aria-hidden="true">{item.callType === "video" ? <Video size={17} /> : <Phone size={17} />}</span><span className="call-history-copy"><strong>{item.callType === "video" ? "Video call" : "Voice call"} · {item.status}</strong><small>{new Date(item.startedAt).toLocaleString()}{item.duration ? ` · ${Math.floor(item.duration / 60)}:${String(item.duration % 60).padStart(2, "0")}` : ""}</small></span></li>)}</ul>}</section></div>}

                  {/* MESSAGES */}
                  <div className="chat-messages">
                    <div className="conversation-start">
                      <span>
                        Conversation with {formatName(selectedUser.name)}
                      </span>
                    </div>

                    {loadingMessages ? (
                      <div className="chat-info">
                        Loading messages...
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="no-messages">
                        <div className="no-message-icon">
                          ✨
                        </div>

                        <h3>Say hello!</h3>

                        <p>
                          Start a conversation with{" "}
                          {formatName(selectedUser.name)}.
                        </p>
                      </div>
                    ) : (
                      messages.map((msg) => {
                        const mine = isMyMessage(msg);
                        const attachment = msg.attachment?.url
                          ? msg.attachment
                          : msg.image
                            ? { url: msg.image, kind: "image", name: "Shared image" }
                            : null;

                        return (
                          <div
                            key={msg._id}
                            className={`message-row ${
                              mine ? "my-row" : "other-row"
                            }`}
                          >
                            {!mine && (
                              <ProfileAvatar
                                user={selectedUser}
                                className="small-avatar"
                              />
                            )}

                            <div
                              className={`message ${
                                mine ? "me" : "other"
                              }`}
                            >
                              {attachment?.kind === "image" && (
                                <img
                                  src={attachment.url}
                                  alt="Shared attachment"
                                  className="chat-message-image"
                                  onClick={() =>
                                    window.open(
                                      attachment.url,
                                      "_blank",
                                      "noopener,noreferrer"
                                    )
                                  }
                                />
                              )}

                              {attachment?.kind === "video" && (
                                <video className="chat-message-video" src={attachment.url} controls preload="metadata" />
                              )}

                              {attachment?.kind === "audio" && (
                                <audio className="chat-message-audio" src={attachment.url} controls preload="metadata" />
                              )}

                              {attachment?.kind === "document" && (
                                <a className="chat-message-document" href={attachment.url} target="_blank" rel="noreferrer">
                                  <motion.span aria-hidden="true" whileHover={{ rotate: -8, scale: 1.12 }}>📄</motion.span>
                                  <span>{attachment.name || "Open document"}</span>
                                  <span aria-hidden="true">↗</span>
                                </a>
                              )}

                              {msg.message && (() => { const locationMatch = msg.message.match(/(?:My current location|Live location update):\s*(https:\/\/\S+)/); return locationMatch ? <a className="chat-location-card" href={locationMatch[1]} target="_blank" rel="noreferrer"><MapPin size={20} /><span><strong>{msg.message.startsWith("📡") ? "Live location" : "Current location"}</strong><small>Open map ↗</small></span></a> : <p>{msg.message}</p>; })()}

                              <div className="message-meta">
                                <span className="message-time">
                                  {formatTime(msg.createdAt)}
                                </span>

                                {mine && (
                                  <span
                                    className={`message-status ${
                                      msg.status || "sent"
                                    }`}
                                  >
                                    {getStatusSymbol(msg.status)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}

                    <div ref={bottomRef}></div>
                  </div>

                  <div className="chat-composer-dock">
                    {selectedFile && <div className="selected-image-preview">
                      <span>Selected: {selectedFile.name}</span>
                      <motion.button type="button" onClick={removeSelectedFile} aria-label="Remove attachment" whileHover={{ rotate: 90, scale: 1.08 }} whileTap={{ scale: 0.9 }}>✕</motion.button>
                    </div>}

                    <div className="chat-composer-row">
                      <div className="chat-attachment-anchor" ref={attachmentMenuRef}>
                        <motion.button ref={attachmentButtonRef} type="button" className="chat-attachment-trigger" title="Open attachment menu" aria-label="Open attachment menu" aria-expanded={attachmentMenuOpen} disabled={sending || loadingMessages} onClick={() => { setEmojiPickerOpen(false); setChatMenuOpen(false); setAttachmentMenuOpen((open) => !open); }} whileHover={reduceMotion ? undefined : { scale: 1.07 }} whileTap={reduceMotion ? undefined : { scale: .94 }}>
                          <Paperclip size={21} aria-hidden="true" />
                        </motion.button>
                        <AnimatePresence>
                          {attachmentMenuOpen && <motion.div className="chat-attachment-menu" role="menu" aria-label="Share something" initial={reduceMotion ? false : { opacity: 0, y: 8, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 5, scale: .97 }} transition={{ duration: .15 }}>
                            <button type="button" role="menuitem" onClick={() => { setAttachmentMenuOpen(false); photosInputRef.current?.click(); }}><Image size={18} aria-hidden="true" /><span>Photos &amp; Videos</span></button>
                            <button type="button" role="menuitem" onClick={() => { setAttachmentMenuOpen(false); documentsInputRef.current?.click(); }}><FileText size={18} aria-hidden="true" /><span>Documents</span></button>
                            <button type="button" role="menuitem" onClick={shareCurrentLocation}><MapPin size={18} aria-hidden="true" /><span>Send Current Location</span></button>
                            <button type="button" role="menuitem" onClick={toggleLiveLocation}><Radio size={18} aria-hidden="true" /><span>{liveLocationActive ? "Stop Live Location" : "Share Live Location"}</span><i className={liveLocationActive ? "live-location-indicator active" : "live-location-indicator"} /></button>
                            <button type="button" role="menuitem" onClick={shareContact}><Contact size={18} aria-hidden="true" /><span>Share Contact</span></button>
                          </motion.div>}
                        </AnimatePresence>
                      </div>

                      <form className="chat-input" onSubmit={sendMessage}>
                        <input type="file" accept="image/*,video/*" ref={photosInputRef} onChange={handleImageSelect} hidden />
                        <input type="file" accept="audio/*,.pdf,.doc,.docx,.rtf,.xls,.xlsx,.ppt,.pptx,.txt,.csv" ref={documentsInputRef} onChange={handleImageSelect} hidden />
                        <div className="chat-input-field">
                          <motion.button type="button" className="emoji-toggle-button" ref={emojiButtonRef} title="Add emoji" aria-label="Add emoji" aria-expanded={emojiPickerOpen} onClick={() => { setAttachmentMenuOpen(false); setChatMenuOpen(false); setEmojiPickerOpen((open) => !open); }} disabled={sending || loadingMessages} whileHover={reduceMotion ? undefined : { scale: 1.08 }} whileTap={reduceMotion ? undefined : { scale: .92 }}><Smile size={20} aria-hidden="true" /></motion.button>
                          <textarea ref={messageInputRef} rows={1} placeholder="Write a message..." value={message} onChange={handleMessageChange} onKeyDown={handleComposerKeyDown} disabled={loadingMessages || sending} aria-label="Message" />
                        </div>
                        <motion.button type="submit" className="chat-send-button" aria-label="Send message" title="Send message" disabled={sending || (!message.trim() && !selectedFile) || loadingMessages} whileHover={reduceMotion ? undefined : { scale: 1.05 }} whileTap={reduceMotion ? undefined : { scale: .94 }}>
                          <Send size={18} aria-hidden="true" />
                        </motion.button>
                      </form>
                    </div>

                    <AnimatePresence>
                      {emojiPickerOpen && <motion.div className="chat-emoji-picker" aria-label="Emoji picker" ref={emojiPickerRef} initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}>
                        {"😀 😃 😄 😁 😆 😊 🙂 😉 😍 🥰 😎 🤔 😂 😭 😅 😇 🙌 👋 👍 👎 👏 ❤️ 💕 💯 🔥 🎉 ✨ 🙏 🤝 🏠".split(" ").map((emoji) => <motion.button key={emoji} type="button" onClick={() => addEmoji(emoji)} aria-label={`Insert ${emoji}`} whileHover={reduceMotion ? undefined : { scale: 1.15 }} whileTap={reduceMotion ? undefined : { scale: .9 }}>{emoji}</motion.button>)}
                      </motion.div>}
                    </AnimatePresence>
                    <div className="input-caption">Enter to send · Shift + Enter for a new line{liveLocationActive ? " · Live location is sharing" : ""}</div>
                  </div>
                </>
              )}
            </main>
          </div>
        </div>
      </div>
      <AnimatePresence>
        {contactShareOpen && <motion.div className="contact-share-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setContactShareOpen(false); }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><motion.form className="contact-share-dialog" role="dialog" aria-modal="true" aria-labelledby="contact-share-title" onSubmit={sendTypedContact} initial={{ opacity: 0, y: 10, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }}><h2 id="contact-share-title">Share a contact</h2><label>Contact name<input autoFocus value={contactName} onChange={(event) => setContactName(event.target.value)} maxLength={100} required /></label><label>Phone number<input type="tel" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} maxLength={40} /></label><footer><button type="button" onClick={() => setContactShareOpen(false)}>Cancel</button><button type="submit">Share contact</button></footer></motion.form></motion.div>}
      </AnimatePresence>
      <AnimatePresence>
        {profilePreviewOpen && selectedUser && (
          <motion.div className="chat-profile-preview-backdrop" role="presentation" onClick={() => setProfilePreviewOpen(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="chat-profile-preview" role="dialog" aria-modal="true" aria-label={`${formatName(selectedUser.name) || "Roommate"}'s profile picture`} onClick={(event) => event.stopPropagation()} initial={{ opacity: 0, scale: .82 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .9 }} transition={{ type: "spring", stiffness: 260, damping: 22 }}>
              {selectedUser.profileImage ? <img src={selectedUser.profileImage} alt={`${formatName(selectedUser.name) || "Roommate"}'s profile`} /> : <span>{getInitials(selectedUser.name || "")}</span>}
              <p>{formatName(selectedUser.name)}</p>
              <button type="button" onClick={() => setProfilePreviewOpen(false)} aria-label="Close profile picture">×</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Chat;
