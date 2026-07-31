import { useMemo } from "react";
import { spriteDataUri, type SpriteKind } from "../game/sprites";

export function PixelIcon({
  kind,
  scale = 3,
  className,
}: {
  kind: SpriteKind;
  scale?: number;
  className?: string;
}) {
  const src = useMemo(() => spriteDataUri(kind, scale), [kind, scale]);
  return <img src={src} alt={kind} className={`pixel-icon ${className ?? ""}`} />;
}
