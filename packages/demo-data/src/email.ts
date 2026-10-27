import type { DemoScenario } from "./types";

export const emailScenario: DemoScenario = {
  kind: "email",
  label: "Email",
  tagline: "Summarize, classify, and draft replies — never sends",
  inputs: [
    {
      name: "Re: Invoice #4471 overdue.eml",
      kind: "email",
      sizeLabel: "8 KB",
      preview:
        "From: accounts@fabrikam.example\nHi, our records show invoice #4471 ($2,340) is 12 days overdue. Could you confirm the payment date?",
    },
    {
      name: "Team offsite — pick a date.eml",
      kind: "email",
      sizeLabel: "5 KB",
      preview:
        "From: priya@contoso.example\nHi all, can everyone reply with availability for the offsite: 14, 15, or 21 Nov?",
    },
    {
      name: "Release notes v2.3.eml",
      kind: "email",
      sizeLabel: "11 KB",
      preview:
        "From: releases@tailspin.example\nVersion 2.3 is live. Highlights: faster exports, dark mode, bug fixes…",
    },
  ],
  suggestedRequest:
    "Summarize these emails, label each one, and draft polite replies where a response is needed.",
  plan: {
    schemaVersion: 1,
    id: "demo_plan_email",
    kind: "email",
    request:
      "Summarize these emails, label each one, and draft polite replies where a response is needed.",
    summary:
      "Use the 3 provided messages, classify and summarize them, draft replies, and let you copy drafts. Nothing is sent.",
    steps: [
      {
        id: "input",
        type: "input.pasted_text",
        title: "Use the 3 provided messages",
        dependsOn: [],
        grantIds: [],
        requiresApproval: false,
      },
      {
        id: "classify",
        type: "model.classify",
        title: "Label each message",
        dependsOn: ["input"],
        grantIds: [],
        requiresApproval: false,
      },
      {
        id: "summarize",
        type: "model.summarize",
        title: "Summarize each message",
        dependsOn: ["input"],
        grantIds: [],
        requiresApproval: false,
      },
      {
        id: "draft",
        type: "model.draft_reply",
        title: "Draft replies where needed",
        dependsOn: ["classify", "summarize"],
        grantIds: [],
        requiresApproval: false,
      },
      {
        id: "preview",
        type: "review.preview",
        title: "Show drafts for review",
        dependsOn: ["draft"],
        grantIds: [],
        requiresApproval: false,
      },
      {
        id: "copy",
        type: "client.copy_to_clipboard",
        title: "Copy a draft to clipboard",
        dependsOn: ["preview"],
        grantIds: [],
        requiresApproval: true,
      },
    ],
  },
  result: {
    type: "email",
    messages: [
      {
        from: "accounts@fabrikam.example",
        subject: "Re: Invoice #4471 overdue",
        category: "Billing",
        summary:
          "Fabrikam says invoice #4471 ($2,340) is 12 days overdue and asks for a payment date.",
        draft:
          "Hi,\n\nThanks for the reminder about invoice #4471. I'm checking with our finance team and will confirm the payment date by Friday.\n\nBest regards,",
      },
      {
        from: "priya@contoso.example",
        subject: "Team offsite — pick a date",
        category: "Scheduling",
        summary: "Priya is collecting availability for the team offsite: 14, 15, or 21 November.",
        draft:
          "Hi Priya,\n\nI'm available on the 14th and 21st; the 15th doesn't work for me.\n\nThanks for organizing!",
      },
      {
        from: "releases@tailspin.example",
        subject: "Release notes v2.3",
        category: "FYI",
        summary: "Tailspin v2.3 shipped with faster exports and dark mode. No reply needed.",
        draft: "",
      },
    ],
  },
};
