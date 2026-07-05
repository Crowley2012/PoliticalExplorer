// Downloads current state-legislator rosters from Open States (Plural Policy)
// bulk CSVs into data/state-legislators/<abbr>.csv. No API key needed.
// Run: node fetch-state-legislators.mjs
//
// Source: https://data.openstates.org/people/current/<abbr>.csv
// Territories other than DC/PR (AS, GU, VI, MP) aren't covered by Open
// States and are skipped.

import { mkdirSync, writeFileSync } from "node:fs";

const ABBRS = [
  "al", "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga",
  "hi", "id", "il", "in", "ia", "ks", "ky", "la", "me", "md",
  "ma", "mi", "mn", "ms", "mo", "mt", "ne", "nv", "nh", "nj",
  "nm", "ny", "nc", "nd", "oh", "ok", "or", "pa", "ri", "sc",
  "sd", "tn", "tx", "ut", "vt", "va", "wa", "wv", "wi", "wy",
  "dc", "pr",
];

const OUT_DIR = "data/state-legislators";
mkdirSync(OUT_DIR, { recursive: true });

for (const abbr of ABBRS) {
  const url = `https://data.openstates.org/people/current/${abbr}.csv`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`skip ${abbr}: HTTP ${res.status}`);
    continue;
  }
  const csv = await res.text();
  writeFileSync(`${OUT_DIR}/${abbr}.csv`, csv);
  const rows = csv.trim().split("\n").length - 1;
  console.log(`${abbr}: ${rows} legislators`);
}
