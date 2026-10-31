import { useState } from "react";
import axios from "axios";
import { useNavigate, Link } from "react-router-dom";
import Select from "react-select";
import { State, City } from "country-state-city";
import "./Signup.css";
import { useFeedback } from "../hooks/useFeedback";

function Signup() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    state: "",
    city: "",
    age: "",
    gender: "",
    password: "",
  });

  const [selectedState, setSelectedState] = useState(null);
  const [selectedCity, setSelectedCity] = useState(null);
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const { notify } = useFeedback();

  const stateOptions = State.getStatesOfCountry("IN").map((state) => ({
    label: state.name,
    value: state.isoCode,
  }));

  const cityOptions = selectedState
    ? City.getCitiesOfState("IN", selectedState.value).map((city) => ({
        label: city.name,
        value: city.name,
      }))
    : [];

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleStateChange = (option) => {
    setSelectedState(option);
    setSelectedCity(null);

    setFormData((prev) => ({
      ...prev,
      state: option ? option.label : "",
      city: "",
    }));
  };

  const handleCityChange = (option) => {
    setSelectedCity(option);

    setFormData((prev) => ({
      ...prev,
      city: option ? option.value : "",
    }));
  };

  const handleSignup = async (e) => {
    e.preventDefault();

    try {
      setLoading(true);

      const response = await axios.post(
        "http://localhost:5000/api/user/signup",
        {
          ...formData,
          name: formData.name.trim(),
          email: formData.email.trim(),
          age: Number(formData.age),
        }
      );

      notify(response.data.message || "Signup successful!", "success");
      navigate("/login");
    } catch (error) {
      console.log("Signup Error:", error.response?.data || error);

      notify(error.response?.data?.message || "Unable to create account", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signup-container">
      <form onSubmit={handleSignup} className="signup-form">
        <h2>Create Account</h2>
        <p>Join Roommate Finder</p>

        <input
          type="text"
          name="name"
          placeholder="Enter your name"
          value={formData.name}
          onChange={handleChange}
          required
        />

        <input
          type="email"
          name="email"
          placeholder="Enter email"
          value={formData.email}
          onChange={handleChange}
          required
        />

        <input
          type="tel"
          name="phone"
          placeholder="Enter phone number"
          value={formData.phone}
          onChange={handleChange}
          required
        />

        <Select
          options={stateOptions}
          value={selectedState}
          onChange={handleStateChange}
          placeholder="Search and select state..."
          isClearable
          isSearchable
          className="location-select"
          classNamePrefix="select"
        />

        <Select
          options={cityOptions}
          value={selectedCity}
          onChange={handleCityChange}
          placeholder="Search and select city..."
          isDisabled={!selectedState}
          isClearable
          isSearchable
          className="location-select"
          classNamePrefix="select"
        />

        <input
          type="number"
          name="age"
          placeholder="Enter age"
          value={formData.age}
          onChange={handleChange}
          min="18"
          required
        />

        <select
          name="gender"
          value={formData.gender}
          onChange={handleChange}
          required
          className="gender-select"
        >
          <option value="" disabled>
            Select your gender
          </option>

          <option value="Male">Male</option>
          <option value="Female">Female</option>
          <option value="Other">Other</option>
          <option value="Prefer not to say">
            Prefer not to say
          </option>
        </select>

        <input
          type="password"
          name="password"
          placeholder="Create password"
          value={formData.password}
          onChange={handleChange}
          minLength={6}
          required
        />

        <button type="submit" disabled={loading}>
          {loading ? "Creating Account..." : "Sign Up"}
        </button>

        <p>
          Already have an account? <Link to="/login">Login</Link>
        </p>
      </form>
    </div>
  );
}

export default Signup;
