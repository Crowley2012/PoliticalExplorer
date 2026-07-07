// Fetches all US county-equivalents (name + state + Wikidata QID) from
// Wikidata's public SPARQL endpoint into data/counties.json, for
// build-data.mjs to compact into county-index.js (the county-finder
// autocomplete roster). No API key needed.
// Run: node fetch-counties.mjs
//
// Covers 5 Wikidata classes of US county-equivalent, since counties are
// modeled inconsistently across states:
//   Q47168      county of the United States (+ subclasses, incl. Q3301053
//               consolidated city-county — Denver, SF, Nashville-Davidson, etc.)
//   Q1266818    independent city in the United States (VA's ~38 + Baltimore + St. Louis)
//   Q13410524   parish of Louisiana (not a subclass of Q47168)
//   Q13410522   borough of Alaska
//   Q56064719   census area of Alaska (unorganized-borough census areas)
//
// Each class is queried separately (rather than one big UNION) because
// Wikidata's public endpoint times out (HTTP 504) on the combined query once
// a same-typed-as-a-real-US-state filter is added to ?state. Instead this
// takes the cheap direct (non-transitive) P131 hop for every branch — which
// sometimes returns a historical/non-state parent (e.g. "Mississippi
// Territory") alongside the real one for a given county — and filters down
// to real US states client-side against the same 50-state roster
// build-data.mjs already uses.

import { mkdirSync, writeFileSync } from "node:fs";

const ENDPOINT = "https://query.wikidata.org/sparql";

const BRANCHES = [
  "?county wdt:P31/wdt:P279* wd:Q47168 .",
  "?county wdt:P31 wd:Q1266818 .",
  "?county wdt:P31 wd:Q13410524 .",
  "?county wdt:P31 wd:Q13410522 .",
  "?county wdt:P31 wd:Q56064719 .",
];

const STATE_NAMES = new Set([
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut",
  "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa",
  "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan",
  "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire",
  "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
  "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
  "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia",
  "Wisconsin", "Wyoming",
]);

async function runBranch(pattern, attempt = 1) {
  const query = `
    SELECT ?county ?countyLabel ?state ?stateLabel WHERE {
      ${pattern}
      FILTER NOT EXISTS { ?county wdt:P576 ?end }
      ?county wdt:P131 ?state .
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
  `;
  const res = await fetch(`${ENDPOINT}?query=${encodeURIComponent(query)}`, {
    headers: {
      Accept: "application/sparql-results+json",
      "User-Agent": "PoliticsExplorer/1.0 (county roster build script)",
    },
  });
  if (!res.ok) {
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 2000 * attempt));
      return runBranch(pattern, attempt + 1);
    }
    throw new Error(`Wikidata query failed: HTTP ${res.status} for branch: ${pattern}`);
  }
  const json = await res.json();
  return json.results.bindings;
}

const byQid = new Map();
for (const pattern of BRANCHES) {
  const bindings = await runBranch(pattern);
  for (const b of bindings) {
    const stateName = b.stateLabel.value;
    if (!STATE_NAMES.has(stateName)) continue; // drop historical/non-state P131 targets
    const qid = b.county.value.split("/").pop();
    if (byQid.has(qid)) continue; // county already resolved to a real state from another P131 value
    byQid.set(qid, {
      qid,
      name: b.countyLabel.value,
      stateQid: b.state.value.split("/").pop(),
      stateName,
    });
  }
  // Be polite to the shared public endpoint between branch queries.
  await new Promise((r) => setTimeout(r, 500));
}

const rows = [...byQid.values()].sort((a, b) =>
  a.stateName === b.stateName ? a.name.localeCompare(b.name) : a.stateName.localeCompare(b.stateName)
);

mkdirSync("data", { recursive: true });
writeFileSync("data/counties.json", JSON.stringify(rows));
console.log(`Wrote data/counties.json — ${rows.length} county-equivalents (Census Bureau count is ~3,144; investigate if far off).`);
