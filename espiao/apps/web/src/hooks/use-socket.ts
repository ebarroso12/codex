import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";

// Module-level singleton: one connection per browser session, survives re-renders.
// Null until first useEffect fires (SSR-safe — useEffect never runs server-side).
let socketInstance: Socket | null = null;

export function useSocket(url: string): Socket | null {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (!socketInstance) {
      socketInstance = io(url, {
        transports: ["websocket"],
        reconnectionDelayMax: 10_000,
        autoConnect: true
      });
    }
    setSocket(socketInstance);

    return () => {
      socketInstance?.disconnect();
      socketInstance = null;
      setSocket(null);
    };
  }, [url]);

  return socket;
}
