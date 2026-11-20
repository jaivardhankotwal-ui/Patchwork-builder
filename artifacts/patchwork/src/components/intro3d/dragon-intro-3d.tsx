import { useEffect, useRef } from "react";

type Props = { reduced: boolean; onReady: () => void; onError: (reason: string) => void };

// Mounts the lazily-loaded Three.js scene. `three` lives only in the dynamic chunk.
export function DragonIntro3D({ reduced, onReady, onError }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef(onReady);
  const errorRef = useRef(onError);
  readyRef.current = onReady;
  errorRef.current = onError;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let dispose: (() => void) | null = null;
    import("./dragon-scene")
      .then(({ createDragonScene }) => {
        if (cancelled) return;
        const handle = createDragonScene(host, {
          reduced,
          onReady: () => { if (!cancelled) readyRef.current(); },
          onError: (r) => { if (!cancelled) errorRef.current(r); },
        });
        dispose = handle.dispose;
      })
      .catch((err: unknown) => {
        if (!cancelled) errorRef.current(err instanceof Error ? err.message : "Failed to load 3D intro");
      });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [reduced]);

  return <div ref={hostRef} className="intro3d-host" aria-hidden="true" />;
}
