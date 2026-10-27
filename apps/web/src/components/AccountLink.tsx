"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Client-side session hint for the static marketing header. It only decides
 * which link to show; every protected page re-checks the session on the server.
 */
export function AccountLink({ className }: { className: string }) {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/v1/me", { signal: ctrl.signal, credentials: "same-origin" })
      .then((r) => setSignedIn(r.ok))
      .catch(() => undefined);
    return () => ctrl.abort();
  }, []);
  return signedIn ? (
    <Link href="/workspace" className={className}>
      Workspace
    </Link>
  ) : (
    <Link href="/sign-in" className={className}>
      Sign in
    </Link>
  );
}
