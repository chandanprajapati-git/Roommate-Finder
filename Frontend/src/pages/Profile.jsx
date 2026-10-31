import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BedDouble } from "lucide-react";
import Navbar from "../components/Navbar";
import { formatName, OccupancyIndicator } from "../components/UserDisplay";
import { useDismissiblePopup } from "../hooks/useDismissiblePopup";
import { useFeedback } from "../hooks/useFeedback";
import "./Profile.css";

import { API_BASE_URL as API } from "../config/api.js";

function Profile() {
  const navigate = useNavigate();
  const { notify } = useFeedback();
  const fileInputRef = useRef(null);
  const occupancyDialogRef = useRef(null);

  const token = localStorage.getItem("token");

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    age: "",
    state: "",
    city: "",
    locality: "",
    gender: "",
    profileImage: "",
    totalBeds: "",
    occupiedBeds: ""
  });

  const [originalData, setOriginalData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cropFile, setCropFile] = useState(null);
  const [cropUrl, setCropUrl] = useState("");
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0, zoom: 1.25 });
  const [cropDimensions, setCropDimensions] = useState(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [notificationSoundEnabled, setNotificationSoundEnabled] = useState(() => localStorage.getItem("notificationSoundEnabled") !== "false");
  const [occupancyOpen, setOccupancyOpen] = useState(false);
  const [occupancyDraft, setOccupancyDraft] = useState({ totalBeds: "", occupiedBeds: "" });
  const [occupancySaving, setOccupancySaving] = useState(false);
  const [occupancyError, setOccupancyError] = useState("");
  const [occupancySuccess, setOccupancySuccess] = useState("");
  const reduceMotion = useReducedMotion();

  useDismissiblePopup(occupancyOpen, () => setOccupancyOpen(false), occupancyDialogRef);

  const openOccupancy = () => {
    setOccupancyDraft({ totalBeds: formData.totalBeds ?? "", occupiedBeds: formData.occupiedBeds ?? "" });
    setOccupancyError("");
    setOccupancySuccess("");
    setOccupancyOpen(true);
  };

  const occupancyTotal = Number(occupancyDraft.totalBeds);
  const occupancyOccupied = Number(occupancyDraft.occupiedBeds);
  const occupancyValid = Number.isInteger(occupancyTotal) && occupancyTotal > 0 && Number.isInteger(occupancyOccupied) && occupancyOccupied >= 0 && occupancyOccupied <= occupancyTotal;
  const vacantBeds = occupancyValid ? occupancyTotal - occupancyOccupied : 0;
  const allSeatsReserved = occupancyValid && vacantBeds === 0;

  const saveOccupancy = async () => {
    if (!occupancyValid) {
      setOccupancyError("Enter a positive whole number of beds and an occupied count no greater than the total.");
      return;
    }
    try {
      setOccupancySaving(true);
      setOccupancyError("");
      const response = await axios.patch(`${API}/user/profile`, { totalBeds: occupancyTotal, occupiedBeds: occupancyOccupied }, { headers: { Authorization: `Bearer ${token}` } });
      const updatedUser = response.data.user;
      setFormData((previous) => ({ ...previous, totalBeds: updatedUser.totalBeds, occupiedBeds: updatedUser.occupiedBeds }));
      setOriginalData((previous) => ({ ...previous, totalBeds: updatedUser.totalBeds, occupiedBeds: updatedUser.occupiedBeds }));
      persistUser(updatedUser);
      setOccupancySuccess("Room availability saved.");
      setOccupancyOpen(false);
    } catch (err) {
      setOccupancyError(err.response?.data?.message || "Could not save room availability.");
    } finally {
      setOccupancySaving(false);
    }
  };

  const updateNotificationSound = (enabled) => {
    setNotificationSoundEnabled(enabled);
    localStorage.setItem("notificationSoundEnabled", String(enabled));
    window.dispatchEvent(new Event("roommate-sound-preference-changed"));
  };

  const cancelCrop = useCallback(() => {
    setCropFile(null);
    if (cropUrl) URL.revokeObjectURL(cropUrl);
    setCropUrl("");
  }, [cropUrl]);

  useEffect(() => {
    if (!cropUrl) return undefined;
    const closeOnEscape = (event) => { if (event.key === "Escape" && !uploading) cancelCrop(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [cropUrl, uploading, cancelCrop]);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!token) {
        navigate("/login", { replace: true });
        return;
      }

      try {
        const response = await axios.get(`${API}/user/profile`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        const user = response.data.user;

        const userData = {
          name: user.name || "",
          email: user.email || "",
          phone: user.phone || "",
          age: user.age ?? "",
          state: user.state || "",
          city: user.city || "",
          locality: user.locality || "",
          gender: user.gender || "",
          profileImage: user.profileImage || "",
          totalBeds: user.totalBeds ?? "",
          occupiedBeds: user.occupiedBeds ?? ""
        };

        setFormData(userData);
        setOriginalData(userData);
      } catch (err) {
        setError(
          err.response?.data?.message || "Unable to fetch profile"
        );

        if (err.response?.status === 401) {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          navigate("/login", { replace: true });
        }
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [token, navigate]);

  const persistUser = (updatedUser) => {
    const previousUser = JSON.parse(localStorage.getItem("user") || "{}");
    const savedProfile = { ...previousUser, ...updatedUser };
    localStorage.setItem("user", JSON.stringify(savedProfile));
    window.dispatchEvent(new CustomEvent("roommate-profile-updated", { detail: savedProfile }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];

    if (!file) return;

    setError("");
    setSuccess("");

    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image.");
      e.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("Image size must be less than 5 MB.");
      e.target.value = "";
      return;
    }

    if (cropUrl) URL.revokeObjectURL(cropUrl);
    setCropFile(file);
    setCropUrl(URL.createObjectURL(file));
    setCropPosition({ x: 0, y: 0, zoom: 1.25 });
    setCropDimensions(null);
    e.target.value = "";
  };

  const saveCroppedImage = async () => {
    if (!cropFile || !cropUrl) return;

    try {
      setUploading(true);
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
        image.src = cropUrl;
      });

      const size = 512;
      const scale = Math.max(size / image.width, size / image.height) * cropPosition.zoom;
      const width = image.width * scale;
      const height = image.height * scale;
      const maxX = Math.max(0, width - size);
      const maxY = Math.max(0, height - size);
      const x = maxX * (50 - cropPosition.x) / 100;
      const y = maxY * (50 - cropPosition.y) / 100;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d");
      context.drawImage(image, -x, -y, width, height);
      const croppedBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
      if (!croppedBlob) throw new Error("Could not prepare the cropped image.");

      const imageData = new FormData();
      imageData.append("image", new File([croppedBlob], "profile-photo.jpg", { type: "image/jpeg" }));
      const uploadResponse = await axios.post(`${API}/upload`, imageData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const imageUrl = uploadResponse.data.imageUrl;
      if (!imageUrl) throw new Error("Image URL was not returned by server.");

      const updateResponse = await axios.patch(`${API}/user/profile`, {
        profileImage: imageUrl
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const updatedUser = updateResponse.data.user;
      setFormData((prev) => ({ ...prev, profileImage: updatedUser.profileImage || imageUrl }));
      setOriginalData((prev) => ({ ...prev, profileImage: updatedUser.profileImage || imageUrl }));
      persistUser(updatedUser);
      setSuccess("Profile picture updated successfully!");
      notify("Profile picture updated successfully.", "success");
      setCropFile(null);
      URL.revokeObjectURL(cropUrl);
      setCropUrl("");
    } catch (err) {
      const message = err.response?.data?.message || err.message || "Image upload failed.";
      setError(message);
      notify(message, "error");
    } finally {
      setUploading(false);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editing || !token) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await axios.patch(
        `${API}/user/profile`,
        {
          ...formData,
          name: formData.name.trim(),
          email: formData.email.trim().toLowerCase(),
          phone: formData.phone.trim(),
          state: formData.state.trim(),
          city: formData.city.trim(),
          locality: formData.locality.trim().replace(/\s+/g, " "),
          age: Number(formData.age),
          totalBeds: formData.totalBeds === "" ? undefined : Number(formData.totalBeds),
          occupiedBeds: formData.occupiedBeds === "" ? undefined : Number(formData.occupiedBeds)
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const updatedUser = response.data.user;

      const updatedData = {
        name: updatedUser.name || "",
        email: updatedUser.email || "",
        phone: updatedUser.phone || "",
        age: updatedUser.age || "",
        state: updatedUser.state || "",
        city: updatedUser.city || "",
        locality: updatedUser.locality || "",
        gender: updatedUser.gender || "",
        profileImage: updatedUser.profileImage || "",
        totalBeds: updatedUser.totalBeds ?? "",
        occupiedBeds: updatedUser.occupiedBeds ?? ""
      };

      setFormData(updatedData);
      setOriginalData(updatedData);

      persistUser(updatedUser);

      setEditing(false);
      setSuccess("Profile updated successfully!");
      notify("Profile updated successfully.", "success");
    } catch (err) {
      const message = err.response?.data?.message || "Profile update failed";
      setError(message);
      notify(message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (originalData) {
      setFormData(originalData);
    }

    setEditing(false);
    setError("");
    setSuccess("");
  };

  if (loading) {
    return <div className="profile-loading">Loading profile...</div>;
  }

  return (
    <>
      <Navbar />

      <div className="profile-page">
        <div className="profile-card">
          <div className="profile-header">
            <div className="profile-image-wrapper">
              {formData.profileImage ? (
                <img
                  src={formData.profileImage}
                  alt="Profile"
                  className="profile-avatar"
                />
              ) : (
                <div className="profile-avatar profile-avatar-placeholder">
                  {formData.name.charAt(0).toUpperCase()}
                </div>
              )}

              <button
                type="button"
                className="change-photo-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? "Uploading..." : "Change Photo"}
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                hidden
              />
            </div>

            <h2>My Profile</h2>
            <p>Manage your personal information</p>
          </div>

          {error && <p className="profile-error">{error}</p>}
          {success && <p className="profile-success">{success}</p>}

          <form onSubmit={handleUpdate}>
            <div className="profile-grid">
              <div className="profile-field">
                <label>Full Name</label>
                <input
                  type="text"
                  name="name"
                  value={editing ? formData.name : formatName(formData.name)}
                  onChange={handleChange}
                  disabled={!editing}
                  required
                />
              </div>

              <div className="profile-field">
                <label>Email</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  disabled={!editing}
                  required
                />
              </div>

              <div className="profile-field">
                <label>Phone</label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  disabled={!editing}
                  required
                />
              </div>

              <div className="profile-field">
                <label>Age</label>
                <input
                  type="number"
                  min="0"
                  max="120"
                  name="age"
                  value={formData.age}
                  onChange={handleChange}
                  disabled={!editing}
                  required
                />
              </div>

              <div className="profile-field">
                <label>Gender</label>
                <select
                  name="gender"
                  value={formData.gender}
                  onChange={handleChange}
                  disabled={!editing}
                  required
                >
                  <option value="">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                  <option value="Prefer not to say">
                    Prefer not to say
                  </option>
                </select>
              </div>

              <div className="profile-field">
                <label>State</label>
                <input
                  type="text"
                  name="state"
                  value={formData.state}
                  onChange={handleChange}
                  disabled={!editing}
                  required
                />
              </div>

              <div className="profile-field">
                <label>City</label>
                <input
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={handleChange}
                  disabled={!editing}
                  required
                />
              </div>

              <div className="profile-field">
                <label>Area / Locality (optional)</label>
                <input type="text" name="locality" value={formData.locality} onChange={handleChange} disabled={!editing} maxLength={100} placeholder="e.g. Patia" />
              </div>

            </div>

            <div className="profile-actions">
              {!editing ? (
                <button
                  type="button"
                  className="edit-profile-btn"
                  onClick={() => {
                    setEditing(true);
                    setSuccess("");
                  }}
                >
                  Edit Profile
                </button>
              ) : (
                <>
                  <button
                    type="submit"
                    className="save-profile-btn"
                    disabled={saving || uploading}
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </button>

                  <button
                    type="button"
                    className="cancel-profile-btn"
                    onClick={handleCancel}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </form>

          <section className="room-availability-section">
            <div className="room-availability-copy">
              <h3>Room availability</h3>
              <p>{formData.totalBeds ? `${formData.occupiedBeds} occupied · ${Math.max(0, Number(formData.totalBeds) - Number(formData.occupiedBeds))} vacant of ${formData.totalBeds} beds` : "Add your room capacity to show availability to roommates."}</p>
              {formData.totalBeds && <OccupancyIndicator totalBeds={formData.totalBeds} occupiedBeds={formData.occupiedBeds} />}
              {Number(formData.totalBeds) > 0 && Number(formData.occupiedBeds) >= Number(formData.totalBeds) && <strong className="room-fulfilled-label">Roommate Requirement Fulfilled</strong>}
            </div>
            <motion.button type="button" className="manage-availability-action" onClick={openOccupancy} whileHover={reduceMotion ? undefined : { y: -2, scale: 1.01 }} whileTap={reduceMotion ? undefined : { scale: .98 }}>
              <span className="manage-availability-icon"><BedDouble size={21} aria-hidden="true" /></span>
              <span><strong>Manage availability</strong><small>Manage your room capacity and available seats</small></span>
              <span className="manage-availability-arrow" aria-hidden="true">›</span>
            </motion.button>
          </section>
          {occupancySuccess && <p className="profile-success" role="status">{occupancySuccess}</p>}

          <AnimatePresence>
            {occupancyOpen && <motion.div className="occupancy-modal-backdrop" role="presentation" onClick={() => !occupancySaving && setOccupancyOpen(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.section ref={occupancyDialogRef} className="occupancy-modal" role="dialog" aria-modal="true" aria-labelledby="occupancy-title" onClick={(event) => event.stopPropagation()} initial={reduceMotion ? false : { opacity: 0, y: 12, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: .98 }}>
                <h2 id="occupancy-title">Room availability</h2>
                <p className="occupancy-modal-description">Set your room capacity and current occupancy.</p>
                {occupancyError && <p className="profile-error" role="alert">{occupancyError}</p>}
                <div className="occupancy-form-grid">
                  <label>Total beds<input type="number" min="1" step="1" inputMode="numeric" value={occupancyDraft.totalBeds} onChange={(event) => setOccupancyDraft((draft) => {
                    const totalBeds = event.target.value;
                    const numericTotal = Number(totalBeds);
                    const occupied = Number(draft.occupiedBeds);
                    return { totalBeds, occupiedBeds: numericTotal > 0 && occupied > numericTotal ? totalBeds : draft.occupiedBeds };
                  })} /></label>
                  <label>Occupied beds<input type="number" min="0" max={occupancyDraft.totalBeds || undefined} step="1" inputMode="numeric" value={occupancyDraft.occupiedBeds} disabled={!occupancyDraft.totalBeds || allSeatsReserved} onChange={(event) => setOccupancyDraft((draft) => ({ ...draft, occupiedBeds: event.target.value }))} /></label>
                </div>
                <div className="occupancy-vacancy-row"><span>Vacant beds</span><strong>{occupancyValid ? vacantBeds : "—"}</strong></div>
                <label className="all-seats-reserved"><input type="checkbox" checked={allSeatsReserved} disabled={!Number.isInteger(occupancyTotal) || occupancyTotal < 1} onChange={(event) => setOccupancyDraft((draft) => ({ ...draft, occupiedBeds: event.target.checked ? draft.totalBeds : String(Math.max(0, Number(draft.totalBeds) - 1)) }))} /> All Seats Reserved</label>
                <div className="occupancy-preview" aria-label={occupancyValid ? `${occupancyOccupied} occupied and ${vacantBeds} vacant` : "Enter valid bed counts to preview availability"}>
                  {occupancyValid && <OccupancyIndicator totalBeds={occupancyTotal} occupiedBeds={occupancyOccupied} />}
                  {!occupancyValid && <span>Enter valid bed counts to preview</span>}
                </div>
                <div className="photo-crop-actions">
                  <button type="button" className="cancel-profile-btn" onClick={() => setOccupancyOpen(false)} disabled={occupancySaving}>Cancel</button>
                  <button type="button" className="save-profile-btn" onClick={saveOccupancy} disabled={occupancySaving || !occupancyValid}>{occupancySaving ? "Saving…" : "Save changes"}</button>
                </div>
              </motion.section>
            </motion.div>}
          </AnimatePresence>

          <section className="notification-preference-section">
            <h3>Notifications</h3>
            <label><input type="checkbox" checked={notificationSoundEnabled} onChange={(event) => updateNotificationSound(event.target.checked)} /> Play a sound for new messages and roommate request updates</label>
          </section>

        </div>

        {cropUrl && (
          <div className="photo-crop-backdrop" role="presentation">
            <section className="photo-crop-dialog" role="dialog" aria-modal="true" aria-labelledby="crop-title">
              <h2 id="crop-title">Adjust profile photo</h2>
              <p>Move and zoom the photo to choose what appears in your profile.</p>
              <div className="photo-crop-frame">
                <img
                  src={cropUrl}
                  alt="Photo crop preview"
                  onLoad={(e) => setCropDimensions({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
                  style={cropDimensions ? (() => {
                    const scale = Math.max(230 / cropDimensions.width, 230 / cropDimensions.height) * cropPosition.zoom;
                    const width = cropDimensions.width * scale;
                    const height = cropDimensions.height * scale;
                    return {
                      width,
                      height,
                      left: -Math.max(0, width - 230) * (50 - cropPosition.x) / 100,
                      top: -Math.max(0, height - 230) * (50 - cropPosition.y) / 100
                    };
                  })() : undefined}
                />
              </div>
              <label className="crop-control">
                Horizontal position
                <input type="range" min="-50" max="50" value={cropPosition.x} onChange={(e) => setCropPosition((p) => ({ ...p, x: Number(e.target.value) }))} />
              </label>
              <label className="crop-control">
                Vertical position
                <input type="range" min="-50" max="50" value={cropPosition.y} onChange={(e) => setCropPosition((p) => ({ ...p, y: Number(e.target.value) }))} />
              </label>
              <label className="crop-control">
                Zoom
                <input type="range" min="1" max="3" step="0.01" value={cropPosition.zoom} onChange={(e) => setCropPosition((p) => ({ ...p, zoom: Number(e.target.value) }))} />
              </label>
              <div className="photo-crop-actions">
                <button type="button" className="cancel-profile-btn" onClick={cancelCrop} disabled={uploading}>Cancel</button>
                <button type="button" className="save-profile-btn" onClick={saveCroppedImage} disabled={uploading}>
                  {uploading ? "Saving photo..." : "Use this photo"}
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </>
  );
}

export default Profile;
