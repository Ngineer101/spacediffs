import { Component, StrictMode, useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { CRTOverlay } from "./components/CRTOverlay";
import { Starfield } from "./components/Starfield";
import { sfx } from "./lib/sound";
import { ErrorScreen } from "./screens/ErrorScreen";
import "./global.css";

// When App itself melts down, the 500 page brings its own chrome (starfield,
// CRT glass, click-blur) so the crash is still fully playable.
function MeltdownApp({ error }: { error: Error }) {
  const [battle, setBattle] = useState(false);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest("button, a");
      if (el instanceof HTMLElement) el.blur();
    };
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, []);

  return (
    <div className="app" onPointerDown={() => sfx.ensure()} onKeyDown={() => sfx.ensure()}>
      <Starfield mode={battle ? "battle" : "drift"} />
      <main className="stage">
        <ErrorScreen
          kind="500"
          detail={error.message || "unknown exception"}
          onHome={() => window.location.assign("/")}
          onBattleChange={setBattle}
        />
      </main>
      <CRTOverlay />
    </div>
  );
}

class MeltdownBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) return <MeltdownApp error={this.state.error} />;
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MeltdownBoundary>
      <App />
    </MeltdownBoundary>
  </StrictMode>,
);
