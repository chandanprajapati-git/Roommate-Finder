import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import Select from "react-select";
import { State, City } from "country-state-city";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Navbar from "../components/Navbar";
import { UserName, formatName } from "../components/UserDisplay";
import { useSocket } from "../contexts/SocketContext";
import { useDismissiblePopup } from "../hooks/useDismissiblePopup";
import { useFeedback } from "../hooks/useFeedback";
import "./Dashboard.css";

const API = "http://localhost:5000/api";
const EMPTY_FILTERS = { minAge: "", maxAge: "", gender: "", minVacancies: "", activeOnly: true };

function Dashboard() {
  const [users, setUsers] = useState([]);

  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [locality, setLocality] = useState("");
  const [selectedProfile, setSelectedProfile] = useState(null);

  const [selectedState, setSelectedState] = useState(null);
  const [selectedCity, setSelectedCity] = useState(null);
  const [currentLocationState, setCurrentLocationState] = useState(null);
  const [currentLocationCity, setCurrentLocationCity] = useState(null);
  const [editingLocation, setEditingLocation] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");

  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [requestModalUser, setRequestModalUser] = useState(null);
  const [requestNote, setRequestNote] = useState("");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [filterDraft, setFilterDraft] = useState(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterError, setFilterError] = useState("");
  const filterDialogRef = useRef(null);

  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const socket = useSocket();
  const { notify, confirm: confirmAction } = useFeedback();

  useDismissiblePopup(filtersOpen, () => setFiltersOpen(false), filterDialogRef);

  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const authConfig = {
    headers: {
      Authorization: `Bearer ${token}`
    }
  };

  const stateOptions = State.getStatesOfCountry("IN").map((item) => ({
    label: item.name,
    value: item.isoCode
  }));

  const cityOptions = selectedState
    ? City.getCitiesOfState("IN", selectedState.value).map((item) => ({
        label: item.name,
        value: item.name
      }))
    : [];

  const currentLocationCityOptions = currentLocationState
    ? City.getCitiesOfState("IN", currentLocationState.value).map((item) => ({
        label: item.name,
        value: item.name
      }))
    : [];

  useEffect(() => {
    const savedState = stateOptions.find((item) => item.label === user.state) || null;
    setCurrentLocationState(savedState);
    setCurrentLocationCity(
      user.city
        ? { label: user.city, value: user.city }
        : null
    );
  }, [user.state, user.city]);

  const handleStateChange = (option) => {
    setSelectedState(option);
    setSelectedCity(null);
    setState(option ? option.label : "");
    setCity("");
    setUsers([]);
    setHasSearched(false);
    setLocality("");
  };

  const handleCityChange = (option) => {
    setSelectedCity(option);
    setCity(option ? option.value : "");
    setUsers([]);
    setHasSearched(false);
    setLocality("");
  };

  const saveCurrentLocation = async () => {
    if (!currentLocationState || !currentLocationCity) {
      setLocationMessage("Please choose both your state and city.");
      return;
    }

    try {
      setSavingLocation(true);
      setLocationMessage("");
      const response = await axios.put(
        `${API}/user/${user._id}`,
        {
          state: currentLocationState.label,
          city: currentLocationCity.value,
        },
        authConfig
      );
      const updatedUser = response.data.user;
      localStorage.setItem("user", JSON.stringify(updatedUser));
      setCurrentLocationState(
        stateOptions.find((item) => item.label === updatedUser.state) || null
      );
      setCurrentLocationCity(
        updatedUser.city ? { label: updatedUser.city, value: updatedUser.city } : null
      );
      setEditingLocation(false);
      setLocationMessage("Current location updated.");
      notify("Current location updated.", "success");
    } catch (error) {
      setLocationMessage(error.response?.data?.message || "Could not update your current location.");
      notify(error.response?.data?.message || "Could not update your current location.", "error");
    } finally {
      setSavingLocation(false);
    }
  };

  const cancelLocationEdit = () => {
    const savedState = stateOptions.find((item) => item.label === user.state) || null;
    setCurrentLocationState(savedState);
    setCurrentLocationCity(user.city ? { label: user.city, value: user.city } : null);
    setEditingLocation(false);
    setLocationMessage("");
  };

  // Fetch sent request statuses for the logged-in user
  const fetchRequestStates = async () => {
    try {
      const [sentResponse, receivedResponse] = await Promise.all([
        axios.get(`${API}/request/sent`, authConfig),
        axios.get(`${API}/request/received/${user._id}`, authConfig),
      ]);
      const states = {};
      for (const request of sentResponse.data.requests || []) {
        const receiverId = typeof request.receiver === "object" ? request.receiver?._id : request.receiver;
        if (receiverId && !states[String(receiverId)]) {
          states[String(receiverId)] = { requestId: request._id, status: request.status, direction: "outgoing" };
        }
      }
      for (const request of receivedResponse.data.requests || []) {
        const senderId = typeof request.sender === "object" ? request.sender?._id : request.sender;
        if (senderId && !states[String(senderId)]) {
          states[String(senderId)] = { requestId: request._id, status: request.status, direction: "incoming" };
        }
      }
      return states;
    } catch (error) {
      console.log(
        "Fetch Sent Requests Error:",
        error.response?.data || error
      );

      return {};
    }
  };

  // Fetch roommates
  const fetchUsers = async (e, selectedFilters = filters) => {
    e?.preventDefault();

    if (!state || !city) {
      notify("Please select both state and city", "warning");
      return;
    }

    try {
      setLoading(true);
      setHasSearched(true);

      const [userResponse, requestStates] = await Promise.all([
        axios.get(`${API}/user`, {
          params: {
            state,
            city,
            locality: locality.trim() || undefined,
            minAge: selectedFilters.minAge || undefined,
            maxAge: selectedFilters.maxAge || undefined,
            gender: selectedFilters.gender || undefined,
            minVacancies: selectedFilters.minVacancies || undefined,
            activeOnly: String(Boolean(selectedFilters.activeOnly)),
          },
          headers: authConfig.headers,
        }),
        fetchRequestStates()
      ]);

      const filteredUsers = (userResponse.data.users || [])
        .filter((item) => item._id !== user._id)
        .map((item) => ({
          ...item,
          requestInfo: requestStates[String(item._id)] || null
        }));

      setUsers(filteredUsers);
    } catch (error) {
      console.log(
        "Fetch Users Error:",
        error.response?.data || error
      );

      notify(error.response?.data?.message || "Unable to fetch roommates", "error");

      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = async () => {
    const minAge = filterDraft.minAge === "" ? undefined : Number(filterDraft.minAge);
    const maxAge = filterDraft.maxAge === "" ? undefined : Number(filterDraft.maxAge);
    const minVacancies = filterDraft.minVacancies === "" ? undefined : Number(filterDraft.minVacancies);
    if ((minAge !== undefined && (!Number.isInteger(minAge) || minAge < 0 || minAge > 120)) || (maxAge !== undefined && (!Number.isInteger(maxAge) || maxAge < 0 || maxAge > 120))) {
      setFilterError("Age must be a whole number between 0 and 120.");
      return;
    }
    if (minAge !== undefined && maxAge !== undefined && minAge > maxAge) {
      setFilterError("Minimum age cannot exceed maximum age.");
      return;
    }
    if (minVacancies !== undefined && (!Number.isInteger(minVacancies) || minVacancies < 0 || minVacancies > 1000)) {
      setFilterError("Minimum available beds must be a whole number from 0 to 1000.");
      return;
    }
    setFilterError("");
    setFilters(filterDraft);
    setFiltersOpen(false);
    await fetchUsers(undefined, filterDraft);
  };

  const resetFilters = () => {
    setFilterDraft({ ...EMPTY_FILTERS });
    setFilters({ ...EMPTY_FILTERS });
    setFilterError("");
    fetchUsers(undefined, EMPTY_FILTERS);
  };

  const updateRoommateRequest = async (item, status) => {
    const requestInfo = item.requestInfo;
    if (!requestInfo?.requestId) return;
    try {
      setActionId(item._id);
      const response = await axios.patch(`${API}/request/${requestInfo.requestId}/status`, { status }, authConfig);
      setUsers((previous) => previous.map((userItem) => userItem._id === item._id
        ? { ...userItem, requestInfo: { ...requestInfo, status: response.data.request?.status || status } }
        : userItem));
    } catch (error) {
      notify(error.response?.data?.message || "Unable to update roommate request.", "error");
    } finally { setActionId(null); }
  };

  useEffect(() => {
    if (!socket) return undefined;
    const handleRequestStatus = ({ senderId, receiverId, status }) => {
      if (String(senderId) !== String(user._id)) return;
      setUsers((previous) => previous.map((item) => String(item._id) === String(receiverId)
        ? { ...item, requestInfo: { ...(item.requestInfo || {}), status, direction: "outgoing" } }
        : item));
    };
    const handleRequestCancelled = ({ senderId, requestId }) => {
      if (String(senderId) !== String(user._id)) {
        setUsers((previous) => previous.map((item) => String(item._id) === String(senderId) && item.requestInfo?.requestId === requestId
          ? { ...item, requestInfo: null }
          : item));
      }
    };
    const handleIncomingRequest = ({ request }) => {
      if (String(request?.receiver) !== String(user._id)) return;
      setUsers((previous) => previous.map((item) => String(item._id) === String(request.sender)
        ? { ...item, requestInfo: { requestId: request._id, status: "pending", direction: "incoming" } }
        : item));
    };
    const handleRoomAvailability = ({ userId, totalBeds, occupiedBeds, requirementFulfilled }) => {
      setUsers((previous) => previous.map((item) => String(item._id) === String(userId)
        ? { ...item, totalBeds, occupiedBeds, requirementFulfilled }
        : item));
    };
    const handleConnectionRemoved = ({ userId }) => {
      setUsers((previous) => previous.filter((item) => String(item._id) !== String(userId)));
    };
    socket.on("roommateRequestStatusUpdated", handleRequestStatus);
    socket.on("roommateRequestCancelled", handleRequestCancelled);
    socket.on("newRoommateRequest", handleIncomingRequest);
    socket.on("roomAvailabilityUpdated", handleRoomAvailability);
    socket.on("roommateConnectionRemoved", handleConnectionRemoved);
    return () => {
      socket.off("roommateRequestStatusUpdated", handleRequestStatus);
      socket.off("roommateRequestCancelled", handleRequestCancelled);
      socket.off("newRoommateRequest", handleIncomingRequest);
      socket.off("roomAvailabilityUpdated", handleRoomAvailability);
      socket.off("roommateConnectionRemoved", handleConnectionRemoved);
    };
  }, [socket, user._id]);

  useEffect(() => {
    if (!requestModalUser) return undefined;
    const closeOnEscape = (event) => { if (event.key === "Escape") setRequestModalUser(null); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [requestModalUser]);

  useEffect(() => {
    if (!selectedProfile) return undefined;
    const close = (event) => { if (event.key === "Escape") setSelectedProfile(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [selectedProfile]);

  // Send roommate request
  const sendRoommateRequest = async () => {
    const receiverId = requestModalUser?._id;
    if (!receiverId) return;
    try {
      setActionId(receiverId);

      const response = await axios.post(
        `${API}/request/sendrequest`,
        {
          receiver: receiverId,
          note: requestNote.trim()
        },
        authConfig
      );

      const request = response.data.request || response.data;

      setUsers((prevUsers) =>
        prevUsers.map((item) =>
          item._id === receiverId
            ? {
                ...item,
                requestInfo: {
                  requestId: request._id,
                  status: "pending",
                  direction: "outgoing"
                }
              }
            : item
        )
      );

      notify(response.data.message || "Request sent successfully!", "success");
      setRequestModalUser(null);
      setRequestNote("");
    } catch (error) {
      console.log(
        "Send Request Error:",
        error.response?.data || error
      );

      notify(error.response?.data?.message || "Unable to send request", "error");
    } finally {
      setActionId(null);
    }
  };

  // Cancel a pending roommate request
  const cancelRoommateRequest = async (receiverId, requestId) => {
    if (!requestId) {
      notify("Request ID not found. Please refresh and try again.", "error");
      return;
    }

    const confirmed = await confirmAction("Are you sure you want to cancel this request?", { title: "Cancel request", danger: true, confirmLabel: "Cancel request" });

    if (!confirmed) return;

    try {
      setActionId(receiverId);

      await axios.delete(
        `${API}/request/${requestId}`,
        authConfig
      );

      setUsers((prevUsers) =>
        prevUsers.map((item) =>
          item._id === receiverId
            ? { ...item, requestInfo: null }
            : item
        )
      );

      notify("Request cancelled successfully!", "success");
    } catch (error) {
      console.log(
        "Cancel Request Error:",
        error.response?.data || error
      );

      notify(error.response?.data?.message || "Unable to cancel request", "error");
    } finally {
      setActionId(null);
    }
  };

  const activeFilterLabels = [
    filters.minAge !== "" || filters.maxAge !== "" ? `Age ${filters.minAge || "0"}–${filters.maxAge || "120"}` : "",
    filters.gender || "",
    filters.minVacancies ? `${filters.minVacancies}+ vacant beds` : "",
    filters.activeOnly ? "Active requirements only" : "",
  ].filter(Boolean);

  useEffect(() => {
    if (!token || !user._id) {
      navigate("/login", { replace: true });
    }
  }, [token, user._id, navigate]);

  return (
    <>
      <Navbar />

      <div className="dashboard">
        <section className="welcome-section">
          <h2>Welcome, {formatName(user.name) || "User"}!</h2>
          <p>
            Find your perfect roommate in your preferred city.
          </p>
        </section>

        <section className="current-location-section">
          <div className="current-location-heading">
            <div>
              <h2>Where are you living now?</h2>
              <p>Your current location helps roommates find people nearby.</p>
            </div>
            {!editingLocation && (
              <button type="button" onClick={() => { setEditingLocation(true); setLocationMessage(""); }}>
                {currentLocationState && currentLocationCity ? "Change location" : "Add location"}
              </button>
            )}
          </div>

          {editingLocation ? (
            <div className="current-location-form">
              <Select
                options={stateOptions}
                value={currentLocationState}
                onChange={(option) => {
                  setCurrentLocationState(option);
                  setCurrentLocationCity(null);
                  setLocationMessage("");
                }}
                placeholder="Select your state..."
                isSearchable
                className="location-select"
                classNamePrefix="select"
              />
              <Select
                options={currentLocationCityOptions}
                value={currentLocationCity}
                onChange={(option) => { setCurrentLocationCity(option); setLocationMessage(""); }}
                placeholder="Select your city..."
                isSearchable
                isDisabled={!currentLocationState}
                className="location-select"
                classNamePrefix="select"
              />
              <div className="current-location-actions">
                <button type="button" onClick={saveCurrentLocation} disabled={savingLocation}>
                  {savingLocation ? "Saving..." : "Save location"}
                </button>
                <button type="button" className="location-cancel-button" onClick={cancelLocationEdit} disabled={savingLocation}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="current-location-value">
              {currentLocationState && currentLocationCity
                ? `${currentLocationCity.label}, ${currentLocationState.label}`
                : "Add your current state and city."}
            </p>
          )}
          {locationMessage && <p className="current-location-message" role="status">{locationMessage}</p>}
        </section>

        <section className="search-section">
          <h2>Find Your Roommate</h2>

          <form onSubmit={fetchUsers}>
            <Select
              options={stateOptions}
              value={selectedState}
              onChange={handleStateChange}
              placeholder="Search and select state..."
              isSearchable
              isClearable
              className="location-select"
              classNamePrefix="select"
            />

            <Select
              options={cityOptions}
              value={selectedCity}
              onChange={handleCityChange}
              placeholder="Search and select city..."
              isSearchable
              isClearable
              isDisabled={!selectedState}
              className="location-select"
              classNamePrefix="select"
            />

            <div className="locality-search-field">
              <input aria-label="Area or locality (optional)" value={locality} maxLength={100} onChange={(event) => setLocality(event.target.value)} placeholder="Area / locality (optional)" />
              {locality && <button type="button" onClick={() => setLocality("")} aria-label="Clear area">×</button>}
            </div>

            <button type="submit" disabled={loading}>
              {loading ? "Searching..." : "Search Roommates"}
            </button>
          </form>
        </section>

        <section className="users-section">
          <div className="users-section-heading">
            <div><h2>Available Roommates</h2>{hasSearched && <p className="search-result-count">{users.length} matching {users.length === 1 ? "roommate" : "roommates"}{activeFilterLabels.length > 0 ? ` · ${activeFilterLabels.join(" · ")}` : ""}</p>}</div>
            {hasSearched && <motion.button type="button" className="open-filters-button" onClick={() => { setFilterDraft(filters); setFilterError(""); setFiltersOpen(true); }} whileHover={reduceMotion ? undefined : { y: -1 }} whileTap={reduceMotion ? undefined : { scale: .97 }}>⚙ Filters</motion.button>}
          </div>

          {loading && <p>Searching for roommates...</p>}

          {!loading && !hasSearched && (
            <p>
              Select your state and city to find roommates.
            </p>
          )}

          {!loading && hasSearched && users.length === 0 && (
            <p>
              {locality.trim() ? `No roommates found in ${locality.trim()}, ${city}.` : activeFilterLabels.length ? `No roommates match these filters in ${city}, ${state}.` : `No roommates found in ${city}, ${state}.`}
            </p>
          )}

          {!loading && users.length > 0 && (
            <div className="users-list">
              {users.map((item) => {
                const requestInfo = item.requestInfo;
                const isPending = requestInfo?.status === "pending";
                const isIncomingPending = isPending && requestInfo.direction === "incoming";
                const isAccepted = requestInfo?.status === "accepted";
                const isRejected = requestInfo?.status === "rejected";
                const requirementFulfilled = Boolean(item.requirementFulfilled);

                return (
                  <motion.div
                    className="user-card"
                    key={item._id}
                    role="button"
                    tabIndex={0}
                    onClick={(event) => { if (!event.target.closest("button")) setSelectedProfile(item); }}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedProfile(item); } }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    whileHover={{ y: -3 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="user-card-header">
                      {item.profileImage ? (
                        <motion.img
                          src={item.profileImage}
                          alt={`${formatName(item.name) || "Roommate"}'s profile`}
                          className="user-profile-image"
                          initial={{ scale: 0.88, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          whileHover={{ scale: 1.06 }}
                          transition={{ duration: 0.2 }}
                        />
                      ) : (
                        <motion.div className="user-profile-placeholder" whileHover={{ scale: 1.06 }}>
                          {(item.name || "U").charAt(0).toUpperCase()}
                        </motion.div>
                      )}

                      <h3>
                        <UserName user={item} />
                        {isPending && <motion.span className="roommate-request-status pending" role="img" aria-label="Request pending" title="Request pending" animate={reduceMotion ? undefined : { opacity: [1, .58, 1], scale: [1, .92, 1] }} transition={{ duration: 1.6, repeat: Infinity }}>●</motion.span>}
                        {isAccepted && <motion.span className="roommate-request-status accepted" role="img" aria-label="Request accepted" title="Request accepted" initial={reduceMotion ? false : { scale: .65, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>✓</motion.span>}
                      </h3>
                    </div>

                    <div className="user-details">
                      <p>
                        <strong>Age:</strong> {item.age || "Not provided"}
                      </p>

                      <p>
                        <strong>Gender:</strong> {item.gender || "Not provided"}
                      </p>

                      <p>
                        <strong>City:</strong> {item.city}
                      </p>

                      {item.locality && <p><strong>Area:</strong> {item.locality}</p>}

                      <p>
                        <strong>State:</strong> {item.state}
                      </p>
                    </div>

                    {requirementFulfilled && <p className="user-requirement-fulfilled" role="status">✓ Roommate Requirement Fulfilled</p>}

                    {isAccepted ? (
                      <motion.button
                        className="request-accepted-btn request-open-chat-btn"
                        onClick={() => navigate("/chat", { state: { selectedUser: item } })}
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                      >
                        ✓ Friends · Open Chat
                      </motion.button>
                    ) : requirementFulfilled ? (
                      <button className="request-fulfilled-btn" type="button" disabled title="This room is fully occupied">
                        Requirement Fulfilled
                      </button>
                    ) : isIncomingPending ? (
                      <div className="request-review-actions">
                        <motion.button className="request-accepted-btn" type="button" disabled={actionId !== null} onClick={() => updateRoommateRequest(item, "accepted")} whileTap={{ scale: .96 }}>
                          {actionId === item._id ? "Updating…" : "Accept"}
                        </motion.button>
                        <motion.button className="request-reject-btn" type="button" disabled={actionId !== null} onClick={() => updateRoommateRequest(item, "rejected")} whileTap={{ scale: .96 }}>
                          Reject
                        </motion.button>
                      </div>
                    ) : isPending ? (
                      <motion.button
                        className="request-sent-btn request-cancel-text-btn"
                        onClick={() =>
                          cancelRoommateRequest(
                            item._id,
                            requestInfo.requestId
                          )
                        }
                        disabled={actionId !== null}
                        aria-label="Cancel roommate request"
                        title="Cancel roommate request"
                        whileHover={{ scale: 1.08, rotate: -6 }}
                        whileTap={{ scale: 0.92 }}
                      >
                        {actionId === item._id ? "Cancelling…" : "Cancel Request"}
                      </motion.button>
                    ) : (
                      <motion.button
                        className="send-request-btn request-icon-btn"
                        onClick={() => { setRequestModalUser(item); setRequestNote(""); }}
                        disabled={actionId !== null}
                        aria-label={isRejected ? "Send request again" : "Send roommate request"}
                        title={isRejected ? "Send request again" : "Send roommate request"}
                        whileHover={{ scale: 1.08, y: -2 }}
                        whileTap={{ scale: 0.92 }}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
                        <span className="sr-only">{actionId === item._id ? "Sending request" : isRejected ? "Send request again" : "Send roommate request"}</span>
                      </motion.button>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </section>
      </div>
      <AnimatePresence>
        {selectedProfile && <motion.div className="profile-preview-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedProfile(null); }} onKeyDown={(event) => { if (event.key === "Escape") setSelectedProfile(null); }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.section className="profile-preview-card" role="dialog" aria-modal="true" aria-labelledby="profile-preview-name" onClick={(event) => event.stopPropagation()} initial={{ opacity: 0, scale: .94, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .96 }}>
            <button className="profile-preview-close" type="button" onClick={() => setSelectedProfile(null)} aria-label="Close profile">×</button>
            {selectedProfile.profileImage ? <img src={selectedProfile.profileImage} alt="" /> : <div className="profile-preview-placeholder">{(selectedProfile.name || "U").charAt(0).toUpperCase()}</div>}
            <h2 id="profile-preview-name"><UserName user={selectedProfile} /></h2>
            <p>{[selectedProfile.locality, selectedProfile.city, selectedProfile.state].filter(Boolean).join(", ")}</p>
            <div className="profile-preview-details"><span>{selectedProfile.age || "Age not provided"}</span><span>{selectedProfile.gender || "Gender not provided"}</span><span>{selectedProfile.totalBeds ? `${Math.max(0, selectedProfile.totalBeds - (selectedProfile.occupiedBeds || 0))} beds available` : "Availability not provided"}</span></div>
          </motion.section>
        </motion.div>}
      </AnimatePresence>
      <AnimatePresence>
        {filtersOpen && <motion.div className="dashboard-filter-backdrop" role="presentation" onClick={() => setFiltersOpen(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.section ref={filterDialogRef} className="dashboard-filter-dialog" role="dialog" aria-modal="true" aria-labelledby="filter-title" onClick={(event) => event.stopPropagation()} initial={reduceMotion ? false : { opacity: 0, x: 12, scale: .98 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 12, scale: .98 }}>
            <header><div><h2 id="filter-title">Filter roommates</h2><p>Combine filters to narrow {city}, {state} results.</p></div><button type="button" className="filter-close-button" onClick={() => setFiltersOpen(false)} aria-label="Close filters">×</button></header>
            {filterError && <p className="filter-error" role="alert">{filterError}</p>}
            <div className="filter-fields">
              <fieldset><legend>Age range</legend><div className="age-filter-row"><label>Minimum<input type="number" min="0" max="120" value={filterDraft.minAge} onChange={(event) => setFilterDraft((draft) => ({ ...draft, minAge: event.target.value }))} placeholder="Any" /></label><label>Maximum<input type="number" min="0" max="120" value={filterDraft.maxAge} onChange={(event) => setFilterDraft((draft) => ({ ...draft, maxAge: event.target.value }))} placeholder="Any" /></label></div></fieldset>
              <label>Gender<select value={filterDraft.gender} onChange={(event) => setFilterDraft((draft) => ({ ...draft, gender: event.target.value }))}><option value="">All</option><option>Male</option><option>Female</option><option>Other</option><option>Prefer not to say</option></select></label>
              <label>Minimum available beds<input type="number" min="0" max="1000" value={filterDraft.minVacancies} onChange={(event) => setFilterDraft((draft) => ({ ...draft, minVacancies: event.target.value }))} placeholder="Any" /></label>
              <label className="active-requirement-filter"><input type="checkbox" checked={filterDraft.activeOnly} onChange={(event) => setFilterDraft((draft) => ({ ...draft, activeOnly: event.target.checked }))} /> Only active roommate requirements</label>
            </div>
            <footer><button type="button" className="filter-reset-button" onClick={resetFilters} disabled={loading}>Reset filters</button><div><button type="button" className="filter-cancel-button" onClick={() => setFiltersOpen(false)}>Cancel</button><button type="button" className="filter-apply-button" onClick={applyFilters} disabled={loading}>{loading ? "Applying…" : "Apply filters"}</button></div></footer>
          </motion.section>
        </motion.div>}
      </AnimatePresence>
      <AnimatePresence>
        {requestModalUser && (
          <motion.div className="request-note-backdrop" role="presentation" onClick={() => setRequestModalUser(null)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.section className="request-note-dialog" role="dialog" aria-modal="true" aria-labelledby="request-note-title" onClick={(event) => event.stopPropagation()} initial={{ opacity: 0, y: 18, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.97 }}>
              <h2 id="request-note-title">Send {formatName(requestModalUser.name) || "a roommate"} a request</h2>
              <p>Add a short note so they know who you are.</p>
              <textarea value={requestNote} maxLength={300} onChange={(event) => setRequestNote(event.target.value)} placeholder="Write an optional note..." autoFocus />
              <span className="request-note-count">{requestNote.length}/300</span>
              <div className="request-note-actions">
                <button type="button" className="request-note-cancel" onClick={() => setRequestModalUser(null)}>Cancel</button>
                <button type="button" onClick={sendRoommateRequest} disabled={actionId !== null}>{actionId === requestModalUser._id ? "Sending..." : "Send request"}</button>
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default Dashboard;
