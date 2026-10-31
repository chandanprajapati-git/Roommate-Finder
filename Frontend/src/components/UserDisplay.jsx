import { motion, useReducedMotion } from "motion/react";
import { Mars, UserRound, UsersRound, Venus } from "lucide-react";
import "./UserDisplay.css";

export function formatName(name) {
  if (typeof name !== "string") return "";
  const trimmed = name.trim();
  return trimmed ? trimmed[0].toLocaleUpperCase() + trimmed.slice(1) : "";
}

export function OccupancyIndicator({ totalBeds, occupiedBeds }) {
  const reduceMotion = useReducedMotion();
  const total = Number(totalBeds);
  const occupied = Number(occupiedBeds);
  if (!Number.isInteger(total) || total < 1 || !Number.isInteger(occupied) || occupied < 0 || occupied > total) return null;
  const vacant = total - occupied;
  return <motion.span className="occupancy-indicator" role="img" aria-label={`${occupied} Occupied | ${vacant} Available`} title={`${occupied} Occupied | ${vacant} Available`} initial={reduceMotion ? false : { opacity: 0, scale: .9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: .2 }}>
    {Array.from({ length: total }, (_, index) => <UserRound key={`occupancy-${index}`} className={`occupancy-person ${index < occupied ? "occupied" : "vacant"}`} aria-hidden="true" />)}
  </motion.span>;
}

export function GenderIndicator({ gender }) {
  const Symbol = gender === "Male" ? Mars : gender === "Female" ? Venus : gender === "Other" ? UsersRound : null;
  if (!Symbol) return null;
  return <Symbol className={`gender-indicator gender-${gender.toLowerCase()}`} size={14} strokeWidth={2.2} role="img" aria-label={gender} title={gender} />;
}

export function UserName({ user, className = "" }) {
  const name = formatName(user?.name) || "Roommate";
  return <span className={`user-name-display ${className}`.trim()}>
    <span>{name}</span>
    <GenderIndicator gender={user?.gender} />
    <OccupancyIndicator totalBeds={user?.totalBeds} occupiedBeds={user?.occupiedBeds} />
  </span>;
}
