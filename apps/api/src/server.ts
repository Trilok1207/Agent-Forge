import { serve } from "@hono/node-server";
import { createApp } from "./app";

const port = Number(process.env.API_PORT) || 8787;

serve({ fetch: createApp().fetch, port, hostname: "127.0.0.1" }, (info) => {
  console.log(`agentflow-api listening on http://127.0.0.1:${info.port}`);
});
