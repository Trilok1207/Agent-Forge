"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RevokeSessionButton({ id, current }: { id: string; current: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function revoke() {
    setBusy(true);
    setError(false);
    const res = await fetch(`/api/v1/me/sessions/${id}`, {
      method: "DELETE",
      credentials: "same-origin",
    }).catch(() => null);
    setBusy(false);
    if (!res || (res.status !== 204 && res.status !== 404)) return setError(true);
    if (current) router.push("/sign-in");
    router.refresh();
  }

  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-rose-600">Couldn&apos;t revoke</span>}
      <button
        type="button"
        onClick={revoke}
        disabled={busy}
        className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
      >
        {current ? "Sign out here" : "Revoke"}
      </button>
    </span>
  );
}
