import React, { useCallback, useState } from "react";
import launchArtwork from "../../assets/branding/founded-launch.png";
import "./LaunchScreen.css";

const EXIT_DURATION_MS = 560;

export default function LaunchScreen({ onComplete }) {
  const [isExiting, setIsExiting] = useState(false);

  const dismiss = useCallback(() => {
    if (isExiting) return;
    setIsExiting(true);
    window.setTimeout(() => {
      onComplete?.();
    }, EXIT_DURATION_MS);
  }, [isExiting, onComplete]);

  const handleKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      dismiss();
    }
  };

  return (
    <div
      aria-label="Enter Founded"
      className={isExiting ? "launch-screen is-exiting" : "launch-screen"}
      onClick={dismiss}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      <div className="launch-screen__content">
        <div className="launch-screen__artwork-wrap">
          <img
            alt="Founded launch artwork with compass and financial planning illustration"
            className="launch-screen__artwork"
            src={launchArtwork}
          />
        </div>
        <div className="launch-screen__prompt" aria-hidden={isExiting}>
          <p>Click anywhere to enter Founded</p>
          <span className="launch-screen__chevron" />
        </div>
      </div>
    </div>
  );
}
