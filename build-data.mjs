// Builds data.js (window.GOV_DATA) from data/legislators-current.json
// plus curated executive / judicial / state data.
// Run: node build-data.mjs

import { readFileSync, writeFileSync } from "node:fs";

const DATA_AS_OF = "2026-07-05";

const STATE_NAMES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "District of Columbia", PR: "Puerto Rico", GU: "Guam", VI: "U.S. Virgin Islands",
  AS: "American Samoa", MP: "Northern Mariana Islands",
};

// State | Governor | Party | took office (verified 2026-07-05)
const GOVERNORS = [
  ["Alabama", "Kay Ivey", "R", 2017], ["Alaska", "Mike Dunleavy", "R", 2018],
  ["Arizona", "Katie Hobbs", "D", 2023], ["Arkansas", "Sarah Huckabee Sanders", "R", 2023],
  ["California", "Gavin Newsom", "D", 2019], ["Colorado", "Jared Polis", "D", 2019],
  ["Connecticut", "Ned Lamont", "D", 2019], ["Delaware", "Matt Meyer", "D", 2025],
  ["Florida", "Ron DeSantis", "R", 2019], ["Georgia", "Brian Kemp", "R", 2019],
  ["Hawaii", "Josh Green", "D", 2022], ["Idaho", "Brad Little", "R", 2019],
  ["Illinois", "JB Pritzker", "D", 2019], ["Indiana", "Mike Braun", "R", 2025],
  ["Iowa", "Kim Reynolds", "R", 2017], ["Kansas", "Laura Kelly", "D", 2019],
  ["Kentucky", "Andy Beshear", "D", 2019], ["Louisiana", "Jeff Landry", "R", 2024],
  ["Maine", "Janet Mills", "D", 2019], ["Maryland", "Wes Moore", "D", 2023],
  ["Massachusetts", "Maura Healey", "D", 2023], ["Michigan", "Gretchen Whitmer", "D", 2019],
  ["Minnesota", "Tim Walz", "D", 2019], ["Mississippi", "Tate Reeves", "R", 2020],
  ["Missouri", "Mike Kehoe", "R", 2025], ["Montana", "Greg Gianforte", "R", 2021],
  ["Nebraska", "Jim Pillen", "R", 2023], ["Nevada", "Joe Lombardo", "R", 2023],
  ["New Hampshire", "Kelly Ayotte", "R", 2025], ["New Jersey", "Mikie Sherrill", "D", 2026],
  ["New Mexico", "Michelle Lujan Grisham", "D", 2019], ["New York", "Kathy Hochul", "D", 2021],
  ["North Carolina", "Josh Stein", "D", 2025], ["North Dakota", "Kelly Armstrong", "R", 2024],
  ["Ohio", "Mike DeWine", "R", 2019], ["Oklahoma", "Kevin Stitt", "R", 2019],
  ["Oregon", "Tina Kotek", "D", 2023], ["Pennsylvania", "Josh Shapiro", "D", 2023],
  ["Rhode Island", "Dan McKee", "D", 2021], ["South Carolina", "Henry McMaster", "R", 2017],
  ["South Dakota", "Larry Rhoden", "R", 2025], ["Tennessee", "Bill Lee", "R", 2019],
  ["Texas", "Greg Abbott", "R", 2015], ["Utah", "Spencer Cox", "R", 2021],
  ["Vermont", "Phil Scott", "R", 2017], ["Virginia", "Abigail Spanberger", "D", 2026],
  ["Washington", "Bob Ferguson", "D", 2025], ["West Virginia", "Patrick Morrisey", "R", 2025],
  ["Wisconsin", "Tony Evers", "D", 2019], ["Wyoming", "Mark Gordon", "R", 2019],
];

