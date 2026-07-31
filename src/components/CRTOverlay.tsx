/**
 * The glass of the cabinet: scanlines, aperture-grille tint, vignette,
 * phosphor flicker and a curved-screen glare highlight. Pure CSS, sits above
 * everything, never intercepts input.
 */
export function CRTOverlay() {
  return (
    <div className="crt" aria-hidden="true">
      <div className="crt-scanlines" />
      <div className="crt-aperture" />
      <div className="crt-vignette" />
      <div className="crt-flicker" />
      <div className="crt-glare" />
    </div>
  );
}
