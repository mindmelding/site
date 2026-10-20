// Current products first, then earlier experiments. `plate` picks the generated artwork: waves, rings, halftone, script, bars, grid.
// `ink: "light"` prints dark ink on a paper plate; default is a dark plate.
// Each project gets a page at /<slug>: `slug` defaults to the title in lowercase with dashes.
// Optional: `url` (the live thing), `docs` (path of its docs, e.g. "/docs-kit/docs/"), `repo` (public GitHub "owner/name").
window.projectSlug = (p) => p.slug || p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

window.PROJECTS = [
  {
    title: "Buoy Desk",
    slug: "buoy",
    date: "09.2026",
    url: "https://buoydesk.com",
    text: "An AI employee for independent shops in North County San Diego. It answers after-hours calls, follows up on quotes, asks for reviews and brings customers back, all for one monthly retainer. Every shop starts with a free audit.",
    plate: "waves",
  },
  {
    title: "Summit",
    date: "09.2026",
    url: "https://mindmelding.dev/summit/",
    docs: "/summit/docs/",
    text: "Climb a real mountain, one neighborhood walk at a time. Tell Summit how much climb you want and it finds walking loops from where you stand, counts every foot and banks it toward a peak you choose. Free for iPhone, with a TestFlight beta up next.",
    plate: "rings",
    ink: "light",
  },
  {
    title: "Loyalty MCP",
    date: "09.2026",
    url: "https://mindmelding.dev/lmcp/",
    text: "Tells an AI assistant whether a card charge could have earned restaurant rewards. Give it a bank descriptor and it names the merchant, finds the loyalty program and estimates what went unclaimed.",
    plate: "grid",
    words: ["resolve", "lookup", "live", "inferred", "unknown", "signup", "rebate", "descriptor"],
  },
  {
    title: "Swap My Stack",
    date: "09.2026",
    url: "https://mindmelding.dev/swapmystack/",
    text: "Shows what a Shopify store's apps cost, what replaces them for less, and walks the switch one step at a time, from export to cancelling the old app.",
    plate: "bars",
  },
  {
    title: "Front of House",
    date: "09.2026",
    text: "A hospitality canon any customer-facing agent can load. It gives a support bot the manners of the best host who ever worked the floor: warm, specific, honest, and quick with the small stuff.",
    plate: "script",
    ink: "light",
    words: ["welcome", "regulars", "noticed", "on the house", "grant", "honest", "first shift", "voice"],
    repo: "mindmelding/front-of-house",
  },
];