// [department, secretary title, name, party, note]
const CABINET = [
  ["Department of State", "Secretary of State", "Marco Rubio", "R", ""],
  ["Department of the Treasury", "Secretary of the Treasury", "Scott Bessent", "R", ""],
  ["Department of Defense", "Secretary of Defense", "Pete Hegseth", "R", ""],
  ["Department of Justice", "Attorney General (Acting)", "Todd Blanche", "R", "Acting since April 2026"],
  ["Department of the Interior", "Secretary of the Interior", "Doug Burgum", "R", ""],
  ["Department of Agriculture", "Secretary of Agriculture", "Brooke Rollins", "R", ""],
  ["Department of Commerce", "Secretary of Commerce", "Howard Lutnick", "R", ""],
  ["Department of Labor", "Secretary of Labor (Acting)", "Keith Sonderling", "R", "Acting since April 2026"],
  ["Department of Health and Human Services", "Secretary of Health and Human Services", "Robert F. Kennedy Jr.", "I", ""],
  ["Department of Housing and Urban Development", "Secretary of Housing and Urban Development", "Scott Turner", "R", ""],
  ["Department of Transportation", "Secretary of Transportation", "Sean Duffy", "R", ""],
  ["Department of Energy", "Secretary of Energy", "Chris Wright", "R", ""],
  ["Department of Education", "Secretary of Education", "Linda McMahon", "R", ""],
  ["Department of Veterans Affairs", "Secretary of Veterans Affairs", "Doug Collins", "R", ""],
  ["Department of Homeland Security", "Secretary of Homeland Security", "Markwayne Mullin", "R", "Confirmed March 2026; former U.S. Senator (OK)"],
];

const CABINET_RANK = [
  ["White House Chief of Staff", "Susie Wiles"],
  ["EPA Administrator", "Lee Zeldin"],
  ["Director, Office of Management and Budget", "Russell Vought"],
  ["U.S. Trade Representative", "Jamieson Greer"],
  ["Director, Central Intelligence Agency", "John Ratcliffe"],
  ["Director of National Intelligence (Acting)", "William J. Pulte"],
  ["Administrator, Small Business Administration", "Kelly Loeffler"],
  ["U.S. Ambassador to the United Nations", "Mike Waltz"],
];

// [name, role, appointed by, party of appointer, year]
const JUSTICES = [
  ["John G. Roberts Jr.", "Chief Justice of the United States", "George W. Bush", "R", 2005],
  ["Clarence Thomas", "Associate Justice", "George H. W. Bush", "R", 1991],
  ["Samuel A. Alito Jr.", "Associate Justice", "George W. Bush", "R", 2006],
  ["Sonia Sotomayor", "Associate Justice", "Barack Obama", "D", 2009],
  ["Elena Kagan", "Associate Justice", "Barack Obama", "D", 2010],
  ["Neil M. Gorsuch", "Associate Justice", "Donald Trump", "R", 2017],
  ["Brett M. Kavanaugh", "Associate Justice", "Donald Trump", "R", 2018],
  ["Amy Coney Barrett", "Associate Justice", "Donald Trump", "R", 2020],
  ["Ketanji Brown Jackson", "Associate Justice", "Joe Biden", "D", 2022],
];

const PARTY_MAP = {
  Democrat: "D", Democratic: "D", "Democratic-Farmer-Labor": "D",
  Republican: "R", Independent: "I", Nonpartisan: "O",
};

// `value` sets bubble area (default 1 = one person). Small branches get
// heavier weights so they stay visible/clickable next to the 537-member Congress.
function person(p) {
  return { kind: "person", value: 1, ...p };
}
function info(name, description, links = [], value = 2) {
  return { kind: "info", name, value, description, links };
}
function group(name, description, children, extra = {}) {
  return { kind: "group", name, description, children, ...extra };
}

// ---- Congress members from legislators-current.json ----
const raw = JSON.parse(readFileSync("data/legislators-current.json", "utf8"));

const ordinal = (n) => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const STATE_ABBRS = Object.fromEntries(
  GOVERNORS.map(g => [g[0], Object.keys(STATE_NAMES).find(k => STATE_NAMES[k] === g[0])]));
const IS_STATE = new Set(Object.values(STATE_ABBRS));

