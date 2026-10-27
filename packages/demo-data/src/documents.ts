import type { DemoScenario } from "./types";

export const documentsScenario: DemoScenario = {
  kind: "documents",
  label: "Documents",
  tagline: "Summarize and extract from files you pick",
  inputs: [
    {
      name: "Northwind-Supply-Agreement.pdf",
      kind: "document",
      sizeLabel: "184 KB",
      preview:
        'SUPPLY AGREEMENT between Northwind Traders ("Supplier") and Contoso Bakery ("Buyer"). Term: 24 months from 1 March. Payment: net 45. Renewal: automatic for 12 months unless either party gives 60 days\' written notice…',
    },
    {
      name: "Q3-Vendor-Review.docx",
      kind: "document",
      sizeLabel: "62 KB",
      preview:
        "Vendor review, Q3. Northwind delivered 96% on time (target 98%). Two quality incidents, both resolved within SLA. Recommend renegotiating payment terms at renewal…",
    },
    {
      name: "pricing-schedule.csv",
      kind: "document",
      sizeLabel: "3 KB",
      preview:
        "sku,description,unit_price,currency\nFL-001,Bread flour 25kg,18.40,USD\nYE-002,Dry yeast 500g,6.10,USD\n…",
    },
  ],
  suggestedRequest:
    "Summarize the Northwind supply agreement and vendor review, and extract the key contract terms into a table.",
  plan: {
    schemaVersion: 1,
    id: "demo_plan_documents",
    kind: "documents",
    request:
      "Summarize the Northwind supply agreement and vendor review, and extract the key contract terms into a table.",
    summary:
      "Read 3 selected files, summarize them, extract contract terms, preview, then save on approval.",
    steps: [
      {
        id: "read",
        type: "local.read_grant",
        title: "Read the 3 selected files",
        dependsOn: [],
        grantIds: ["demo_grant_docs"],
        requiresApproval: false,
      },
      {
        id: "summarize",
        type: "model.summarize",
        title: "Summarize agreement and review",
        dependsOn: ["read"],
        grantIds: [],
        requiresApproval: false,
      },
      {
        id: "extract",
        type: "model.extract",
        title: "Extract key contract terms",
        dependsOn: ["read"],
        grantIds: [],
        requiresApproval: false,
      },
      {
        id: "preview",
        type: "review.preview",
        title: "Show results for review",
        dependsOn: ["summarize", "extract"],
        grantIds: [],
        requiresApproval: false,
      },
      {
        id: "save",
        type: "local.save_file",
        title: "Save report to a location you choose",
        dependsOn: ["preview"],
        grantIds: [],
        requiresApproval: true,
      },
    ],
  },
  result: {
    type: "documents",
    summary: [
      "24-month supply agreement with Northwind Traders starting 1 March; auto-renews for 12 months unless cancelled with 60 days' written notice.",
      "Payment terms are net 45. The Q3 review recommends renegotiating these at renewal.",
      "On-time delivery was 96% against a 98% target; two quality incidents were resolved within SLA.",
    ],
    table: {
      columns: ["Term", "Value", "Source"],
      rows: [
        ["Contract length", "24 months", "Supply agreement §2"],
        ["Renewal", "Auto, 12 months", "Supply agreement §9"],
        ["Notice period", "60 days, written", "Supply agreement §9"],
        ["Payment terms", "Net 45", "Supply agreement §5"],
        ["On-time delivery (Q3)", "96% (target 98%)", "Q3 vendor review"],
      ],
    },
    saveAs: "Northwind-summary.md",
  },
};
