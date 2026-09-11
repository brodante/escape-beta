import type { NextApiRequest, NextApiResponse } from "next";
import type { Server as HTTPServer } from "http";
import type { Socket as NetSocket } from "net";
import { ensureSocketServer } from "@/server/engine/socketServer";

// ---------------------------------------------------------------------------
// This is the well-known "no custom server needed" pattern for embedding
// Socket.IO inside Next.js: a Pages Router API route still exposes the raw
// Node.js `http.Server` via `res.socket.server`, so we can attach a
// Socket.IO server to it lazily on first request and reuse it afterwards.
// App Router Route Handlers use the Web Fetch API and don't expose this, so
// this one endpoint intentionally lives under `pages/api` while everything
// else in the app uses the App Router.
// ---------------------------------------------------------------------------

interface SocketServerWithIO extends HTTPServer {
  io?: unknown;
}
interface SocketWithIO extends NetSocket {
  server: SocketServerWithIO;
}
interface NextApiResponseWithSocket extends NextApiResponse {
  socket: SocketWithIO;
}

export const config = {
  api: {
    bodyParser: false,
  },
};

export default function handler(_req: NextApiRequest, res: NextApiResponseWithSocket) {
  ensureSocketServer(res.socket.server);
  res.end();
}