const senators = [];
const reps = [];
for (const m of raw) {
  const t = m.terms[m.terms.length - 1];
  const party = PARTY_MAP[t.party] || "O";
  const stateName = STATE_NAMES[t.state] || t.state;
  const fullName = m.name.official_full || `${m.name.first} ${m.name.last}`;
  const base = {
    name: fullName,
    party,
    partyFull: t.party,
    state: t.state,
    stateName,
    birthday: m.bio.birthday || null,
    url: t.url || null,
    phone: t.phone || null,
    termStart: t.start,
    termEnd: t.end,
    bioguide: m.id.bioguide,
    photo: `https://unitedstates.github.io/images/congress/225x275/${m.id.bioguide}.jpg`,
    congressUrl: `https://www.congress.gov/member/${fullName.toLowerCase().replace(/[^a-z ]/g, "").replace(/ +/g, "-")}/${m.id.bioguide}`,
  };
  if (t.type === "sen") {
    senators.push(person({
      ...base,
      role: `U.S. Senator (${t.state_rank}) — ${stateName}`,
      chamber: "senate",
      senClass: t.class,
    }));
  } else {
    const isDelegate = !IS_STATE.has(t.state);
    const distLabel = t.district === 0 ? "At-large" : `${ordinal(t.district)} District`;
    reps.push(person({
      ...base,
      role: t.state === "PR" ? "Resident Commissioner — Puerto Rico"
        : isDelegate ? `Delegate — ${stateName}`
        : `U.S. Representative — ${stateName}, ${distLabel}`,
      chamber: "house",
      district: t.district,
      delegate: isDelegate,
    }));
  }
}

const byName = (a, b) => a.name.localeCompare(b.name);
const partyOrder = { D: 0, I: 1, O: 2, R: 3 };
const byParty = (a, b) => (partyOrder[a.party] - partyOrder[b.party]) || byName(a, b);
senators.sort(byParty);
reps.sort(byParty);

const partyCount = (list) => {
  const c = { D: 0, R: 0, I: 0, O: 0 };
  list.forEach(p => c[p.party]++);
  const bits = [];
  if (c.D) bits.push(`${c.D} D`);
  if (c.R) bits.push(`${c.R} R`);
  if (c.I) bits.push(`${c.I} I`);
  if (c.O) bits.push(`${c.O} other`);
  return bits.join(" · ");
};

// ---- Executive branch ----
const president = person({
  value: 8,
  name: "Donald J. Trump", party: "R", partyFull: "Republican",
  role: "47th President of the United States",
  termStart: "2025-01-20", termEnd: "2029-01-20", birthday: "1946-06-14",
  url: "https://www.whitehouse.gov/administration/donald-j-trump/",
  description: "Head of state and head of government. Commander-in-Chief of the armed forces; signs or vetoes legislation; appoints federal judges, ambassadors, and cabinet officers with Senate consent.",
});
const vicePresident = person({
  value: 5,
  name: "JD Vance", party: "R", partyFull: "Republican",
  role: "Vice President of the United States",
  termStart: "2025-01-20", termEnd: "2029-01-20", birthday: "1984-08-02",
  url: "https://www.whitehouse.gov/administration/jd-vance/",
  description: "First in the line of succession and President of the Senate, casting tie-breaking votes.",
});

const cabinetNodes = CABINET.map(([dept, title, name, party, note]) => person({
  value: 2,
  name, party, partyFull: party === "I" ? "Independent" : "Republican",
  role: title, department: dept,
  description: `${title} — leads the ${dept}.${note ? " " + note + "." : ""}`,
}));

const cabinetRankNodes = CABINET_RANK.map(([title, name]) => person({
  value: 1.5,
  name, party: "R", partyFull: "Republican", role: title,
  description: `${title} — a Cabinet-rank position in the Trump administration.`,
}));

const executive = group("Executive Branch",
  "Carries out and enforces federal law. Headed by the President, with the Vice President, the 15 executive departments of the Cabinet, and dozens of independent agencies.",
  [
    president,
    vicePresident,
    group("The Cabinet", `The heads of the 15 executive departments, in the presidential line of succession. (${partyCount(cabinetNodes)})`, cabinetNodes),
    group("Cabinet-Rank Officials", "Senior officials granted Cabinet rank in this administration, such as the Chief of Staff, EPA Administrator, and CIA Director.", cabinetRankNodes),
  ]);

