// Logo mark: two signal arcs over a dot - voice/broadcast/data in one shape
// size and withText are "props" (inputs). If the caller gives none, size is 36 and the text is shown
export default function Logo({ size = 36, withText = true }) {
  return (
    // aria-label gives screen readers the name "AirVoice" (the picture itself is hidden from them below)
    <span className="logo" aria-label="AirVoice">
      {/* SVG = a drawing made of shapes, so it stays sharp at any size.
          width/height use the size prop; viewBox="0 0 48 48" is the internal drawing grid (48 x 48) */}
      <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
        <rect width="48" height="48" rx="12" fill="#0B5C75" /> {/* teal rounded square (rx = corner roundness) */}
        <path d="M12 33c7-12 17-12 24 0" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" /> {/* big white arc */}
        <path d="M18 33c4-6 8-6 12 0" fill="none" stroke="#F2A33A" strokeWidth="4" strokeLinecap="round" /> {/* smaller orange arc */}
        <circle cx="24" cy="34" r="2.5" fill="#fff" /> {/* white dot at the bottom centre */}
      </svg>
      {/* Show the word "AirVoice" next to the icon, unless withText is false */}
      {withText && <span className="logo-text">AirVoice</span>}
    </span>
  );
}
