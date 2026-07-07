/* US Politics Explorer — zoomable circle-packing map of the US government. */
(function () {
  "use strict";

  const DATA = window.GOV_DATA;
  const COUNTY_INDEX = window.COUNTY_INDEX || [];
  const S = 1400; // pack layout size (viewBox units)

  const PARTY_COLOR = { D: "#3987e5", R: "#e66767", I: "#c98500", O: "#898781" };
  const PARTY_NAME = { D: "Democrat", R: "Republican", I: "Independent", O: "Nonpartisan" };

  // ---------- hierarchy & pack ----------
  const root = d3
    .pack()
    .size([S, S])
    .padding((d) => (d.depth === 0 ? 14 : d.children && d.children.length > 60 ? 2 : 5))(
    d3.hierarchy(DATA.root).sum((d) => (d.children ? 0 : d.value || 1))
  );

  // stable per-node ids so keyed joins survive dynamic splices (see refreshSelections)
  let nextId = 0;
  root.each((d) => (d.id = nextId++));

  // party tallies per node (descendant persons)
  function tallyReducer(d) {
    const t = { D: 0, R: 0, I: 0, O: 0 };
    if (d.children) {
      d.children.forEach((c) => {
        for (const k in t) t[k] += c.partyTally[k];
      });
    } else if (d.data.kind === "person") {
      t[d.data.party] = 1;
    }
    d.partyTally = t;
  }
  root.eachAfter(tallyReducer);

  // The root would double-count members of Congress (they also appear inside
  // their state's Congressional Delegation), so tally it from canonical people only.
  {
    const t = { D: 0, R: 0, I: 0, O: 0 };
    root.each((d) => {
      if (!d.children && d.data.kind === "person" && !d.data.crossRef) t[d.data.party]++;
    });
    root.partyTally = t;
  }

  let focus = root;
  let view = [root.x, root.y, root.r * 2];

  const svg = d3
    .select("#viz")
    .attr("viewBox", `${-S / 2} ${-S / 2} ${S} ${S}`)
    .on("click", () => zoom(focus.parent || root));

  // ---------- circles & labels ----------
  // nodeLayer gets one shared transform per zoom frame instead of rewriting
  // transform/r on all circles every frame — cx/cy/r are static pack
  // coordinates set once per node (refreshed only on boot / a county splice).
  const nodeLayer = svg.append("g");
  const labelLayer = svg.append("g").attr("pointer-events", "none").attr("text-anchor", "middle");

  let node, label;

  function circleFillColor(d) {
    if (d.data.kind === "person") return PARTY_COLOR[d.data.party] || PARTY_COLOR.O;
    if (d.data.kind === "info") return "rgba(255,255,255,0.03)";
    return d === root ? "none" : "rgba(255,255,255,0.035)";
  }
  function circleStrokeColor(d) {
    if (d.data.kind === "person") return "rgba(0,0,0,0.35)";
    if (d.data.kind === "info") return "rgba(255,255,255,0.22)";
    return d === root ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.13)";
  }

  function styleCircleEnter(sel) {
    return sel
      .attr("cx", (d) => d.x)
      .attr("cy", (d) => d.y)
      .attr("r", (d) => Math.max(d.r, 0.1))
      .attr("vector-effect", "non-scaling-stroke")
      .style("cursor", "pointer")
      .on("mouseover", function (event, d) {
        d3.select(this).attr("stroke", d.data.kind === "person" ? "#ffffff" : "rgba(255,255,255,0.5)");
        showTooltip(event, d);
      })
      .on("mousemove", (event, d) => showTooltip(event, d))
      .on("mouseout", function (event, d) {
        d3.select(this).attr("stroke", circleStrokeColor(d));
        hideTooltip();
      })
      .on("click", (event, d) => {
        event.stopPropagation();
        hideTooltip();
        if (d.data.kind === "person" || d.data.kind === "info") {
          openPanel(d.data);
          zoom(d.parent && projR(d) < 90 ? d : focus === d.parent ? focus : d.parent || root);
        } else if (d.data.localGov) {
          // county-finder group (pre- or post-splice): keep the finder panel reachable
          openPanel(d.data);
          if (d !== focus) zoom(d);
        } else if (d !== focus) {
          closePanel();
          zoom(d);
        } else if (d.parent) {
          zoom(d.parent);
        }
      });
  }

  function styleCircleVisual(sel) {
    return sel
      .attr("class", (d) => "n-" + (d.data.kind || "group"))
      .attr("fill", circleFillColor)
      .attr("stroke", circleStrokeColor)
      .attr("stroke-dasharray", (d) => (d.data.kind === "info" ? "3 3" : null));
  }

  function styleLabelEnter(sel) {
    return sel
      .style("display", "none")
      .attr("fill", (d) => (d.data.kind === "person" ? "#0b0d10" : "#ffffff"))
      .attr("paint-order", "stroke")
      .attr("stroke", (d) => (d.data.kind === "person" ? "rgba(255,255,255,0.25)" : "rgba(13,15,19,0.65)"))
      .attr("stroke-width", (d) => (d.data.kind === "person" ? 0 : 3))
      .attr("font-weight", 600);
  }

  function rebuildLabelContent(el, d) {
    const sel = d3.select(el);
    sel.selectAll("tspan").remove();
    const lines = wrap(d.data.name, d.data.kind === "person" ? 11 : 14);
    const n = lines.length + (d.children ? 1 : 0);
    lines.forEach((line, i) => {
      sel
        .append("tspan")
        .attr("x", 0)
        .attr("dy", i === 0 ? `${-(n - 1) * 0.55}em` : "1.1em")
        .text(line);
    });
    if (d.children) {
      sel
        .append("tspan")
        .attr("class", "count")
        .attr("x", 0)
        .attr("dy", "1.25em")
        .attr("font-weight", 400)
        .attr("fill", "#c3c5cc")
        .text(countLabel(d));
    }
  }

  function refreshSelections() {
    const nodes = root.descendants();

    node = nodeLayer
      .selectAll("circle")
      .data(nodes, (d) => d.id)
      .join(
        (enter) => styleCircleVisual(styleCircleEnter(enter.append("circle"))),
        (update) => styleCircleVisual(update),
        (exit) => exit.remove()
      );

    label = labelLayer
      .selectAll("text")
      .data(nodes, (d) => d.id)
      .join(
        (enter) => styleLabelEnter(enter.append("text")),
        (update) => update,
        (exit) => exit.remove()
      );
    label.each(function (d) {
      rebuildLabelContent(this, d);
    });
  }

  function countLabel(d) {
    const t = d.partyTally;
    const people = t.D + t.R + t.I + t.O;
    if (!people) return `${d.children.length} items`;
    const bits = [];
    if (t.D) bits.push(`${t.D} D`);
    if (t.R) bits.push(`${t.R} R`);
    if (t.I) bits.push(`${t.I} I`);
    return bits.length ? bits.join(" · ") : `${people} people`;
  }

  function wrap(text, width) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let cur = "";
    words.forEach((w) => {
      if (cur && (cur + " " + w).length > width) {
        lines.push(cur);
        cur = w;
      } else cur = cur ? cur + " " + w : w;
    });
    if (cur) lines.push(cur);
    return lines.slice(0, 3);
  }

  refreshSelections();

  // ---------- zoom ----------
  function projR(d) {
    return (d.r * S) / view[2]; // node radius in viewBox px at current view
  }

  function zoomTo(v) {
    const k = S / v[2];
    view = v;
    nodeLayer.attr("transform", `scale(${k}) translate(${-v[0]},${-v[1]})`);
  }

  function labelVisible(d, k) {
    if (d.parent !== focus && d !== focus) return false;
    if (d === focus) return !d.children && d.r * k > 60; // focused leaf
    return d.r * k > (d.children ? 26 : 30);
  }

  function updateLabels(k) {
    label
      .attr("transform", (d) => `translate(${(d.x - view[0]) * k},${(d.y - view[1]) * k})`)
      .style("display", (d) => (labelVisible(d, k) ? "inline" : "none"))
      .attr("font-size", (d) => {
        const pr = d.r * k;
        return Math.max(10, Math.min(30, pr * 0.2)) + "px";
      })
      .attr("fill-opacity", 1);
    label.selectAll("tspan.count").attr("font-size", "0.72em");
  }

  function zoom(d) {
    if (!d) return;
    focus = d;
    const targetView = [focus.x, focus.y, Math.max(focus.r * 2 * (focus.children ? 1.08 : 1.7), 1)];
    const k = S / targetView[2];

    label.attr("fill-opacity", 0).style("display", "none");

    svg
      .transition()
      .duration(650)
      .tween("zoom", () => {
        const i = d3.interpolateZoom(view, targetView);
        return (t) => zoomTo(i(t));
      })
      .on("end", () => updateLabels(k));

    renderCrumbs();
    renderInfobar();
  }

  // ---------- breadcrumbs ----------
  const crumbEl = document.getElementById("breadcrumbs");
  function renderCrumbs() {
    crumbEl.innerHTML = "";
    const path = focus.ancestors().reverse();
    path.forEach((d, i) => {
      if (i > 0) {
        const sep = document.createElement("span");
        sep.className = "crumb-sep";
        sep.textContent = "›";
        crumbEl.appendChild(sep);
      }
      const c = document.createElement("button");
      c.className = "crumb" + (d === focus ? " current" : "");
      c.textContent = shortName(d.data.name);
      if (d !== focus) c.addEventListener("click", () => zoom(d));
      crumbEl.appendChild(c);
    });
  }
  function shortName(n) {
    return n
      .replace("United States Government", "USA")
      .replace("Legislative Branch — U.S. Congress", "Congress")
      .replace(" Branch", "")
      .replace("House of Representatives", "House");
  }

  // ---------- info bar ----------
  const infoTitle = document.getElementById("info-title");
  const infoDesc = document.getElementById("info-desc");
  const partyBar = document.getElementById("info-partybar");

  function renderInfobar() {
    const d = focus;
    infoTitle.textContent = d.data.name;
    infoDesc.textContent = d.data.description || "";
    const t = d.partyTally;
    const total = t.D + t.R + t.I + t.O;
    if (total > 1 && d.data.kind !== "person") {
      partyBar.hidden = false;
      const track = partyBar.querySelector(".pb-track");
      const counts = partyBar.querySelector(".pb-counts");
      track.innerHTML = "";
      counts.innerHTML = "";
      ["D", "R", "I", "O"].forEach((p) => {
        if (!t[p]) return;
        const seg = document.createElement("div");
        seg.className = "pb-seg";
        seg.style.flex = String(t[p]);
        seg.style.background = PARTY_COLOR[p];
        track.appendChild(seg);
        const c = document.createElement("span");
        c.innerHTML = `<b>${t[p]}</b> ${p === "O" ? "Nonpartisan" : PARTY_NAME[p]}`;
        counts.appendChild(c);
      });
    } else {
      partyBar.hidden = true;
    }
  }

  // ---------- tooltip ----------
  const tt = document.getElementById("tooltip");
  function showTooltip(event, d) {
    let sub;
    if (d.data.kind === "person") {
      sub = `<span class="tt-dot" style="background:${PARTY_COLOR[d.data.party]}"></span>${
        d.data.partyFull && d.data.partyFull !== "—" ? d.data.partyFull + " · " : ""
      }${d.data.role || ""}`;
    } else if (d.children) {
      sub = countLabel(d) + " — click to expand";
    } else {
      sub = "Click for details";
    }
    tt.innerHTML = `<div class="tt-name">${esc(d.data.name)}</div><div class="tt-sub">${sub}</div>`;
    tt.hidden = false;
    const pad = 14;
    let x = event.clientX + pad;
    let y = event.clientY + pad;
    const r = tt.getBoundingClientRect();
    if (x + r.width > innerWidth - 8) x = event.clientX - r.width - pad;
    if (y + r.height > innerHeight - 8) y = event.clientY - r.height - pad;
    tt.style.left = x + "px";
    tt.style.top = y + "px";
  }
  function hideTooltip() {
    tt.hidden = true;
  }

  // ---------- detail panel ----------
  const panel = document.getElementById("panel");
  const panelBody = document.getElementById("panel-body");
  const asof = document.getElementById("asof");
  document.getElementById("panel-close").addEventListener("click", closePanel);

  function openPanel(p) {
    panelBody.innerHTML = p.kind === "person" ? personHTML(p) : infoHTML(p);
    panel.hidden = false;
    asof.classList.add("panel-open");
    const img = panelBody.querySelector(".p-photo");
    if (img) {
      img.addEventListener("error", () => {
        img.closest(".p-photo-wrap").outerHTML = monogramHTML(p);
      });
    }
    if (p.localGov) wireCountyFinder(p);
  }
  function closePanel() {
    panel.hidden = true;
    asof.classList.remove("panel-open");
  }

  function monogramHTML(p) {
    const initials = p.name
      .split(/\s+/)
      .filter((w) => /^[A-Z]/.test(w))
      .map((w) => w[0])
      .slice(0, 2)
      .join("");
    const c = PARTY_COLOR[p.party] || PARTY_COLOR.O;
    return `<div class="p-monogram" style="background:linear-gradient(135deg, ${c}55, ${c}22)">${esc(initials)}</div>`;
  }

  function personHTML(p) {
    const rows = [];
    if (p.stateName) rows.push(["State", p.stateName + (p.state ? ` (${p.state})` : "")]);
    if (p.chamber === "house" && !p.delegate)
      rows.push(["District", p.district === 0 ? "At-large" : ordinal(p.district)]);
    if (p.termStart) rows.push(["In office since", fmtDate(p.termStart)]);
    if (p.termEnd && p.termEnd.length > 4) rows.push(["Current term ends", fmtDate(p.termEnd)]);
    if (p.appointedBy) rows.push(["Appointed by", p.appointedBy]);
    if (p.birthday) rows.push(["Born", `${fmtDate(p.birthday)} (age ${age(p.birthday)})`]);
    if (p.phone) rows.push(["Phone", p.phone]);

    const links = [];
    if (p.url)
      links.push([
        p.url.includes("ballotpedia") ? "Ballotpedia profile" : p.url.includes("wikidata.org") ? "Wikidata profile" : "Official website",
        p.url,
      ]);
    if (p.congressUrl) links.push(["Congress.gov profile", p.congressUrl]);
    if (p.bioguide) links.push(["Voting record (GovTrack)", `https://www.govtrack.us/congress/members/${p.bioguide}`]);

    const partyLabel = p.partyFull && p.partyFull !== "—" ? p.partyFull : PARTY_NAME[p.party] || "Nonpartisan";

    return `
      ${p.photo
        ? `<div class="p-photo-wrap"><img class="p-photo" src="${p.photo}" alt="Portrait of ${esc(p.name)}"></div>`
        : monogramHTML(p)}
      <div class="p-body">
        <div class="p-name">${esc(p.name)}</div>
        <div class="p-role">${esc(p.role || "")}</div>
        <span class="party-pill"><span class="swatch" style="background:${PARTY_COLOR[p.party] || PARTY_COLOR.O}"></span>${esc(partyLabel)}</span>
        ${rows.length ? `<div class="p-meta">${rows.map(([k, v]) => `<div class="p-meta-row"><span class="k">${k}</span><span class="v">${esc(v)}</span></div>`).join("")}</div>` : ""}
        ${p.description ? `<div class="p-desc">${esc(p.description)}</div>` : ""}
        ${links.length ? `<div class="p-links">${links.map(([t, u]) => `<a href="${u}" target="_blank" rel="noopener">${esc(t)}</a>`).join("")}</div>` : ""}
      </div>`;
  }

  function infoHTML(p) {
    const links = (p.links || []).map(([t, u]) => `<a href="${u}" target="_blank" rel="noopener">${esc(t)}</a>`).join("");
    const finder = p.localGov
      ? `
      <div class="county-finder">
        <label for="county-input">Find your county</label>
        <div class="county-finder-row">
          <input id="county-input" list="county-datalist" placeholder="e.g. Travis County, Texas" autocomplete="off" spellcheck="false">
          <button id="county-go" type="button">Go</button>
        </div>
        <div id="county-status" class="county-status"></div>
      </div>`
      : "";
    return `
      <div class="p-body" style="padding-top:40px">
        <div class="p-name">${esc(p.name)}</div>
        ${p.description ? `<div class="p-desc" style="margin-top:4px">${esc(p.description)}</div>` : ""}
        ${links ? `<div class="p-links">${links}</div>` : ""}
        ${finder}
      </div>`;
  }

  // ---------- county lookup (live Wikidata query + dynamic splice) ----------
  function mapWikidataParty(label) {
    if (!label) return "O";
    const l = label.toLowerCase();
    if (l.includes("democratic")) return "D";
    if (l.includes("republican")) return "R";
    if (l.includes("independent")) return "I";
    return "O";
  }

  async function fetchCountyMayors(qid) {
    const cacheKey = `county-mayors:${qid}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);

    const query = `
      SELECT ?city ?cityLabel ?mayor ?mayorLabel ?start ?partyLabel WHERE {
        ?city wdt:P131 wd:${qid} .
        ?city wdt:P31/wdt:P279* wd:Q515 .
        OPTIONAL {
          ?city p:P6 ?stmt .
          ?stmt ps:P6 ?mayor .
          FILTER NOT EXISTS { ?stmt pq:P582 ?end }
          OPTIONAL { ?stmt pq:P580 ?start }
          OPTIONAL { ?mayor wdt:P102 ?party }
        }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }
    `;

    let result;
    try {
      const res = await fetch(`https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}`, {
        headers: { Accept: "application/sparql-results+json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      const byCity = new Map();
      for (const b of json.results.bindings) {
        const cqid = b.city.value.split("/").pop();
        if (!byCity.has(cqid)) byCity.set(cqid, { qid: cqid, name: b.cityLabel.value, mayor: null });
        if (b.mayor) {
          byCity.get(cqid).mayor = {
            qid: b.mayor.value.split("/").pop(),
            name: b.mayorLabel.value,
            start: b.start ? b.start.value.slice(0, 10) : null,
            party: mapWikidataParty(b.partyLabel && b.partyLabel.value),
          };
        }
      }
      const cities = [...byCity.values()].sort((a, b) => a.name.localeCompare(b.name));
      result = cities.length ? { ok: true, cities } : { ok: false, reason: "empty" };
    } catch (e) {
      result = { ok: false, reason: "network" };
    }
    if (result.ok) sessionStorage.setItem(cacheKey, JSON.stringify(result));
    return result;
  }

  function citiesToNodeData(cities) {
    return cities.map((city) => {
      if (city.mayor) {
        return {
          kind: "person",
          value: 1.4,
          name: city.mayor.name,
          party: city.mayor.party,
          role: `Mayor of ${city.name}`,
          description: `Mayor of ${city.name}. Sourced live from Wikidata.`,
          termStart: city.mayor.start || "",
          url: `https://www.wikidata.org/wiki/${city.mayor.qid}`,
        };
      }
      return {
        kind: "info",
        value: 1,
        name: city.name,
        description: `${city.name} — current mayor not listed on Wikidata.`,
        links: [[`${city.name} on Wikidata`, `https://www.wikidata.org/wiki/${city.qid}`]],
      };
    });
  }

  function packAndRemap(cityNodeData, targetNode) {
    const localRoot = d3.hierarchy({ children: cityNodeData }).sum((d) => (d.children ? 0 : d.value || 1));
    d3.pack().size([S, S]).padding(5)(localRoot);

    // Capture the local root's own coordinates before mutating anything —
    // .each() visits the root before its children, so writing into
    // localRoot.x/y first would corrupt every child's remap below.
    const { x: lx, y: ly, r: lr } = localRoot;
    const scale = targetNode.r / lr;
    localRoot.each((n) => {
      n.x = targetNode.x + (n.x - lx) * scale;
      n.y = targetNode.y + (n.y - ly) * scale;
      n.r = n.r * scale;
    });

    const depthDelta = targetNode.depth; // local children (depth 1) land at targetNode.depth + 1
    localRoot.children.forEach((c) => {
      c.each((d) => {
        d.depth += depthDelta;
      });
      c.parent = targetNode;
    });
    return localRoot.children;
  }

  function isDescendantOf(d, ancestor) {
    let p = d;
    while (p) {
      if (p === ancestor) return true;
      p = p.parent;
    }
    return false;
  }

  function afterSplicePartyTally(node, oldTally) {
    const delta = {};
    for (const k in node.partyTally) delta[k] = node.partyTally[k] - oldTally[k];
    let anc = node.parent;
    while (anc) {
      for (const k in delta) anc.partyTally[k] += delta[k];
      anc = anc.parent;
    }
  }

  function spliceCounty(targetNode, countyMeta, cities) {
    const newChildren = packAndRemap(citiesToNodeData(cities), targetNode);

    removeFromSearchable(targetNode);
    const oldTally = targetNode.partyTally;

    targetNode.data = {
      kind: "group",
      name: `${countyMeta.name} — Cities`,
      description: `Cities in ${countyMeta.name}, ${countyMeta.stateName} and their current mayors, live from Wikidata.`,
      localGov: true,
      stateAbbr: targetNode.data.stateAbbr,
      stateNameFull: targetNode.data.stateNameFull,
      links: targetNode.data.links,
    };
    targetNode.children = newChildren;
    targetNode.each((d) => {
      if (d !== targetNode) d.id = nextId++;
    });

    targetNode.eachAfter(tallyReducer);
    afterSplicePartyTally(targetNode, oldTally);

    addToSearchable(targetNode.descendants());
    refreshSelections();
  }

  function wireCountyFinder(p) {
    const targetNode = root.descendants().find((d) => d.data === p);
    if (!targetNode) return;
    const input = document.getElementById("county-input");
    const btn = document.getElementById("county-go");
    const status = document.getElementById("county-status");

    btn.addEventListener("click", runLookup);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") runLookup();
    });

    async function runLookup() {
      const typed = input.value.trim();
      if (!typed) return;
      const match = COUNTY_INDEX.find(
        (c) => c.label.toLowerCase() === typed.toLowerCase() && c.state === p.stateAbbr
      );
      if (!match) {
        status.className = "county-status error";
        status.textContent = `Couldn't find "${typed}" in ${p.stateNameFull}. Pick a suggestion from the list.`;
        return;
      }
      status.className = "county-status";
      status.textContent = `Looking up cities in ${match.name}…`;
      btn.disabled = true;

      const result = await fetchCountyMayors(match.qid);
      btn.disabled = false;

      if (!result.ok) {
        status.className = "county-status error";
        status.textContent =
          result.reason === "empty"
            ? `No cities with Wikidata mayor data found in ${match.name}.`
            : `Couldn't reach Wikidata — check your connection and try again.`;
        return;
      }

      spliceCounty(targetNode, match, result.cities);
      status.className = "county-status success";
      status.textContent = `Loaded ${result.cities.length} cities in ${match.name}.`;
      closePanel();
      zoom(targetNode);
    }
  }

  // ---------- search ----------
  const searchInput = document.getElementById("search");
  const searchResults = document.getElementById("search-results");
  let searchable = [];
  function addToSearchable(nodes) {
    nodes
      .filter((d) => !d.data.crossRef && (d.data.kind === "person" || d.data.isState || d.children))
      .forEach((d) => {
        searchable.push({
          d,
          hay: `${d.data.name} ${d.data.stateName || ""} ${d.data.state || ""} ${d.data.role || ""}`.toLowerCase(),
        });
      });
  }
  function removeFromSearchable(targetNode) {
    searchable = searchable.filter((s) => !isDescendantOf(s.d, targetNode));
  }
  addToSearchable(root.descendants());

  let activeIdx = -1;
  let hits = [];

  searchInput.addEventListener("input", () => {
    const q = searchInput.value.trim().toLowerCase();
    if (q.length < 2) return hideResults();
    hits = searchable.filter((s) => s.hay.includes(q)).slice(0, 12);
    activeIdx = -1;
    if (!hits.length) return hideResults();
    searchResults.innerHTML = hits
      .map(({ d }, i) => {
        const dot = d.data.kind === "person"
          ? `<span class="sr-dot" style="background:${PARTY_COLOR[d.data.party]}"></span>`
          : `<span class="sr-dot" style="border:1.5px solid var(--hairline-2)"></span>`;
        const role = d.data.kind === "person" ? d.data.role || "" : countLabel(d);
        return `<div class="sr-item" data-i="${i}">${dot}<span class="sr-name">${esc(d.data.name)}</span><span class="sr-role">${esc(role)}</span></div>`;
      })
      .join("");
    searchResults.hidden = false;
    searchResults.querySelectorAll(".sr-item").forEach((el) =>
      el.addEventListener("click", () => pickResult(+el.dataset.i))
    );
  });

  searchInput.addEventListener("keydown", (e) => {
    if (searchResults.hidden) return;
    if (e.key === "ArrowDown") { activeIdx = Math.min(activeIdx + 1, hits.length - 1); paintActive(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { activeIdx = Math.max(activeIdx - 1, 0); paintActive(); e.preventDefault(); }
    else if (e.key === "Enter" && activeIdx >= 0) pickResult(activeIdx);
    else if (e.key === "Enter" && hits.length) pickResult(0);
    else if (e.key === "Escape") hideResults();
  });

  function paintActive() {
    searchResults.querySelectorAll(".sr-item").forEach((el, i) =>
      el.classList.toggle("active", i === activeIdx)
    );
  }
  function pickResult(i) {
    const d = hits[i].d;
    hideResults();
    searchInput.value = "";
    searchInput.blur();
    if (d.data.kind === "person" || d.data.kind === "info") {
      openPanel(d.data);
      zoom(d);
    } else if (d.data.localGov) {
      openPanel(d.data);
      zoom(d);
    } else {
      closePanel();
      zoom(d);
    }
  }
  function hideResults() {
    searchResults.hidden = true;
    searchResults.innerHTML = "";
  }
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-wrap")) hideResults();
  });

  // ---------- keyboard ----------
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== searchInput) {
      e.preventDefault();
      searchInput.focus();
    } else if (e.key === "Escape" && document.activeElement === searchInput) {
      searchInput.blur();
      hideResults();
    } else if (e.key === "Escape") {
      if (!panel.hidden) closePanel();
      else if (focus.parent) zoom(focus.parent);
    }
  });

  // ---------- helpers ----------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function fmtDate(s) {
    if (/^\d{4}$/.test(s)) return s;
    const d = new Date(s + "T00:00:00");
    return isNaN(d) ? s : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }
  function age(birthday) {
    const b = new Date(birthday + "T00:00:00");
    const now = new Date();
    let a = now.getFullYear() - b.getFullYear();
    if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) a--;
    return a;
  }
  function ordinal(n) {
    const s = ["th", "st", "nd", "rd"], v = n % 100;
    return `${n}${s[(v - 20) % 10] || s[v] || s[0]} District`;
  }

  // ---------- boot ----------
  const countyDatalist = document.getElementById("county-datalist");
  if (countyDatalist) {
    countyDatalist.innerHTML = COUNTY_INDEX.map((c) => `<option value="${esc(c.label)}">`).join("");
  }

  asof.textContent = `Data as of ${fmtDate(DATA.asOf)} · congress-legislators (unitedstates.github.io)`;
  zoomTo(view);
  updateLabels(S / view[2]);
  renderCrumbs();
  renderInfobar();
})();
