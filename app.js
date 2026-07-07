/* US Politics Explorer — zoomable circle-packing map of the US government. */
(function () {
  "use strict";

  const DATA = window.GOV_DATA;
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

  // party tallies per node (descendant persons)
  root.eachAfter((d) => {
    const t = { D: 0, R: 0, I: 0, O: 0 };
    if (d.children) {
      d.children.forEach((c) => {
        for (const k in t) t[k] += c.partyTally[k];
      });
    } else if (d.data.kind === "person") {
      t[d.data.party] = 1;
    }
    d.partyTally = t;
  });

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

  // ---------- circles ----------
  // nodeLayer gets one shared transform per zoom frame instead of rewriting
  // transform/r on all 8,840+ circles every frame — cx/cy/r are static pack
  // coordinates set once below.
  const nodeLayer = svg.append("g");
  const node = nodeLayer
    .selectAll("circle")
    .data(root.descendants())
    .join("circle")
    .attr("cx", (d) => d.x)
    .attr("cy", (d) => d.y)
    .attr("r", (d) => Math.max(d.r, 0.1))
    .attr("vector-effect", "non-scaling-stroke")
    .attr("class", (d) => "n-" + (d.data.kind || "group"))
    .attr("fill", (d) => {
      if (d.data.kind === "person") return PARTY_COLOR[d.data.party] || PARTY_COLOR.O;
      if (d.data.kind === "info") return "rgba(255,255,255,0.03)";
      return d === root ? "none" : "rgba(255,255,255,0.035)";
    })
    .attr("stroke", (d) => {
      if (d.data.kind === "person") return "rgba(0,0,0,0.35)";
      if (d.data.kind === "info") return "rgba(255,255,255,0.22)";
      return d === root ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.13)";
    })
    .attr("stroke-dasharray", (d) => (d.data.kind === "info" ? "3 3" : null))
    .style("cursor", "pointer")
    .on("mouseover", function (event, d) {
      d3.select(this).attr("stroke", d.data.kind === "person" ? "#ffffff" : "rgba(255,255,255,0.5)");
      showTooltip(event, d);
    })
    .on("mousemove", (event, d) => showTooltip(event, d))
    .on("mouseout", function (event, d) {
      d3.select(this).attr("stroke", d.data.kind === "person" ? "rgba(0,0,0,0.35)"
        : d.data.kind === "info" ? "rgba(255,255,255,0.22)"
        : d === root ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.13)");
      hideTooltip();
    })
    .on("click", (event, d) => {
      event.stopPropagation();
      hideTooltip();
      if (d.data.kind === "person" || d.data.kind === "info") {
        openPanel(d.data);
        zoom(d.parent && projR(d) < 90 ? d : focus === d.parent ? focus : d.parent || root);
      } else if (d !== focus) {
        closePanel();
        zoom(d);
      } else if (d.parent) {
        zoom(d.parent);
      }
    });

  // ---------- labels ----------
  const label = svg
    .append("g")
    .attr("pointer-events", "none")
    .attr("text-anchor", "middle")
    .selectAll("text")
    .data(root.descendants())
    .join("text")
    .style("display", "none")
    .attr("fill", (d) => (d.data.kind === "person" ? "#0b0d10" : "#ffffff"))
    .attr("paint-order", "stroke")
    .attr("stroke", (d) => (d.data.kind === "person" ? "rgba(255,255,255,0.25)" : "rgba(13,15,19,0.65)"))
    .attr("stroke-width", (d) => (d.data.kind === "person" ? 0 : 3))
    .attr("font-weight", 600)
    .each(function (d) {
      const lines = wrap(d.data.name, d.data.kind === "person" ? 11 : 14);
      const el = d3.select(this);
      const n = lines.length + (d.children ? 1 : 0);
      lines.forEach((line, i) => {
        el.append("tspan")
          .attr("x", 0)
          .attr("dy", i === 0 ? `${-(n - 1) * 0.55}em` : "1.1em")
          .text(line);
      });
      if (d.children) {
        el.append("tspan")
          .attr("class", "count")
          .attr("x", 0)
          .attr("dy", "1.25em")
          .attr("font-weight", 400)
          .attr("fill", "#c3c5cc")
          .text(countLabel(d));
      }
    });

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
    if (p.url) links.push([p.url.includes("ballotpedia") ? "Ballotpedia profile" : "Official website", p.url]);
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
    return `
      <div class="p-body" style="padding-top:40px">
        <div class="p-name">${esc(p.name)}</div>
        ${p.description ? `<div class="p-desc" style="margin-top:4px">${esc(p.description)}</div>` : ""}
        ${links ? `<div class="p-links">${links}</div>` : ""}
      </div>`;
  }

  // ---------- search ----------
  const searchInput = document.getElementById("search");
  const searchResults = document.getElementById("search-results");
  const searchable = root
    .descendants()
    .filter((d) => !d.data.crossRef && (d.data.kind === "person" || d.data.isState || d.children))
    .map((d) => ({
      d,
      hay: `${d.data.name} ${d.data.stateName || ""} ${d.data.state || ""} ${d.data.role || ""}`.toLowerCase(),
    }));
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
  asof.textContent = `Data as of ${fmtDate(DATA.asOf)} · congress-legislators (unitedstates.github.io)`;
  zoomTo(view);
  updateLabels(S / view[2]);
  renderCrumbs();
  renderInfobar();
})();
