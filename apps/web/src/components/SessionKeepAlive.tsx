"use client";

import { useEffect } from "react";

/** A browser-side call lets the API slide the session cookie forward (server-side fetches can't set cookies). */
export function SessionKeepAlive() {
  useEffect(() => {
    void fetch("/api/v1/me", { credentials: "same-origin" }).catch(() => undefined);
  }, []);
  return null;
}
