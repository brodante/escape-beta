import { EventEmitter } from "events";

// ---------------------------------------------------------------------------
// Cross-instance state fan-out.
//
// In production, this project is meant to run N horizontally scaled Node
// processes behind a load balancer with sticky sessions disabled. Any
// process can receive a `game:action` from any client, so once it computes
// the new authoritative GameState it must tell every OTHER process (which
// may be holding sockets for the same room) to push the update out too.
// Redis Pub/Sub is the standard fit for this fan-out.
//
// For local/single-instance environments (like this sandbox, which has no
// Redis server), we transparently fall back to an in-process EventEmitter so
// the exact same call-sites work unmodified. Swap in a real REDIS_URL and
// this module automatically switches to genuine cross-process pub/sub.
// ---------------------------------------------------------------------------

export interface RoomUpdateMessage {
  code: string;
}

type Handler = (msg: RoomUpdateMessage) => void;

interface Publisher {
  publish(msg: RoomUpdateMessage): Promise<void>;
  subscribe(handler: Handler): void;
  mode: "redis" | "memory";
}

const CHANNEL = "escape-room:room-updated";

function createMemoryPublisher(): Publisher {
  const bus = new EventEmitter();
  bus.setMaxListeners(0);
  return {
    mode: "memory",
    async publish(msg) {
      bus.emit(CHANNEL, msg);
    },
    subscribe(handler) {
      bus.on(CHANNEL, handler);
    },
  };
}

function createRedisPublisher(url: string): Publisher {
  // Lazy require so the `ioredis` module is never touched unless REDIS_URL
  // is actually configured.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Redis = require("ioredis");
  const pub = new Redis(url);
  const sub = new Redis(url);
  const bus = new EventEmitter();
  bus.setMaxListeners(0);

  sub.subscribe(CHANNEL).catch((err: unknown) => {
    console.error("[pubsub] failed to subscribe to redis channel", err);
  });

  sub.on("message", (_channel: string, raw: string) => {
    try {
      const msg = JSON.parse(raw) as RoomUpdateMessage;
      bus.emit(CHANNEL, msg);
    } catch {
      // ignore malformed payloads
    }
  });

  return {
    mode: "redis",
    async publish(msg) {
      await pub.publish(CHANNEL, JSON.stringify(msg));
    },
    subscribe(handler) {
      bus.on(CHANNEL, handler);
    },
  };
}

const globalForPubsub = globalThis as typeof globalThis & {
  __escapeRoomPublisher?: Publisher;
};

export function getPublisher(): Publisher {
  if (!globalForPubsub.__escapeRoomPublisher) {
    const url = process.env.REDIS_URL;
    globalForPubsub.__escapeRoomPublisher = url ? createRedisPublisher(url) : createMemoryPublisher();
    console.log(`[pubsub] using ${globalForPubsub.__escapeRoomPublisher.mode} transport`);
  }
  return globalForPubsub.__escapeRoomPublisher;
}
