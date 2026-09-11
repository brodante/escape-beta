"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@/lib/types";

export const SOCKET_PATH = "/api/socket";

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function useSocket() {
  const socketRef = useRef<AppSocket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Hitting the endpoint once with a plain fetch guarantees the Socket.IO
    // server has been bootstrapped (see src/pages/api/socket.ts) before the
    // WebSocket upgrade handshake is attempted.
    fetch(SOCKET_PATH).finally(() => {
      if (cancelled) return;
      const socket: AppSocket = io({ path: SOCKET_PATH, addTrailingSlash: false });
      socketRef.current = socket;
      socket.on("connect", () => setConnected(true));
      socket.on("disconnect", () => setConnected(false));
    });

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, []);

  return { socketRef, connected };
}
