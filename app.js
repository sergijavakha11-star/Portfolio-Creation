/* აქციების დამატება — prototype logic. One selection state shared by the list, the
   "your stocks" row, the sheet and the Selected Items strip in the Sticky Bar. */
(function () {
  const LOGO = (t) => `assets/logos/${t.toLowerCase()}.png`;
  const HAS_LOGO = new Set(["MSFT", "GOOG", "AAPL", "AMZN", "TSLA", "SPY", "QQQ", "KO", "NVDA"]);

  // "სხვა აქციები" (values as in the Figma screen)
  const OTHERS = [
    ["MSFT", "Microsoft Corporation", "113,568.48 $", "0.54%", "up"],
    ["GOOG", "Alphabet, Inc.", "4,018.01 $", "2.25%", "down"],
    ["AAPL", "Apple, Inc.", "25.80 $", "0.08%", "up"],
    ["AMZN", "Amazon.com, Inc.", "1,115.27 $", "1.86%", "down"],
    ["TSLA", "Tesla, Inc.", "195.10 $", "3.63%", "down"],
    ["SPY", "SPDR S&P 500 ETF TRUST", "0.1939 $", "3.11%", "down"],
    ["QQQ", "Invesco QQQ Trust, Series 1", "0.2981 $", "0.11%", "up"],
    ["KO", "Coca-Cola Co.", "47.32 $", "0.16%", "down"],
    ["NVDA", "Nvidia Corporation", "17.79 $", "3.89%", "down"]
  ];
  // "შენი აქციები" — 12 holdings
  const OWNED = [
    ["SPY", "0.50 აქცია", "51.12 $", "+0.12$ (0.01%)", "up"],
    ["QQQ", "0.50 აქცია", "72.93 $", "+0.25$ (0.03%)", "up"],
    ["TSLA", "2.00 აქცია", "389.12 $", "-7.10$ (1.79%)", "down"],
    ["MSFT", "0.42 აქცია", "2,410.20 $", "+12.95$ (0.54%)", "up"],
    ["AAPL", "1.10 აქცია", "171.40 $", "+0.14$ (0.08%)", "up"],
    ["KO", "1.20 აქცია", "56.78 $", "-0.09$ (0.16%)", "down"],
    ["NVDA", "1.50 აქცია", "26.69 $", "-1.04$ (3.89%)", "down"],
    ["VOO", "0.05 აქცია", "23.56 $", "+0.09$ (0.39%)", "up"],
    ["META", "0.03 აქცია", "19.17 $", "+0.42$ (2.23%)", "up"],
    ["AMD", "0.10 აქცია", "15.84 $", "-0.18$ (1.12%)", "down"],
    ["NFLX", "0.01 აქცია", "11.04 $", "+0.09$ (0.84%)", "up"],
    ["JPM", "0.08 აქცია", "19.65 $", "+0.04$ (0.21%)", "up"]
  ];
  const OWNED_SET = new Set(OWNED.map((o) => o[0]));

  const sel = new Set();          // committed selection (tickers)
  let draft = null;               // sheet-only working copy

  const $ = (id) => document.getElementById(id);
  const media = (t, size) => HAS_LOGO.has(t)
    ? `<span class="bog-media-circle" data-size="${size}"><img src="${LOGO(t)}" alt=""></span>`
    : `<span class="bog-avatar" data-size="${size}">${t.slice(0, 2)}</span>`;
  const chg = (txt, dir) => `<span class="chg" data-dir="${dir}"><span class="bog-icon" data-icon="price-${dir}-12"></span>${txt}</span>`;
  const row = (t, sub, val, change, dir, checked) =>
    `<label class="bog-list-item stock-row" data-t="${t}">` +
      `<input type="checkbox" class="bog-checkbox__input" value="${t}"${checked ? " checked" : ""} aria-label="${t}">` +
      media(t, 40) +
      `<span class="bog-list-item__content"><span class="bog-list-item__label">${t}</span><span class="bog-list-item__subtitle">${sub}</span></span>` +
      `<span class="bog-list-item__end"><span class="bog-list-item__value">${val}</span><span class="bog-list-item__value-sub">${chg(change, dir)}</span></span>` +
    `</label>`;
  const trayItem = (t) =>
    `<div class="bog-action-item" data-value="${t}"><button type="button" class="bog-action-item__main">` +
      `<span class="bog-action-item__circle">${media(t, 40)}</span><span class="bog-action-item__label">${t}</span></button>` +
      `<button type="button" class="bog-action-item__remove" aria-label="${t}-ის ამოღება"></button></div>`;

  // ---- catalog ------------------------------------------------------------
  // cat: tech | cons | etf | fin · type: stock | etf · size: small | mid | large · pop: popularity rank
  const NAMES = { VOO: "Vanguard S&P 500 ETF", META: "Meta Platforms, Inc.", AMD: "Advanced Micro Devices", NFLX: "Netflix, Inc.", JPM: "JPMorgan Chase & Co." };
  const META_ = {
    MSFT: ["tech", "stock", "large", 1, 2], GOOG: ["tech", "stock", "large", 1, 4], AAPL: ["tech", "stock", "large", 1, 1], NVDA: ["tech", "stock", "large", 1, 3],
    AMZN: ["cons", "stock", "large", 0, 5], TSLA: ["cons", "stock", "large", 0, 6], KO: ["cons", "stock", "mid", 1, 9],
    SPY: ["etf", "etf", "large", 1, 7], QQQ: ["etf", "etf", "large", 1, 8],
    VOO: ["etf", "etf", "large", 1, 10], META: ["tech", "stock", "large", 1, 11], AMD: ["tech", "stock", "mid", 0, 12], NFLX: ["tech", "stock", "mid", 0, 13], JPM: ["fin", "stock", "large", 1, 14]
  };
  const num = (s) => parseFloat(String(s).replace(/[^0-9.\-]/g, "")) || 0;
  const othersSet = new Set(OTHERS.map((o) => o[0]));
  const ownedBy = Object.fromEntries(OWNED.map((o) => [o[0], o]));
  const CAT = [
    ...OTHERS.map((o) => ({ t: o[0], name: o[1], val: o[2], chg: o[3], dir: o[4], listed: true })),
    ...OWNED.filter((o) => !othersSet.has(o[0])).map((o) => ({ t: o[0], name: NAMES[o[0]] || "", val: o[2], chg: o[3].replace(/^.*\(|\)$/g, ""), dir: o[4], listed: false }))
  ].map((s) => { const m = META_[s.t]; return Object.assign(s, { cat: m[0], type: m[1], size: m[2], div: !!m[3], pop: m[4], pct: (s.dir === "down" ? -1 : 1) * num(s.chg), price: num(s.val) }); });
  const BY = Object.fromEntries(CAT.map((s) => [s.t, s]));
  const CATS = { tech: "ტექნოლოგიები", cons: "სამომხმარებლო", etf: "ETF", fin: "ფინანსები" };
  const CHIPS = [["all", "ყველა"], ["movers", "დღის ლიდერები"], ["popular", "პოპულარული"], ["tech", "ტექნოლოგიები"], ["cons", "სამომხმარებლო"], ["etf", "ETF"], ["fin", "ფინანსები"]];
  const SORTS = [["pop", "პოპულარობით"], ["gain", "დღის ზრდით"], ["loss", "დღის კლებით"], ["price", "ფასით"]];
  const SIZES = [["small", "მცირე"], ["mid", "საშუალო"], ["large", "დიდი"]];
  const CHANGES = [["up", "იზრდება"], ["down", "იკლებს"], ["big", "±3%-ზე მეტი"]];
  const st = { chips: new Set(), /* empty = ყველა */ sort: "pop", size: new Set(), change: new Set(), div: false, q: "", focus: false };
  let recent = ["TSLA", "AAPL", "SPY"];
  const TRENDING = ["NVDA", "MSFT", "AMZN"];

  const stockRow = (s, ownedNote) => row(s.t, ownedNote && ownedBy[s.t] ? `შენ ფლობ · ${ownedBy[s.t][1]}` : s.name, s.val, s.chg, s.dir, sel.has(s.t));
  const group = (label, list, opts = {}) => list.length ? `<div class="bog-list-group" data-anim>` +
    `<div class="bog-list-group__header"><span>${label}</span>${opts.right || ""}</div>` +
    `<div class="bog-list">${list.map((s) => stockRow(s, opts.owned)).join("")}</div></div>` : "";
  const filterCount = () => st.size.size + st.change.size + (st.div ? 1 : 0) + (st.sort !== "pop" ? 1 : 0);
  function passes(s, f = st) {
    if (f.size.size && !f.size.has(s.size)) return false;
    if (f.div && !s.div) return false;
    if (f.change.size) {
      const ok = (f.change.has("up") && s.pct > 0) || (f.change.has("down") && s.pct < 0) || (f.change.has("big") && Math.abs(s.pct) >= 3);
      if (!ok) return false;
    }
    return true;
  }
  const sorter = (k) => k === "gain" ? (a, b) => b.pct - a.pct : k === "loss" ? (a, b) => a.pct - b.pct : k === "price" ? (a, b) => b.price - a.price : (a, b) => a.pop - b.pop;
  // chips are multi-select: categories add up (tech + ETF), "popular" / "movers" narrow them
  const chipCats = () => [...st.chips].filter((k) => CATS[k]);
  function baseList() { // what the chips show before the sheet filters
    const cats = chipCats();
    let list = cats.length ? CAT.filter((s) => cats.includes(s.cat)) : CAT.filter((s) => s.listed);
    if (st.chips.has("popular")) list = list.filter((s) => s.pop <= 8);
    return list;
  }

  // number roll (bog-ui odometer) for a <span class="n"> inside a label
  function roll(span, n) {
    const from = span.textContent, to = String(n);
    if (from === to) return;
    span.textContent = to;
    if (window.BOG && BOG.odometer && from !== "") BOG.odometer(span, from, to);
  }
  // label with a rolling count: "text · <n> tail"
  function countLabel(el, head, n, tail = "") {
    let span = el.querySelector(":scope > .n");
    if (!span || el.dataset.head !== head) {
      el.dataset.head = head;
      el.innerHTML = `${head} · <span class="n">${n}</span>${tail ? " " + tail : ""}`;
      return true;
    }
    roll(span, n);
    return false;
  }
  // old groups step out quickly before the new ones come in
  function swap(then, ms = 140) {
    const groups = $("others-list").querySelectorAll(".bog-list-group");
    if (!groups.length || matchMedia("(prefers-reduced-motion: reduce)").matches) return then();
    groups.forEach((g) => g.classList.add("leaving"));
    setTimeout(then, ms);
  }
  // List item skeleton (bog-ui data-state="skeleton") while results "load"
  function skeleton(rows = 4) {
    $("others-list").innerHTML = `<div class="bog-list-group"><div class="bog-list">` +
      `<div class="bog-list-item" data-state="skeleton"><span class="bog-list-item__subtitle"></span></div>`.repeat(rows) + `</div></div>`;
    $("empty-hint").hidden = true;
  }

  function render() {
    const list = $("others-list"), title = $("list-title");
    const searching = st.q.length > 0, emptyFocus = st.focus && !searching;
    body.classList.toggle("searching", searching || emptyFocus);
    let html = "", count = 0;
    if (emptyFocus) {
      title.textContent = "";
      const r = recent.map((t) => BY[t]);
      html = group("ბოლოს ნანახი", r, { right: '<button type="button" class="bog-btn" data-type="text-primary" id="recent-clear">გასუფთავება</button>' }) +
             group("ტრენდული", TRENDING.map((t) => BY[t]));
      count = 1;
    } else if (searching) {
      title.textContent = "შედეგები";
      const hits = CAT.filter((s) => (s.t + " " + s.name).toLowerCase().includes(st.q)).sort(sorter("pop"));
      count = hits.length;
      html = group("აქციები", hits.filter((s) => s.type === "stock"), { owned: true }) + group("ETF", hits.filter((s) => s.type === "etf"), { owned: true });
    } else {
      const base = baseList().filter((s) => passes(s));
      count = base.length;
      if (filterCount() > 0) {
        const parts = [...[...st.size].map((k) => SIZES.find((x) => x[0] === k)[1]), ...[...st.change].map((k) => CHANGES.find((x) => x[0] === k)[1]), ...(st.div ? ["დივიდენდიანი"] : []), SORTS.find((x) => x[0] === st.sort)[1].toLowerCase()];
        countLabel(title, "შედეგები", count);
        html = group(parts.join(" · "), base.sort(sorter(st.sort)), { owned: true });
      } else if (st.chips.size) {
        const cats = chipCats(), one = st.chips.size === 1;
        const label = (k) => CHIPS.find((c) => c[0] === k)[1];
        if (one) title.textContent = label([...st.chips][0]); else countLabel(title, "შედეგები", count);
        if (st.chips.has("movers")) {
          html = group("ზრდა · დღეს", base.filter((s) => s.pct > 0).sort(sorter("gain")), { owned: true }) +
                 group("კლება · დღეს", base.filter((s) => s.pct < 0).sort(sorter("loss")), { owned: true });
        } else if (cats.length > 1) {
          html = cats.map((c) => group(CATS[c], base.filter((s) => s.cat === c).sort(sorter("pop")), { owned: true })).join("");
        } else if (one && st.chips.has("popular")) {
          html = group("ყველაზე ხშირად ყიდულობენ", base.sort(sorter("pop")));
        } else {
          html = group(`${count} აქცია`, base.sort(sorter("pop")), { owned: true });
        }
      } else {
        title.textContent = "სხვა აქციები";
        html = ["tech", "cons", "etf"].map((c) => group(CATS[c], base.filter((s) => s.cat === c).sort(sorter("pop")))).join("");
      }
    }
    list.innerHTML = html;
    $("empty-hint").hidden = count > 0;
    if (window.BOG && BOG.checkboxSync) BOG.checkboxSync();
    const rc = $("recent-clear");
    if (rc) rc.addEventListener("click", (e) => { e.preventDefault(); const g = rc.closest(".bog-list-group"); g.classList.add("leaving"); setTimeout(() => { recent = []; render(); }, 220); });
  }

  // chips
  const chipsEl = $("chips");
  chipsEl.innerHTML = CHIPS.map(([k, l]) => `<button type="button" class="bog-chip" data-type="filter" data-k="${k}" aria-pressed="${k === "all" ? !st.chips.size : st.chips.has(k)}">${l}</button>`).join("");
  chipsEl.addEventListener("click", (e) => {
    const c = e.target.closest(".bog-chip"); if (!c) return;
    e.preventDefault(); // app owns aria-pressed; bog-ui still plays the chip on/off motion
    const k = c.dataset.k;
    if (k === "all") { if (!st.chips.size) return; st.chips.clear(); }      // ყველა clears the rest
    else if (st.chips.has(k)) st.chips.delete(k);                            // none left → back to ყველა
    else st.chips.add(k);
    chipsEl.querySelectorAll(".bog-chip").forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.k === "all" ? !st.chips.size : st.chips.has(b.dataset.k))));
    setTimeout(() => c.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" }), 260);
    swap(render);
  }, true);
  $("owned-avatars").innerHTML = ["SPY", "QQQ", "TSLA"].map((t) =>
    `<span class="bog-avatar" data-size="32"><img src="${LOGO(t)}" alt=""></span>`).join("") +
    `<span class="bog-avatar-btn" data-size="32" data-type="overflow">+9</span>`;

  // ---- selection core -------------------------------------------------------
  const tray = $("tray");
  function setSelected(t, on, delay) {
    if (on === sel.has(t)) return;
    if (on) sel.add(t); else sel.delete(t);
    // list checkboxes (a ticker can be in "others" and owned at once)
    document.querySelectorAll(`#others-list input[value="${t}"]`).forEach((b) => { b.checked = on; });
    const go = () => {
      if (on) BOG.selectionAdd(tray, trayItem(t));
      else { const it = tray.querySelector(`[data-value="${t}"]:not([data-leaving])`); if (it) BOG.selectionRemove(it); }
    };
    delay ? setTimeout(go, delay) : go();
  }
  function refresh() {
    // owned row: checked / indeterminate / unchecked + subtitle
    const n = OWNED.filter((o) => sel.has(o[0])).length;
    const all = $("owned-all");
    all.checked = n === OWNED.length;
    all.indeterminate = n > 0 && n < OWNED.length;
    if (window.BOG && BOG.checkboxSync) BOG.checkboxSync();
    const sub = $("owned-sub");
    const txt = n === 0 ? "12 აქცია · 1,164.31 $" : `${n} არჩეული · 12-დან`;
    if (sub.textContent !== txt) { sub.style.opacity = 0; setTimeout(() => { sub.textContent = txt; sub.style.opacity = 1; }, 150); }
    // CTA
    const cta = $("cta"), before = cta.textContent;
    if (sel.size) countLabel(cta, "პორტფელში დამატება", sel.size);
    else { cta.textContent = "პორტფელში დამატება"; delete cta.dataset.head; }
    if (cta.textContent !== before) { cta.classList.remove("bump"); void cta.offsetWidth; cta.classList.add("bump"); }
  }

  // tap a stock row
  $("others-list").addEventListener("change", (e) => {
    if (!e.target.matches(".bog-checkbox__input")) return;
    setSelected(e.target.value, e.target.checked); refresh();
  });
  // minus on a tray item → unselect (bog-ui plays the removal itself)
  tray.addEventListener("actionitemremove", (e) => {
    const t = e.target.dataset.value; sel.delete(t);
    document.querySelectorAll(`#others-list input[value="${t}"]`).forEach((b) => { b.checked = false; });
    setTimeout(refresh);
  });
  // owned row checkbox → all / none of my stocks
  $("owned-all").addEventListener("change", () => {
    const allOn = OWNED.every((o) => sel.has(o[0]));
    let i = 0;
    OWNED.forEach((o) => { if (sel.has(o[0]) === allOn) setSelected(o[0], !allOn, (i++) * 45); });
    refresh();
  });

  // ---- sheet: შენი აქციები --------------------------------------------------
  const sheetCount = () => OWNED.filter((o) => draft.has(o[0])).length;
  function renderSheetBar() {
    const n = sheetCount();
    $("sheet-apply").textContent = n ? `არჩევა · ${n}` : "არჩევა";
    $("sheet-all").textContent = n === OWNED.length ? "მონიშვნის მოხსნა" : "ყველას მონიშვნა";
  }
  document.querySelector(".owned-row__open").addEventListener("click", () => {
    draft = new Set(sel);
    $("sheet-list").innerHTML = OWNED.map((o) => row(o[0], o[1], o[2], o[3], o[4], draft.has(o[0]))).join("");
    if (window.BOG && BOG.checkboxSync) BOG.checkboxSync();
    renderSheetBar();
  }, true);
  $("sheet-list").addEventListener("change", (e) => {
    if (!e.target.matches(".bog-checkbox__input")) return;
    e.target.checked ? draft.add(e.target.value) : draft.delete(e.target.value);
    renderSheetBar();
  });
  $("sheet-all").addEventListener("click", () => {
    const on = sheetCount() !== OWNED.length;
    $("sheet-list").querySelectorAll(".stock-row:not([data-hidden]) .bog-checkbox__input").forEach((b, i) => {
      setTimeout(() => { if (b.checked !== on) { b.checked = on; b.dispatchEvent(new Event("change", { bubbles: true })); } }, i * 35);
    });
  });
  $("sheet-apply").addEventListener("click", () => {
    const changes = OWNED.map((o) => o[0]).filter((t) => draft.has(t) !== sel.has(t));
    BOG.closeSheet($("owned-sheet"));
    // apply after the sheet has slid away, so the strip motion is visible
    setTimeout(() => { changes.forEach((t, i) => setSelected(t, draft.has(t), i * 60)); refresh(); }, 260);
  });

  // ---- search ----------------------------------------------------------------
  const input = $("search-input"), body = $("body");
  function filter() { st.q = input.value.trim().toLowerCase(); render(); }
  // focus with an empty field → recently viewed + trending; leaving an empty field → back to the list
  input.addEventListener("focus", () => { st.focus = true; phone.setAttribute("data-search-focus", ""); render(); });
  input.addEventListener("blur", () => { setTimeout(() => { if (document.activeElement === input) return; st.focus = false; phone.removeAttribute("data-search-focus"); if (!input.value) render(); }, 120); });
  // picking a stock from search results remembers it in "recently viewed"
  $("others-list").addEventListener("change", (e) => {
    if (!(st.q || st.focus) || !e.target.matches(".bog-checkbox__input") || !e.target.checked) return;
    const t = e.target.value; recent = [t, ...recent.filter((x) => x !== t)].slice(0, 5);
  });

  // ---- sort & filter sheet ---------------------------------------------------
  let fd = null; // draft
  const chipBtns = (items, set) => items.map(([k, l]) => `<button type="button" class="bog-chip" data-type="filter" data-k="${k}" aria-pressed="${set.has(k)}">${l}</button>`).join("");
  function drawFilterSheet() {
    $("sort-options").innerHTML = SORTS.map(([k, l]) => `<label class="bog-radio" data-align="right"><span class="bog-radio__row"><input type="radio" class="bog-radio__input" name="sort" value="${k}"${fd.sort === k ? " checked" : ""}><span class="bog-radio__text"><span class="bog-radio__title">${l}</span></span></span></label>`).join("");
    $("size-chips").innerHTML = chipBtns(SIZES, fd.size);
    $("change-chips").innerHTML = chipBtns(CHANGES, fd.change);
    $("div-only").checked = fd.div;
    updateApply();
  }
  function updateApply() {
    const n = baseList().filter((s) => passes(s, fd)).length, b = $("filter-apply");
    if (n) countLabel(b, "ჩვენება", n, "აქცია"); else { b.textContent = "შედეგი არ არის"; delete b.dataset.head; }
    b.disabled = n === 0;
  }
  $("filter-btn").addEventListener("click", () => {
    fd = { sort: st.sort, size: new Set(st.size), change: new Set(st.change), div: st.div };
    drawFilterSheet();
  }, true);
  $("sort-options").addEventListener("change", (e) => { fd.sort = e.target.value; updateApply(); });
  for (const [id, key] of [["size-chips", "size"], ["change-chips", "change"]]) {
    $(id).addEventListener("click", (e) => {
      const c = e.target.closest(".bog-chip"); if (!c) return;
      e.preventDefault();
      const k = c.dataset.k, on = !fd[key].has(k);
      on ? fd[key].add(k) : fd[key].delete(k);
      c.setAttribute("aria-pressed", String(on));
      updateApply();
    }, true);
  }
  $("div-only").addEventListener("change", (e) => { fd.div = e.target.checked; updateApply(); });
  $("filter-clear").addEventListener("click", () => { fd = { sort: "pop", size: new Set(), change: new Set(), div: false }; drawFilterSheet(); });
  $("filter-apply").addEventListener("click", () => {
    Object.assign(st, { sort: fd.sort, size: fd.size, change: fd.change, div: fd.div });
    BOG.closeSheet($("filter-sheet"));
    const n = filterCount(), cnt = $("filter-count"), btn = $("filter-btn");
    const wasShown = cnt.style.display !== "none";
    setTimeout(() => {   // after the sheet has dropped away
      btn.setAttribute("aria-pressed", String(n > 0));
      cnt.style.display = n ? "" : "none";
      if (n && !wasShown) { cnt.textContent = n; cnt.removeAttribute("data-pop"); void cnt.offsetWidth; cnt.setAttribute("data-pop", ""); }
      else if (n) roll(cnt, n);
    }, 250);
    swap(() => { skeleton(); setTimeout(render, 420); }, 200);
  });
  function wireSearch(box, inp, run) {
    inp.addEventListener("input", run);
    box.querySelector(".bog-search__cancel").addEventListener("click", () => { inp.value = ""; run(); inp.blur(); });
    box.querySelector(".bog-search__clear").addEventListener("click", () => setTimeout(run));
  }
  wireSearch($("search"), input, filter);
  body.addEventListener("scroll", () => $("search-bar").toggleAttribute("data-stuck", body.scrollTop > 4), { passive: true });

  // same search inside the "your stocks" sheet
  const sIn = $("sheet-search-input");
  const OWNED_NAMES = Object.fromEntries(OWNED.map((o) => [o[0], (o[0] + " " + ((OTHERS.find((x) => x[0] === o[0]) || [])[1] || NAMES[o[0]] || "")).toLowerCase()]));
  function sheetFilter() {
    const q = sIn.value.trim().toLowerCase();
    let shown = 0;
    $("sheet-list").querySelectorAll(".stock-row").forEach((r) => {
      const hit = !q || OWNED_NAMES[r.dataset.t].includes(q);
      const was = r.hasAttribute("data-hidden");
      r.toggleAttribute("data-hidden", !hit); if (hit) shown++;
      if (hit && was) { r.removeAttribute("data-shown"); void r.offsetWidth; r.setAttribute("data-shown", ""); }
    });
    $("sheet-empty").hidden = shown > 0;
  }
  wireSearch($("sheet-search"), sIn, sheetFilter);
  document.querySelector(".owned-row__open").addEventListener("click", () => { sIn.value = ""; $("sheet-empty").hidden = true; });
  const sheetScroll = document.querySelector("#owned-sheet .bog-sheet__content");
  sheetScroll.addEventListener("scroll", () => $("sheet-search-bar").toggleAttribute("data-stuck", sheetScroll.scrollTop > 4), { passive: true });

  // ---- phone keyboard mock (desktop preview; a real phone shows its own keyboard) ----
  const kb = $("kb"), phone = $("phone");
  // mock keyboard whenever the phone frame is shown (desktop preview); on a phone-sized screen the real
  // keyboard opens instead. ?kb=1 forces the mock, ?kb=0 turns it off.
  const kbParam = new URLSearchParams(location.search).get("kb");
  const fine = kbParam ? kbParam === "1" : !matchMedia("(max-width: 500px), (max-height: 760px) and (max-width: 900px)").matches;
  const ROWS = { abc: ["qwertyuiop", "asdfghjkl", "zxcvbnm"], num: ["1234567890", "-/:;()$&@\"", ".,?!'"] };
  let layout = "abc", shift = false, target = null;
  function drawKb() {
    const r = ROWS[layout];
    const k = (c) => `<button class="kb__key" data-ch="${c}">${shift ? c.toUpperCase() : c}</button>`;
    kb.innerHTML =
      `<div class="kb__row">${[...r[0]].map(k).join("")}</div>` +
      `<div class="kb__row">${[...r[1]].map(k).join("")}</div>` +
      `<div class="kb__row"><button class="kb__key" data-wide data-act="shift"${shift ? " data-shift-on" : ""}>⇧</button>${[...r[2]].map(k).join("")}<button class="kb__key" data-wide data-act="del">⌫</button></div>` +
      `<div class="kb__row"><button class="kb__key" data-wide data-act="layout">${layout === "abc" ? "123" : "ABC"}</button><button class="kb__key" data-space data-act="space">space</button><button class="kb__key" data-go data-act="go">search</button></div>` +
      `<div class="kb__bottom"></div>`;
  }
  function typeInto(fn) {
    if (!target) return;
    const s = target.selectionStart ?? target.value.length, e = target.selectionEnd ?? s;
    const [v, caret] = fn(target.value, s, e);
    target.value = v; target.setSelectionRange(caret, caret);
    target.dispatchEvent(new Event("input", { bubbles: true }));
  }
  kb.addEventListener("pointerdown", (e) => {
    const key = e.target.closest(".kb__key"); e.preventDefault(); // keep the field focused
    if (!key) return;
    const act = key.dataset.act;
    if (key.dataset.ch) { const c = shift ? key.dataset.ch.toUpperCase() : key.dataset.ch; typeInto((v, s, en) => [v.slice(0, s) + c + v.slice(en), s + 1]); if (shift) { shift = false; drawKb(); } }
    else if (act === "space") typeInto((v, s, en) => [v.slice(0, s) + " " + v.slice(en), s + 1]);
    else if (act === "del") typeInto((v, s, en) => s !== en ? [v.slice(0, s) + v.slice(en), s] : [v.slice(0, Math.max(0, s - 1)) + v.slice(s), Math.max(0, s - 1)]);
    else if (act === "shift") { shift = !shift; drawKb(); }
    else if (act === "layout") { layout = layout === "abc" ? "num" : "abc"; drawKb(); }
    else if (act === "go") target.blur();
  });
  function showKb(on) {
    phone.toggleAttribute("data-kb", on);
    phone.style.setProperty("--bog-keyboard", on ? kb.offsetHeight + "px" : "0px");
  }
  if (fine) {
    drawKb();
    document.querySelectorAll(".bog-search__input").forEach((inp) => {
      inp.addEventListener("focus", () => { target = inp; showKb(true); });
      inp.addEventListener("blur", () => { setTimeout(() => { if (document.activeElement !== inp) { target = null; showKb(false); } }, 0); });
    });
  } else kb.remove();

  // ---- CTA -------------------------------------------------------------------
  $("cta").addEventListener("click", () => {
    if (!sel.size) {
      BOG.toast({ status: "warning", text: "აირჩიე მინიმუმ ერთი აქცია", host: $("phone"), timeout: 3000 });
      return;
    }
    const mine = [...sel].filter((t) => OWNED_SET.has(t)).length, cta = $("cta");
    cta.setAttribute("data-state", "loading");
    setTimeout(() => cta.removeAttribute("data-state"), 900);
    setTimeout(() => BOG.toast({ status: "positive", title: `${sel.size} აქცია პორტფელში`, text: mine ? `მათ შორის ${mine} შენი აქცია` : "ყველა ახალი აქციაა", host: $("phone"), timeout: 3500 }), 900);
  });

  render();
  refresh();
})();