// ---- Legislative branch ----
const legislative = group("Legislative Branch — U.S. Congress",
  "Makes federal law. A bicameral legislature: the Senate (100 members, 2 per state, 6-year terms) and the House of Representatives (435 voting members apportioned by population, 2-year terms).",
  [
    group("U.S. Senate", `100 senators — two per state, serving six-year terms. ${partyCount(senators)}. The Vice President presides and breaks ties.`, senators, { badge: partyCount(senators) }),
    group("House of Representatives", `435 voting representatives apportioned by population, plus 6 non-voting delegates. ${partyCount(reps)}. Two-year terms.`, reps, { badge: partyCount(reps) }),
  ]);

// ---- Judicial branch ----
const justiceNodes = JUSTICES.map(([name, role, appointer, aParty, year]) => person({
  value: 6,
  name, party: "O", partyFull: "—", role: `${role}, Supreme Court`,
  appointedBy: `${appointer} (${year})`, appointerParty: aParty,
  description: `${role} of the Supreme Court of the United States. Appointed by President ${appointer}, confirmed in ${year}. Justices serve for life during good behavior and are colored neutrally here — the judiciary is non-partisan by design.`,
}));

const judicial = group("Judicial Branch",
  "Interprets federal law and the Constitution. The Supreme Court sits at the top, above 13 Courts of Appeals and 94 District Courts.",
  [
    group("Supreme Court", "Nine justices with lifetime appointments. The final interpreter of the U.S. Constitution.", justiceNodes),
    info("U.S. Courts of Appeals",
      "13 circuit courts that hear appeals from the district courts. About 179 authorized judgeships, appointed for life by the President with Senate confirmation.",
      [["Court locator", "https://www.uscourts.gov/about-federal-courts/federal-courts-public/court-website-links"]], 9),
    info("U.S. District Courts",
      "94 trial courts of the federal system — at least one per state — with about 677 authorized judgeships. Nearly all federal cases start here.",
      [["About the district courts", "https://www.uscourts.gov/about-federal-courts/court-role-and-structure"]], 9),
  ]);

