import { useEffect, useRef } from "react";

export function useDismissiblePopup(isOpen, onDismiss, primaryRef, secondaryRef) {
  const dismissRef = useRef(onDismiss);

  useEffect(() => { dismissRef.current = onDismiss; }, [onDismiss]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const isInside = (target) =>
      primaryRef?.current?.contains(target) || secondaryRef?.current?.contains(target);
    const handlePointerDown = (event) => {
      if (!isInside(event.target)) dismissRef.current?.();
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") dismissRef.current?.();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, primaryRef, secondaryRef]);
}
