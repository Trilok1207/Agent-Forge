"use client";

import Link from "next/link";
import { useState } from "react";

type Billing = "monthly" | "yearly";

const TIERS = [
  {
    name: "Free",
    blurb: "Explore with the safe demo and a small monthly allowance.",
    features: [
      "Safe demo project",
      "Small monthly run quota",
      "All three V1 workflows",
      "Personal audit log",
    ],
    cta: { label: "Try the demo", href: "/demo" },
  },
  {
    name: "Pro",
    blurb: "For people who automate real documents, inboxes, and repos every week.",
    features: [
      "Higher run and token quotas",
      "Hosted models or bring your own key",
      "Longer audit-log history",
      "Priority support",
    ],
    cta: { label: "Join the beta list", href: "/sign-in" },
    featured: true,
  },
];

export function Pricing() {
  const [billing, setBilling] = useState<Billing>("monthly");
  return (
    <div>
      <div
        className="mx-auto flex w-fit rounded-xl bg-slate-100 p-1"
        role="radiogroup"
        aria-label="Billing period"
      >
        {(["monthly", "yearly"] as const).map((b) => (
          <button
            key={b}
            role="radio"
            aria-checked={billing === b}
            onClick={() => setBilling(b)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium capitalize transition ${
              billing === b ? "bg-white text-ink-900 shadow-sm" : "text-slate-500"
            }`}
          >
            {b}
          </button>
        ))}
      </div>
      <div className="mx-auto mt-8 grid max-w-3xl gap-4 sm:grid-cols-2">
        {TIERS.map((t) => (
          <div
            key={t.name}
            className={`flex flex-col rounded-2xl border p-6 ${
              t.featured
                ? "border-brand-300 bg-brand-50/40 shadow-lg shadow-brand-500/10"
                : "border-slate-200 bg-white"
            }`}
          >
            <h3 className="font-display text-lg font-semibold">{t.name}</h3>
            <p className="mt-1 text-sm text-slate-600">{t.blurb}</p>
            <p className="mt-4 font-display text-2xl font-semibold text-ink-900">
              {t.name === "Free" ? "$0" : "Pricing at beta"}
            </p>
            <p className="text-xs text-slate-500">
              {t.name === "Free"
                ? "No card required"
                : billing === "yearly"
                  ? "Billed yearly"
                  : "Billed monthly"}
            </p>
            <ul className="mt-5 flex-1 space-y-2 text-sm text-slate-700">
              {t.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <span className="text-flow-600">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href={t.cta.href}
              className={`mt-6 rounded-lg px-4 py-2 text-center text-sm font-medium ${
                t.featured
                  ? "bg-brand-600 text-white hover:bg-brand-700"
                  : "border border-slate-300 hover:bg-slate-50"
              }`}
            >
              {t.cta.label}
            </Link>
          </div>
        ))}
      </div>
      <p className="mt-4 text-center text-xs text-slate-500">
        Quotas are enforced on our servers. Final prices and limits will be published before paid
        plans open.
      </p>
    </div>
  );
}
