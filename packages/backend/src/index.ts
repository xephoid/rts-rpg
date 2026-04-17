import Fastify from "fastify";
import websocket from "@fastify/websocket";

const server = Fastify({ logger: true });

await server.register(websocket);

server.get("/health", async () => ({ status: "ok" }));

server.get("/ws", { websocket: true }, (socket) => {
  socket.on("message", (msg: Buffer) => {
    // TODO: next step — route delta/event messages to game session handler
    socket.send(JSON.stringify({ type: "ack", payload: null }));
  });
});

await server.listen({ port: 3000, host: "0.0.0.0" });
