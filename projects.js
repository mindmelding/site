// Newest first. `plate` picks the generated artwork: waves, rings, halftone, script, bars, grid.
// `ink: "light"` prints dark ink on a paper plate; default is a dark plate.
// Each project gets a page at /<slug>: `slug` defaults to the title in lowercase with dashes.
// Optional: `url` (the live thing), `docs` (path of its docs, e.g. "/docs-kit/docs/"), `repo` (public GitHub "owner/name").
window.projectSlug = (p) => p.slug || p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

window.PROJECTS = [
  {
    title: "docs-kit",
    date: "09.2026",
    text: "Turns a folder of Markdown into a docs site with tabs, search, dark mode and a plain-text copy for AI agents. Every project here gets its docs from it.",
    plate: "grid",
    words: ["callout", "steps", "tabs", "search", "llms.txt", "sidebar", "base", "build"],
    docs: "/docs-kit/docs/",
    repo: "mindmelding/docs-kit",
  },
  {
    title: "Ownerside",
    date: "09.2026",
    text: "A monthly owner letter that Oceanside vacation-rental managers send under their own name. Each issue arrives branded and ready to paste.",
    plate: "script",
    ink: "light",
    words: ["occupancy", "owner", "april", "nightly", "letter", "oceanside", "booked", "rate"],
  },
  {
    title: "Swap My Stack",
    date: "09.2026",
    text: "Shows what a Shopify store's apps cost, what replaces them for less, and walks the switch one step at a time, from export to cancelling the old app.",
    plate: "bars",
  },
  {
    title: "pain-scan",
    date: "09.2026",
    text: "Reads complaints about popular software and sorts the ones code could fix from the ones it can't. Twelve products scored in the pilot.",
    plate: "halftone",
  },
  {
    title: "appt-record",
    date: "09.2026",
    text: "One appointment record built from confirmation emails, whatever booking system sent them.",
    plate: "script",
    words: ["confirmed", "10:30", "arrive early", "fee", "cancel", "reschedule", "suite 4", "bring"],
  },
  {
    title: "pos-map",
    date: "09.2026",
    text: "Maps which local restaurants run which point-of-sale system, using public web data alone.",
    plate: "halftone",
    ink: "light",
  },
  {
    title: "Lunch Bell",
    date: "08.2026",
    url: "https://lunch-bell.vercel.app",
    text: "A school-menu email for parents. Point it at an elementary school and it finds today's breakfast and lunch.",
    plate: "rings",
    ink: "light",
  },
  {
    title: "gtask",
    date: "08.2026",
    text: "Google Tasks from the command line, with no dependencies.",
    plate: "grid",
    ink: "light",
  },
  {
    title: "Steelman",
    date: "07.2026",
    text: "Drop in an article and get back the strongest case against it. Before it argues, it reruns the numbers from the article's own sources.",
    plate: "script",
    ink: "light",
    words: ["claim", "source", "conceded", "table 3", "n = 1,204", "holds", "fails", "recomputed"],
  },
  {
    title: "imsg-crm",
    date: "07.2026",
    text: "Relationship notes drawn from a personal iMessage history, kept on one Mac. It flags promises left open and friends gone quiet.",
    plate: "grid",
  },
  {
    title: "imsg-agent",
    date: "07.2026",
    text: "Text your own Mac from your phone and it runs the job. Incoming text never reaches a model.",
    plate: "rings",
  },
  {
    title: "Padres Intel",
    date: "07.2026",
    text: "A baseball data pipeline for the San Diego Padres, built on free sources with no API keys.",
    plate: "halftone",
  },
  {
    title: "toast-watch",
    date: "07.2026",
    text: "Watches a restaurant's reservation page and sends a ping when a table opens.",
    plate: "grid",
    ink: "light",
  },
  {
    title: "Peloton telemetry",
    date: "06.2026",
    text: "Live ride stats from a first-generation Peloton with no subscription, read from logs the app already writes.",
    plate: "waves",
  },
  {
    title: "Obby",
    date: "06.2026",
    text: "An obstacle course game for Roblox where a teddy bear chases you through each zone.",
    plate: "bars",
    ink: "light",
  },
];