// ---- State legislators from Open States bulk CSVs (data/state-legislators/) ----
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ",") { row.push(field); field = ""; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    if (c === "\r") continue;
    field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift() || [];
  return rows
    .filter((r) => r.length > 1 || r[0] !== "")
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

// A handful of states use a different lower-chamber name/title than the
// "House of Representatives" / "State Representative" default.
const LOWER_CHAMBER_OVERRIDES = {
  CA: ["State Assembly", "Assemblymember"], NY: ["State Assembly", "Assemblymember"],
  NV: ["Assembly", "Assemblymember"], WI: ["State Assembly", "Assemblymember"],
  NJ: ["General Assembly", "Assemblymember"],
  VA: ["House of Delegates", "Delegate"], WV: ["House of Delegates", "Delegate"],
  MD: ["House of Delegates", "Delegate"],
};

// Puerto Rico's local parties, fusion-ticket lines (e.g. NY's "Democratic/
// Working Families"), and other one-offs don't map cleanly onto the federal
// two-party system, so unmapped parties fall back to "O" (colored neutrally,
// same as the judiciary) rather than being force-fit into D/R.
const unmappedParties = new Set();
function mapParty(raw) {
  if (PARTY_MAP[raw]) return PARTY_MAP[raw];
  const primary = raw.split("/")[0];
  if (PARTY_MAP[primary]) return PARTY_MAP[primary];
  unmappedParties.add(raw);
  return "O";
}

const stateLegByAbbr = {};
for (const abbr of Object.keys(STATE_NAMES)) {
  let csv;
  try {
    csv = readFileSync(`data/state-legislators/${abbr.toLowerCase()}.csv`, "utf8");
  } catch {
    continue; // not fetched, or not covered by Open States (AS, GU, VI, MP)
  }
  const stateName = STATE_NAMES[abbr];
  const [lowerName, lowerTitle] = LOWER_CHAMBER_OVERRIDES[abbr] || ["House of Representatives", "State Representative"];
  const upper = [], lower = [], unicameral = [];
  for (const r of parseCSV(csv)) {
    const party = mapParty(r.current_party);
    const chamber = r.current_chamber;
    const title = chamber === "upper" || chamber === "legislature" ? "State Senator" : lowerTitle;
    const districtLabel = r.current_district ? `, District ${r.current_district}` : "";
    const p = person({
      name: r.name,
      party, partyFull: r.current_party,
      state: abbr, stateName,
      role: `${title} — ${stateName}${districtLabel}`,
      photo: r.image || null,
      url: (r.links || r.sources || "").split(";")[0] || null,
      phone: r.capitol_voice || r.district_voice || null,
    });
    if (chamber === "legislature") unicameral.push(p);
    else if (chamber === "upper") upper.push(p);
    else lower.push(p);
  }
  upper.sort(byParty); lower.sort(byParty); unicameral.sort(byParty);
  stateLegByAbbr[abbr] = { upper, lower, unicameral, lowerName };
}
if (unmappedParties.size)
  console.warn("Unmapped state legislator parties (colored as Other):", [...unmappedParties].join(", "));

function legislatureNode(stateName, abbr) {
  const leg = stateLegByAbbr[abbr];
  if (!leg || (!leg.upper.length && !leg.lower.length && !leg.unicameral.length)) {
    return info(`${stateName} State Legislature`,
      `${stateName}'s legislature writes state law, sets the budget, and can override the governor's veto.`,
      [["Legislature overview (Ballotpedia)", `https://ballotpedia.org/${stateName.replace(/ /g, "_")}_State_Legislature`]]);
  }
  if (leg.unicameral.length) {
    return group(`${stateName} Legislature`,
      `${stateName}'s unicameral, officially nonpartisan legislature — ${leg.unicameral.length} state senators elected on a nonpartisan ballot.`,
      leg.unicameral, { badge: partyCount(leg.unicameral) });
  }
  return group(`${stateName} Legislature`,
    `${stateName}'s bicameral legislature writes state law, sets the budget, and can override the governor's veto. ${leg.upper.length + leg.lower.length} members total.`,
    [
      group("State Senate", `${leg.upper.length} members. ${partyCount(leg.upper)}.`, leg.upper, { badge: partyCount(leg.upper) }),
      group(leg.lowerName, `${leg.lower.length} members. ${partyCount(leg.lower)}.`, leg.lower, { badge: partyCount(leg.lower) }),
    ]);
}

// ---- States & local ----
const senByState = {};
senators.forEach(s => (senByState[s.state] ||= []).push(s));
const repByState = {};
reps.forEach(r => (repByState[r.state] ||= []).push(r));

const stateNodes = GOVERNORS.map(([stateName, gov, party, year]) => {
  const abbr = Object.keys(STATE_NAMES).find(k => STATE_NAMES[k] === stateName);
  const kids = [
    person({
      value: 2.5,
      name: gov, party, partyFull: party === "D" ? "Democratic" : "Republican",
      role: `Governor of ${stateName}`, state: abbr, stateName,
      termStart: String(year),
      description: `Chief executive of ${stateName}, in office since ${year}. Signs or vetoes state legislation, commands the state National Guard, and appoints state officials.`,
      url: `https://ballotpedia.org/${gov.replace(/ /g, "_")}`,
    }),
    legislatureNode(stateName, abbr),
    (() => {
      const sens = (senByState[abbr] || []).map(p => ({ ...p, crossRef: true }));
      const reps = (repByState[abbr] || []).map(p => ({ ...p, crossRef: true }));
      return group(`Congressional Delegation`,
        `${stateName}'s members of the U.S. Congress. (Also listed under the Legislative Branch.)`,
        [
          group("U.S. Senate", `${sens.length} member${sens.length === 1 ? "" : "s"}. ${partyCount(sens)}.`, sens, { badge: partyCount(sens) }),
          group("U.S. House of Representatives", `${reps.length} member${reps.length === 1 ? "" : "s"}. ${partyCount(reps)}.`, reps, { badge: partyCount(reps) }),
        ]);
    })(),
    {
      kind: "info",
      name: "Local Government",
      value: 2,
      localGov: true,
      stateAbbr: abbr,
      stateNameFull: stateName,
      description: `Below the state level, ${stateName} is governed by counties (boards of commissioners or supervisors, sheriffs, district attorneys), municipalities (mayors and city councils), school boards, and special districts. Thousands of these officials are elected locally — type your county above to look up its cities and mayors, or find yours with the links here.`,
      links: [
        ["Find your local officials (USA.gov)", "https://www.usa.gov/local-governments"],
        [`${stateName} local politics (Ballotpedia)`, `https://ballotpedia.org/${stateName.replace(/ /g, "_")}`],
      ],
    },
  ];
  return group(stateName, `The State of ${stateName} — governor, legislature, congressional delegation, and local government.`, kids, { isState: true });
});

const territoryAbbrs = ["DC", "PR", "GU", "VI", "AS", "MP"];
const territoryNodes = territoryAbbrs.map(abbr => {
  const nm = STATE_NAMES[abbr];
  const kids = [...(senByState[abbr] || []), ...(repByState[abbr] || [])].map(p => ({ ...p, crossRef: true }));
  kids.push(info(abbr === "DC" ? "D.C. Government" : `${nm} Government`,
    abbr === "DC"
      ? "The District of Columbia elects a mayor and 13-member council, but Congress retains authority over the district. D.C. has a non-voting delegate in the House and no senators."
      : `${nm} elects its own governor and legislature and sends a non-voting delegate to the U.S. House. Residents are U.S. citizens (American Samoans are U.S. nationals) but do not vote in presidential elections.`,
    [[`${nm} (Ballotpedia)`, `https://ballotpedia.org/${nm.replace(/ /g, "_")}`]]));
  return group(nm, `${nm} — a non-state jurisdiction of the United States.`, kids);
});

const statesLocal = group("States & Local Government",
  "The 50 states each mirror the federal structure — a governor, a legislature, and courts — and charter thousands of county and municipal governments below them. Currently 26 Republican and 24 Democratic governors.",
  [
    ...stateNodes,
    group("D.C. & Territories", "The District of Columbia and five inhabited territories.", territoryNodes),
  ]);

// ---- Root ----
const rootNode = group("United States Government",
  "The federal government's three branches — Executive, Legislative, Judicial — plus the state and local governments of the federal system. Click any bubble to dive in.",
  [executive, legislative, judicial, statesLocal]);

const out = { asOf: DATA_AS_OF, root: rootNode };
writeFileSync("data.js", "window.GOV_DATA = " + JSON.stringify(out) + ";\n");

// ---- County index (for the county-finder autocomplete) ----
const NAME_TO_ABBR = Object.fromEntries(Object.entries(STATE_NAMES).map(([k, v]) => [v, k]));
const counties = JSON.parse(readFileSync("data/counties.json", "utf8"));
const countyIndex = counties
  .filter((c) => NAME_TO_ABBR[c.stateName])
  .map((c) => ({
    qid: c.qid,
    name: c.name,
    state: NAME_TO_ABBR[c.stateName],
    stateName: c.stateName,
    label: `${c.name}, ${c.stateName}`,
  }));
writeFileSync("county-index.js", "window.COUNTY_INDEX = " + JSON.stringify(countyIndex) + ";\n");
console.log(`Wrote county-index.js — ${countyIndex.length} counties.`);

const count = (n) => 1 + (n.children ? n.children.reduce((a, c) => a + count(c), 0) : 0);
const stateLegCount = Object.values(stateLegByAbbr).reduce((a, s) => a + s.upper.length + s.lower.length + s.unicameral.length, 0);
console.log(`Wrote data.js — ${count(rootNode)} nodes, ${senators.length} senators, ${reps.length} house members, ${stateLegCount} state legislators.`);
