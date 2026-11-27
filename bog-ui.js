/* BOG UI — small behaviors the CSS can't do on its own.
   <script src="PATH/TO/bog-ui/bog-ui.js" defer></script> */
(function () {
  // Text Input: state detection relies on :placeholder-shown, so every input needs a placeholder.
  function ensurePlaceholders(root) {
    root.querySelectorAll(".bog-field__input:not([placeholder])").forEach(function (input) {
      input.setAttribute("placeholder", " ");
    });
  }
  ensurePlaceholders(document);
  document.addEventListener("focusin", function (e) {
    if (e.target.matches && e.target.matches(".bog-field__input")) ensurePlaceholders(e.target.parentNode);
  });

  // Text Input: keep focus in the input when the clear button is pressed
  document.addEventListener("mousedown", function (e) {
    if (e.target.closest(".bog-field__clear")) e.preventDefault();
  });

  // Text Input: clear the value
  document.addEventListener("click", function (e) {
    var clear = e.target.closest(".bog-field__clear");
    if (!clear) return;
    e.preventDefault();
    var input = clear.closest(".bog-field").querySelector(".bog-field__input");
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
  });

  // Account Picker: currency chips are single-select within their group
  document.addEventListener("click", function (e) {
    var chip = e.target.closest(".bog-currency-chip");
    if (!chip || chip.disabled) return;
    var group = chip.closest(".bog-picker__chips");
    if (group) group.querySelectorAll(".bog-currency-chip").forEach(function (c) { c.setAttribute("aria-pressed", "false"); });
    chip.setAttribute("aria-pressed", "true");
  });

  // Account Picker: pickers inside a .bog-picker-group are single-select.
  // Pickers with a .bog-picker__expand (currency chips) expand on tap and become selected;
  // tapping an expanded one collapses it. Opening one collapses the others in the group.
  function selectPicker(box) {
    var picker = box.closest(".bog-picker");
    if (picker.matches('[data-state="skeleton"]')) return;
    var group = picker.closest(".bog-picker-group");
    var expandable = !!picker.querySelector(".bog-picker__expand");
    var willExpand = expandable && !picker.hasAttribute("data-expanded");
    if (group) {
      group.querySelectorAll(".bog-picker").forEach(function (p) {
        if (p === picker) return;
        p.removeAttribute("data-selected");
        setExpanded(p, false);
      });
    }
    if (group || expandable) picker.setAttribute("data-selected", "");
    if (expandable) setExpanded(picker, willExpand);
  }
  function setExpanded(picker, on) {
    if (!picker.querySelector(".bog-picker__expand")) return;
    picker.toggleAttribute("data-expanded", on);
    var box = picker.querySelector(".bog-picker__box");
    if (box) box.setAttribute("aria-expanded", on ? "true" : "false");
  }
  document.querySelectorAll(".bog-picker").forEach(function (p) {
    if (p.querySelector(".bog-picker__expand")) setExpanded(p, p.hasAttribute("data-expanded"));
  });
  document.addEventListener("click", function (e) {
    var box = e.target.closest(".bog-picker__box");
    if (box && !e.target.closest(".bog-currency-chip")) selectPicker(box);
  });
  document.addEventListener("keydown", function (e) {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches(".bog-picker__box")) {
      e.preventDefault();
      // Same as a tap: selects the card, and in a sheet opened by Account Select also fills the field
      e.target.click();
    }
  });
})();

/* ---- Bottom Sheet + Select ------------------------------------------------ */
(function () {
  var openStack = [];

  function resolve(sheet) { return typeof sheet === "string" ? document.getElementById(sheet) : sheet; }

  // Every sheet gets an X (close) button on the right of its header by default.
  // Skipped when the header already has a [data-sheet-close] button, or with data-close="false".
  function ensureClose(sheet) {
    if (!sheet || sheet.getAttribute("data-close") === "false") return;
    var nav = sheet.querySelector(".bog-sheet__nav");
    if (!nav || nav.querySelector("[data-sheet-close]")) return;
    nav.insertAdjacentHTML("beforeend",
      '<button type="button" class="bog-icon-btn bog-sheet__close" data-type="neutral" aria-label="Close" data-sheet-close>' +
      '<span class="bog-icon" data-icon="close"></span></button>');
  }
  document.querySelectorAll(".bog-sheet").forEach(ensureClose);

  // Open motion — Chat Motion Guidelines › Action Sheet (2:4924): the panel rises from below the screen
  // (788px, or its own height if taller) to 20px past its spot in 300ms, then settles back in 250ms.
  // Closing keeps the slide-down transition in bottom-sheet.css.
  function enter(sheet) {
    var panel = sheet.querySelector(".bog-sheet__panel");
    var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!panel || !panel.animate || still) return;
    sheet.setAttribute("data-entering", "");   // the CSS slide-up transition is off meanwhile
    var a = panel.animate([
      { translate: "0 max(100%, 788px)", easing: "cubic-bezier(0.33, 0, 0.25, 1)" },
      { translate: "0 -20px", offset: 300 / 550, easing: "cubic-bezier(0.17, 0, 0.25, 1)" },
      { translate: "0 0" }
    ], { duration: 550 });
    sheet._enter = a;
    function end() {
      if (sheet._enter !== a) return;
      sheet._enter = null;
      sheet.removeAttribute("data-entering");
    }
    a.finished.then(end, end);
  }

  function openSheet(sheet, opener) {
    sheet = resolve(sheet);
    if (!sheet || sheet.hasAttribute("data-open")) return;
    stopLeaving(sheet);   // reopened while closing
    ensureClose(sheet);
    sheet._opener = opener || document.activeElement;
    sheet.hidden = false;
    sheet.getBoundingClientRect(); // start the slide-up from the closed position
    sheet.setAttribute("data-open", "");
    enter(sheet);
    openStack.push(sheet);
    document.documentElement.classList.add("bog-sheet-locked"); // freeze the page behind the sheet
    var panel = sheet.querySelector(".bog-sheet__panel");
    if (panel) {
      if (!panel.hasAttribute("tabindex")) panel.setAttribute("tabindex", "-1");
      var target = panel.querySelector('[aria-selected="true"]') || panel;
      setTimeout(function () {
        // Don't take focus from a text field: on phones that would close the keyboard
        var a = document.activeElement;
        if (a && a.matches && a.matches("input:not([type=checkbox]):not([type=radio]), textarea, [contenteditable]")) return;
        target.focus({ preventScroll: true });
      }, 50);
    }
  }

  // Close motion (pairs with the open motion above): the sheet drops its own height + 24px in 250ms,
  // accelerating — cubic-bezier(0.75, 0, 0.67, 1), the open curve mirrored — while the overlay fades out
  // in 200ms (linear). After a drag it continues from where the finger let go, over the remaining
  // distance (never under 150ms). Returns false when it can't animate (reduced motion, old browsers).
  function leave(sheet, panel, from, overlay) {
    var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!panel || !panel.animate || still) return false;
    sheet.setAttribute("data-leaving", "");   // CSS transitions off; the panel stays where it is meanwhile
    var dist = panel.getBoundingClientRect().height + 24;
    var ms = Math.max(150, 250 * Math.max(0, dist - from) / dist);
    var list = [
      panel.animate({ translate: ["0 " + from + "px", "0 " + dist + "px"] },
        { duration: ms, easing: "cubic-bezier(0.75, 0, 0.67, 1)", fill: "forwards" }),
      sheet.animate({ opacity: [overlay, 0] },
        { duration: ms * 0.8, easing: "linear", fill: "forwards", pseudoElement: "::before" })
    ];
    sheet._leave = list;
    Promise.all(list.map(function (x) { return x.finished; })).then(function () {
      if (sheet._leave !== list) return;
      sheet._leave = null;
      sheet.hidden = true;
      sheet.removeAttribute("data-leaving");
      list.forEach(function (x) { x.cancel(); });
    }, function () {});
    return true;
  }
  function stopLeaving(sheet) {
    if (!sheet._leave) return;
    var list = sheet._leave;
    sheet._leave = null;
    list.forEach(function (x) { x.cancel(); });
    sheet.removeAttribute("data-leaving");
  }

  function closeSheet(sheet) {
    sheet = resolve(sheet) || openStack[openStack.length - 1];
    if (!sheet || !sheet.hasAttribute("data-open")) return;
    var panel = sheet.querySelector(".bog-sheet__panel");
    // Where the sheet is right now: dragged down, or still rising from the open motion
    var from = parseFloat(sheet.style.getPropertyValue("--drag")) || 0;
    if (sheet._enter && panel) {
      from = parseFloat((getComputedStyle(panel).translate || "").split(" ")[1]) || 0;
      sheet._enter.cancel(); sheet._enter = null; sheet.removeAttribute("data-entering");
    }
    var overlay = parseFloat(getComputedStyle(sheet, "::before").opacity) || 0;
    sheet.removeAttribute("data-open");
    sheet.style.removeProperty("--drag");
    openStack = openStack.filter(function (s) { return s !== sheet; });
    if (!openStack.length && !document.querySelector(".bog-account-page[data-open]")) document.documentElement.classList.remove("bog-sheet-locked");
    if (!leave(sheet, panel, from, overlay)) {
      var done = function () { if (!sheet.hasAttribute("data-open")) sheet.hidden = true; };
      if (panel && getComputedStyle(panel).transitionDuration !== "0s") panel.addEventListener("transitionend", done, { once: true });
      else done();
      setTimeout(done, 400); // fallback
    }
    if (sheet._select) sheet._select.removeAttribute("data-open");
    if (sheet._opener && sheet._opener.focus) sheet._opener.focus({ preventScroll: true });
    sheet.dispatchEvent(new CustomEvent("sheetclose", { bubbles: true }));
  }

  // Open / close triggers
  document.addEventListener("click", function (e) {
    var opener = e.target.closest("[data-sheet-open]");
    if (opener) { e.preventDefault(); openSheet(opener.getAttribute("data-sheet-open"), opener); return; }
    var closer = e.target.closest("[data-sheet-close]");
    if (closer) { closeSheet(closer.closest(".bog-sheet")); return; }
    // tap on the overlay (the sheet root itself, outside the panel)
    if (e.target.classList && e.target.classList.contains("bog-sheet") && e.target.getAttribute("data-overlay") !== "false") closeSheet(e.target);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && openStack.length) closeSheet();
  });

  // Drag the handle/header down to dismiss
  document.addEventListener("pointerdown", function (e) {
    var nav = e.target.closest(".bog-sheet__nav");
    if (!nav || e.target.closest("button, a, input")) return;
    var sheet = nav.closest(".bog-sheet");
    var panel = sheet.querySelector(".bog-sheet__panel");
    var startY = e.clientY, startT = Date.now(), dy = 0;
    sheet.setAttribute("data-dragging", "");
    nav.setPointerCapture(e.pointerId);
    function move(ev) { dy = Math.max(0, ev.clientY - startY); sheet.style.setProperty("--drag", dy + "px"); }
    function up() {
      nav.removeEventListener("pointermove", move);
      nav.removeEventListener("pointerup", up);
      nav.removeEventListener("pointercancel", up);
      sheet.removeAttribute("data-dragging");
      var fast = dy / Math.max(1, Date.now() - startT) > 0.5;
      if (dy > panel.offsetHeight * 0.25 || (fast && dy > 30)) closeSheet(sheet);
      else sheet.style.removeProperty("--drag");
    }
    nav.addEventListener("pointermove", move);
    nav.addEventListener("pointerup", up);
    nav.addEventListener("pointercancel", up);
  });

  // ---- Select ---------------------------------------------------------------
  var autoId = 0;
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // Build a bottom sheet from a hidden native <select> when no data-sheet is given
  function sheetFor(select) {
    var id = select.getAttribute("data-sheet");
    if (id) return document.getElementById(id);
    var native = select.querySelector(".bog-select__native");
    if (!native) return null;
    id = "bog-select-sheet-" + (++autoId);
    var labelEl = select.querySelector(".bog-select__label");
    var title = select.getAttribute("data-sheet-title") || (labelEl ? labelEl.textContent : "");
    var html = '<div class="bog-sheet" id="' + id + '" hidden><div class="bog-sheet__panel" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
      '<header class="bog-sheet__nav"><div class="bog-sheet__heading"><h2 class="bog-sheet__title">' + esc(title) + '</h2></div></header>' +
      '<div class="bog-sheet__content" data-type="list"><div class="bog-list" role="listbox">';
    Array.prototype.forEach.call(native.options, function (o) {
      if (o.value === "" && !o.textContent.trim()) return;
      html += '<button type="button" class="bog-list-item" role="option" data-value="' + esc(o.value) + '"' + (o.disabled ? " disabled" : "") + '>' +
        '<span class="bog-list-item__content"><span class="bog-list-item__label">' + esc(o.textContent) + '</span></span></button>';
    });
    html += "</div></div></div></div>";
    var host = select.closest(".bog-sheet-host") || document.body;
    host.insertAdjacentHTML("beforeend", html);
    select.setAttribute("data-sheet", id);
    return document.getElementById(id);
  }

  function syncSelected(select, sheet) {
    var v = select.getAttribute("data-value");
    sheet.querySelectorAll(".bog-list-item[data-value]").forEach(function (it) {
      it.setAttribute("aria-selected", it.getAttribute("data-value") === v ? "true" : "false");
    });
    sheet.querySelectorAll(".bog-picker[data-value]").forEach(function (p) {
      p.toggleAttribute("data-selected", p.getAttribute("data-value") === v);
    });
  }

  function setValue(select, value, label) {
    select.setAttribute("data-value", value);
    var out = select.querySelector(".bog-select__value");
    if (out) out.textContent = label;
    var native = select.querySelector(".bog-select__native");
    if (native) native.value = value;
    select.dispatchEvent(new CustomEvent("change", { bubbles: true, detail: { value: value, label: label } }));
  }

  // ---- Account Select → Account Picker Page ----------------------------------
  // Account Select never opens a Bottom Sheet: it pushes a full-screen Account Picker Page
  // (.bog-account-page, linked with data-page="id"). Older markup that points data-sheet at a
  // sheet of pickers is turned into a page the first time it opens.
  function isAccount(select) { return select.getAttribute("data-variant") === "account"; }

  function pageFor(select) {
    var page = document.getElementById(select.getAttribute("data-page") || "");
    if (page) return page;
    var sheet = document.getElementById(select.getAttribute("data-sheet") || "");
    if (!sheet) return null; // nothing to choose from
    var titleEl = sheet.querySelector(".bog-sheet__title");
    var title = select.getAttribute("data-page-title") || (titleEl && titleEl.textContent.trim()) || "Where from?";
    var id = "bog-account-page-" + (++autoId);
    var host = select.closest(".bog-sheet-host") || document.body;
    // Mockups that draw a status bar get one on the page too
    var status = document.querySelector(".bog-statusbar") ? '<div class="bog-statusbar"></div>' : "";
    host.insertAdjacentHTML("beforeend",
      '<div class="bog-account-page" id="' + id + '" hidden role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
        '<header class="bog-navbar" data-background>' + status + '<div class="bog-navbar__header">' +
          '<button type="button" class="bog-icon-btn" data-type="neutral" data-size="small" aria-label="Back" data-page-close><span class="bog-icon" data-icon="chevron-left"></span></button>' +
          '<div class="bog-navbar__titles"><h1 class="bog-navbar__title">' + esc(title) + '</h1></div></div></header>' +
        '<div class="bog-account-page__body"><main class="bog-section-page"><section class="bog-section"><div class="bog-section__content bog-picker-group"></div></section></main></div>' +
        '<footer class="bog-stickybar"><div class="bog-stickybar__buttons"><button type="button" class="bog-btn" data-type="primary" data-width="fill" data-page-choose>Choose</button></div></footer>' +
      "</div>");
    page = document.getElementById(id);
    // Move the sheet's options onto the page; the sheet itself is no longer needed
    var from = sheet.querySelector(".bog-sheet__content") || sheet, to = page.querySelector(".bog-section__content");
    while (from.firstChild) to.appendChild(from.firstChild);
    sheet.remove();
    select.removeAttribute("data-sheet");
    select.setAttribute("data-page", id);
    return page;
  }

  function pageOptions(page) {
    return page.querySelectorAll(".bog-picker[data-value], .bog-choice-card[data-value]");
  }
  function clearPageError(page) {
    page.querySelectorAll(".bog-picker[data-validation]").forEach(function (p) { p.removeAttribute("data-validation"); });
  }
  function pickOption(page, opt) {
    pageOptions(page).forEach(function (o) {
      o.toggleAttribute("data-selected", o === opt);
      var r = o.querySelector('input[type="radio"]');
      if (r) r.checked = o === opt;
    });
    clearPageError(page);
  }
  function chosenOption(page) {
    var list = pageOptions(page);
    for (var i = 0; i < list.length; i++) {
      var r = list[i].querySelector('input[type="radio"]');
      if (list[i].hasAttribute("data-selected") || (r && r.checked)) return list[i];
    }
    return null;
  }

  function stopPageMotion(page) {
    (page._pageMotion || []).forEach(function (a) { a.cancel(); });
    page._pageMotion = null;
  }

  function openAccountPage(select, opener) {
    var page = pageFor(select);
    if (!page || page.hasAttribute("data-open")) return;
    page._select = select;
    page._opener = opener || document.activeElement;
    syncSelected(select, page);
    clearPageError(page);
    select.setAttribute("data-open", "");
    stopPageMotion(page);
    page.hidden = false;
    page.setAttribute("data-open", "");
    document.documentElement.classList.add("bog-sheet-locked"); // freeze the screen behind
    // Account Picker page load (Motion Guidelines 1241:4887): slide + fade in, title and cards rise
    if (window.BOG && BOG.pickerPageIn) page._pageMotion = BOG.pickerPageIn(page);
    var target = page.querySelector(".bog-picker[data-selected] .bog-picker__box") || page.querySelector("[data-page-close]");
    if (target) setTimeout(function () { target.focus({ preventScroll: true }); }, 50);
  }

  function closeAccountPage(page) {
    if (!page || !page.hasAttribute("data-open")) return;
    page.removeAttribute("data-open");
    if (page._select) page._select.removeAttribute("data-open");
    if (!document.querySelector(".bog-sheet[data-open], .bog-account-page[data-open]")) document.documentElement.classList.remove("bog-sheet-locked");
    stopPageMotion(page);
    var done = function () { if (!page.hasAttribute("data-open")) { page.hidden = true; page._pageMotion = null; } };
    // Back: the page-load motion in reverse — slides 190px to the right and fades out
    var still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still || !page.animate) done();
    else {
      var out = page.animate({ translate: ["0 0", "190px 0"], opacity: [1, 0] }, { duration: 250, easing: "cubic-bezier(0.33, 0, 0.67, 1)", fill: "forwards" });
      page._pageMotion = [out];
      out.finished.then(function () { out.cancel(); done(); }, function () {});
    }
    if (page._opener && page._opener.focus) page._opener.focus({ preventScroll: true });
    page.dispatchEvent(new CustomEvent("pageclose", { bubbles: true }));
  }

  function choosePage(page) {
    var opt = chosenOption(page), select = page._select;
    if (!opt) {
      // Nothing chosen: the error shows on the pickers (or only the [data-error-target] ones)
      var targets = page.querySelectorAll(".bog-picker[data-error-target]");
      if (!targets.length) targets = page.querySelectorAll(".bog-picker[data-value]");
      targets.forEach(function (p) { p.setAttribute("data-validation", "error"); });
      if (targets[0]) targets[0].scrollIntoView({ block: "nearest", behavior: "smooth" });
      return;
    }
    if (select) {
      var labelEl = opt.querySelector(".bog-picker__title, .bog-choice-card__title");
      setValue(select, opt.getAttribute("data-value"), opt.getAttribute("data-label") || (labelEl ? labelEl.textContent.trim() : opt.textContent.trim()));
      var media = opt.getAttribute("data-media"), mImg = media && select.querySelector(".bog-select__box > :not(.bog-select__text) img");
      if (mImg) mImg.src = media;
    }
    closeAccountPage(page);
  }

  document.addEventListener("click", function (e) {
    var page = e.target.closest(".bog-account-page");
    if (!page) return;
    if (e.target.closest("[data-page-close]")) { closeAccountPage(page); return; }
    if (e.target.closest("[data-page-choose]")) { choosePage(page); return; }
    if (e.target.closest(".bog-currency-chip")) return;
    var box = e.target.closest(".bog-picker__box");
    var opt = box ? box.closest(".bog-picker[data-value]") : e.target.closest(".bog-choice-card[data-value]");
    if (opt && !opt.matches('[aria-disabled="true"], [data-state="skeleton"]')) pickOption(page, opt);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" || document.querySelector(".bog-sheet[data-open], .bog-modal[open], .bog-modal[data-open]")) return;
    var open = document.querySelectorAll(".bog-account-page[data-open]");
    if (open.length) closeAccountPage(open[open.length - 1]);
  });

  // Initial value from the native select's selected option
  document.querySelectorAll(".bog-select").forEach(function (select) {
    var native = select.querySelector(".bog-select__native");
    if (!select.hasAttribute("data-value") && native && native.selectedIndex >= 0 && native.options[native.selectedIndex].hasAttribute("selected")) {
      var o = native.options[native.selectedIndex];
      select.setAttribute("data-value", o.value);
      var out = select.querySelector(".bog-select__value");
      if (out && !out.textContent) out.textContent = o.textContent;
    }
  });

  document.addEventListener("click", function (e) {
    // Tap the Select → open its bottom sheet
    var box = e.target.closest(".bog-select__box");
    if (box) {
      var select = box.closest(".bog-select");
      if (box.disabled || box.getAttribute("aria-readonly") === "true" || select.matches('[data-state="skeleton"]')) return;
      // Account Select pushes the Account Picker Page — never a Bottom Sheet
      if (isAccount(select)) { openAccountPage(select, box); return; }
      var sheet = sheetFor(select);
      if (!sheet) return;
      sheet._select = select;
      syncSelected(select, sheet);
      select.setAttribute("data-open", "");
      openSheet(sheet, box);
      return;
    }
    // Tap an option in a sheet opened by a Select → set the value and close
    var item = e.target.closest(".bog-list-item[data-value], .bog-picker[data-value]");
    if (item && !item.disabled && !e.target.closest(".bog-currency-chip")) {
      var sh = item.closest(".bog-sheet");
      if (!sh || !sh._select) return;
      var labelEl = item.querySelector(".bog-list-item__label, .bog-picker__title");
      setValue(sh._select, item.getAttribute("data-value"), item.getAttribute("data-label") || (labelEl ? labelEl.textContent : item.textContent.trim()));
      var media = item.getAttribute("data-media"), mImg = media && sh._select.querySelector(".bog-select__box > :not(.bog-select__text) img");
      if (mImg) mImg.src = media;
      syncSelected(sh._select, sh);
      setTimeout(function () { closeSheet(sh); }, 120);
    }
  });

  window.BOG = window.BOG || {};
  window.BOG.openSheet = openSheet;
  window.BOG.closeSheet = closeSheet;
  window.BOG.openAccountPage = openAccountPage;
  window.BOG.closeAccountPage = closeAccountPage;

  // Keyboard: on phones the on-screen keyboard shrinks the visual viewport but not
  // fixed elements. Expose its height so open sheets can sit above it.
  if (window.visualViewport) {
    var vv = window.visualViewport;
    // While the keyboard is open iOS scrolls the page up to make room, which drags fixed
    // screens and sheets (and their top bars) up too. --bog-vv-top / --bog-vv-height pin
    // them to the visible area instead; outside keyboard time they're removed (= full screen).
    var root = document.documentElement.style;
    var syncKeyboard = function () {
      var kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      var open = kb > 80;
      root.setProperty("--bog-keyboard", (open ? kb : 0) + "px");
      if (open) {
        root.setProperty("--bog-vv-top", Math.round(vv.offsetTop) + "px");
        root.setProperty("--bog-vv-height", Math.round(vv.height) + "px");
      } else {
        root.removeProperty("--bog-vv-top");
        root.removeProperty("--bog-vv-height");
      }
      document.documentElement.toggleAttribute("data-bog-keyboard", open);
    };
    // Keep the focused field in view inside its own scroll area once the keyboard is up
    document.addEventListener("focusin", function (e) {
      var el = e.target;
      if (!el.matches || !el.matches("input, textarea, [contenteditable]") || el.getAttribute("aria-hidden") === "true") return;
      if (el.closest(".bog-sheet")) return;   // sheets already sit above the keyboard; scrolling there only makes content jump
      setTimeout(function () {                 // once, after the keyboard animation has settled
        if (document.activeElement === el && document.documentElement.hasAttribute("data-bog-keyboard")) el.scrollIntoView({ block: "center" });
      }, 500);
    });
    vv.addEventListener("resize", syncKeyboard);
    vv.addEventListener("scroll", syncKeyboard);
  }
})();

/* ---- Action Item: remove button ------------------------------------------
   Inside a selection strip (.bog-selection) removing plays the strip motion below;
   elsewhere the item fades out. */
(function () {
  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".bog-action-item__remove");
    if (!btn) return;
    var item = btn.closest(".bog-action-item");
    var ev = new CustomEvent("actionitemremove", { bubbles: true, cancelable: true });
    if (!item.dispatchEvent(ev)) return; // call e.preventDefault() in a listener to keep the item
    if (item.closest(".bog-selection") && window.BOG && BOG.selectionRemove) { BOG.selectionRemove(item); return; }
    item.setAttribute("data-removing", "");
    setTimeout(function () { item.remove(); }, 180);
  });
})();

/* ---- Selection strip: chosen recipients as removable Action Items --------
   Figma "Avatars" (Component Motion Guidelines 812:443).
     BOG.selectionAdd(strip, item)   adds an Action Item (element or HTML) at the end
     BOG.selectionRemove(item)       removes one
   First item: the strip opens and pushes the content below down, 7px past and back;
   the avatar pops in to 102% and settles. Next items: the avatar pops in and the
   row slides along to show it. Removing: the avatar shrinks away and the ones after
   it close the gap; removing the last one closes the strip.
   --bog-selection-slow on the strip (or a parent) stretches every duration (docs). */
(function () {
  var E = function (a, b, c, d) { return "cubic-bezier(" + [a, b, c, d].join(", ") + ")"; };
  var reduce = function () { return window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches; };
  var slowOf = function (el) { return parseFloat(getComputedStyle(el).getPropertyValue("--bog-selection-slow")) || 1; };
  var circleOf = function (item) { return item.querySelector(".bog-action-item__circle") || item; };

  function popIn(item, first, k) {
    var c = circleOf(item);
    // One track: 0 until 17 ms → 102% (first: at 150 ms, next: at 153 ms) → 100% 100 ms later
    var peak = first ? 150 : 153, end = peak + 100;
    c.animate([
      { scale: 0, offset: 0 },
      { scale: 0, offset: 17 / end, easing: first ? E(0.48, 0, 0.35, 0.82) : E(0.48, 0, 0.35, 0.72) },
      { scale: 1.02, offset: peak / end, easing: first ? E(0.23, -3.32, 0.55, 1) : E(0.23, -4.15, 0.55, 1) },
      { scale: 1, offset: 1 }
    ], { duration: end * k });
    // The label and remove button come with the avatar
    item.querySelectorAll(".bog-action-item__label, .bog-action-item__amount, .bog-action-item__remove").forEach(function (el) {
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150 * k, delay: 17 * k, easing: E(0.33, 0, 0.67, 1), fill: "backwards" });
    });
  }

  function add(strip, item) {
    if (typeof item === "string") { var t = document.createElement("div"); t.innerHTML = item.trim(); item = t.firstElementChild; }
    var first = !strip.querySelector(".bog-action-item:not([data-leaving])");
    var k = slowOf(strip);
    strip.hidden = false;
    var atStart = strip.getAttribute("data-insert") === "start";
    var prevLeft = atStart ? [].map.call(strip.children, function (el) { return el.getBoundingClientRect().left; }) : null;
    var prevKids = atStart ? [].slice.call(strip.children) : null;
    if (atStart) strip.insertBefore(item, strip.firstChild); else strip.appendChild(item);
    if (reduce()) { strip.scrollLeft = atStart ? 0 : strip.scrollWidth; return item; }
    if (first) {
      // The strip opens: the content below moves down by its height + 7, then settles 7 back
      (strip._bogAnims || []).forEach(function (a) { a.cancel(); });
      // (padding animates too, so the strip really starts at 0)
      var h = strip.offsetHeight, cs = getComputedStyle(strip), pt = cs.paddingTop, pb = cs.paddingBottom;
      strip._bogAnims = [strip.animate([
        { height: "0px", paddingTop: "0px", paddingBottom: "0px", easing: E(0.33, 0, 0.08, 1) },
        { height: (h + 7) + "px", paddingTop: pt, paddingBottom: pb, offset: 133 / 233, easing: E(0.17, 0, 0, 1) },
        { height: h + "px", paddingTop: pt, paddingBottom: pb }
      ], { duration: 233 * k })];
    } else if (atStart) {
      // data-insert="start": the new item appears on the left and the row slides right to make room
      strip.scrollLeft = 0;
      prevKids.forEach(function (el, i) {
        var dx = prevLeft[i] - el.getBoundingClientRect().left;
        if (dx) el.animate([{ translate: dx + "px 0" }, { translate: "0 0" }], { duration: 200 * k, easing: E(0.33, 0, 0.25, 1) });
      });
    } else {
      // The row slides left to bring the new item into view
      var before = strip.scrollLeft;
      strip.scrollLeft = strip.scrollWidth;
      var d = strip.scrollLeft - before;
      if (d > 0) [].forEach.call(strip.children, function (el) {
        el.animate([{ translate: d + "px 0" }, { translate: "0 0" }], { duration: 200 * k, easing: E(0.33, 0, 0.25, 1) });
      });
    }
    popIn(item, first, k);
    return item;
  }

  function remove(item) {
    var strip = item.closest(".bog-selection");
    if (!strip || item.hasAttribute("data-leaving")) return;
    var k = slowOf(strip);
    var others = [].filter.call(strip.querySelectorAll(".bog-action-item"), function (el) { return el !== item && !el.hasAttribute("data-leaving"); });
    item.setAttribute("data-leaving", "");
    if (reduce()) { item.remove(); if (!others.length) strip.hidden = true; return; }

    // Shrink it away: 100% → 0 in 150 ms
    circleOf(item).animate([{ scale: 1 }, { scale: 0 }], { duration: 150 * k, easing: E(0.33, 0, 0.15, 1), fill: "forwards" });
    var fade = item.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150 * k, easing: E(0.33, 0, 0.15, 1), fill: "forwards" });

    if (!others.length) {
      // Last one: the strip closes and the content below moves up by its height (200 ms after 15 ms)
      (strip._bogAnims || []).forEach(function (a) { a.cancel(); });
      var h = strip.offsetHeight, cs2 = getComputedStyle(strip);
      var close = strip.animate([{ height: h + "px", paddingTop: cs2.paddingTop, paddingBottom: cs2.paddingBottom }, { height: "0px", paddingTop: "0px", paddingBottom: "0px" }], { duration: 200 * k, delay: 15 * k, easing: E(0.33, 0, 0.01, 1), fill: "forwards" });
      strip._bogAnims = [close];
      close.finished.then(function () {
        item.remove();
        if (!strip.querySelector(".bog-action-item:not([data-leaving])")) strip.hidden = true;
        close.cancel();
      }, function () {});
      return;
    }
    // Take it out of the row where it stands; the others close the gap: 200 ms after 17 ms.
    // Any avatar that moves animates — in a scrolled row the browser may shift the earlier ones.
    var from = others.map(function (el) { return el.getBoundingClientRect().left; });
    var sr = strip.getBoundingClientRect(), ir = item.getBoundingClientRect();
    item.style.position = "absolute";
    item.style.left = (ir.left - sr.left + strip.scrollLeft) + "px";
    item.style.top = (ir.top - sr.top) + "px";
    others.forEach(function (el, i) {
      var dx = from[i] - el.getBoundingClientRect().left;
      if (dx) el.animate([{ translate: dx + "px 0" }, { translate: "0 0" }], { duration: 200 * k, delay: 17 * k, easing: E(0.33, 0, 0.07, 1), fill: "backwards" });
    });
    fade.finished.then(function () { item.remove(); }, function () {});
  }

  // Desktop: drag with the mouse or scroll the wheel to move the strip sideways (touch scrolls natively)
  document.addEventListener("pointerdown", function (e) {
    var strip = e.pointerType === "mouse" && e.target.closest && e.target.closest(".bog-selection");
    if (!strip || e.target.closest(".bog-action-item__remove")) return;
    var x0 = e.clientX, s0 = strip.scrollLeft, moved = false;
    function mv(ev) { var dx = ev.clientX - x0; if (Math.abs(dx) > 4) moved = true; strip.scrollLeft = s0 - dx; }
    function up() { document.removeEventListener("pointermove", mv); document.removeEventListener("pointerup", up);
      if (moved) strip.addEventListener("click", function (ev) { ev.stopPropagation(); ev.preventDefault(); }, { capture: true, once: true }); }
    document.addEventListener("pointermove", mv); document.addEventListener("pointerup", up);
  });
  document.addEventListener("wheel", function (e) {
    var strip = e.target.closest && e.target.closest(".bog-selection");
    if (!strip || strip.scrollWidth <= strip.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    strip.scrollLeft += e.deltaY; e.preventDefault();
  }, { passive: false });

  window.BOG = window.BOG || {};
  BOG.selectionAdd = add;
  BOG.selectionRemove = remove;
  document.querySelectorAll(".bog-selection").forEach(function (s) { if (!s.querySelector(".bog-action-item")) s.hidden = true; });
})();

/* ---- Checkbox: data-indeterminate attribute → indeterminate property;
   motion in and out of Indeterminate (BOG UI proposal — Radio Button speeds).
   Off ↔ On is plain CSS (checkbox.css). The dash grows out from its centre with the same
   overshoot as the check (333 ms); between dash and check the old mark shrinks away (150 ms)
   and the new one grows in. The check's path draws start → corner → end in 250 ms. Changing .indeterminate in code fires no event: call BOG.checkboxSync(). */
(function () {
  var SEL = ".bog-checkbox__input";
  document.querySelectorAll(SEL + "[data-indeterminate]").forEach(function (i) {
    i.indeterminate = true;
    i.removeAttribute("data-indeterminate");   // the property drives it from now on
  });

  // Read-only can't change: a tap on the box or its label, or Space on a focused box, is ignored
  document.addEventListener("click", function (e) {
    var row = e.target.closest && e.target.closest(".bog-checkbox, " + SEL);
    if (!row) return;
    var input = row.matches(SEL) ? row : row.querySelector(SEL);
    if (input && input.closest('[data-state="readonly"], ' + SEL + '[data-state="readonly"]')) e.preventDefault();
  });

  var last = new WeakMap();
  function stateOf(i) { return i.indeterminate ? "ind" : i.checked ? "on" : "off"; }
  function snapshot() { document.querySelectorAll(SEL).forEach(function (i) { last.set(i, stateOf(i)); }); }

  var E = function (x1, y1, x2, y2) { return "cubic-bezier(" + [x1, y1, x2, y2].join(", ") + ")"; };
  var OUT = E(0.33, 0, 0.67, 1), POP = E(0.33, 0, 0, 1.7), PATH = E(0.33, 0, 0.13, 1);
  // Icons sit next to bog-ui.js (the page may live anywhere)
  var BASE = (document.currentScript && document.currentScript.src) || location.href;
  var icon = function (n) { return 'url("' + new URL("icons/" + n, BASE).href + '")'; };
  var SHAPE = {
    check: { top: "8.8px", height: "7px", url: icon("checkbox-check.svg") },
    dash:  { top: "11.3px", height: "1.43px", url: icon("checkbox-dash.svg") }
  };
  function shape(name, extra) {
    var s = SHAPE[name], f = { top: s.top, height: s.height, maskImage: s.url, webkitMaskImage: s.url };
    for (var k in extra) f[k] = extra[k];
    return f;
  }

  // Path draw for the check: a clip band that follows the tick's centre line — short leg
  // (start → corner) first, then the long leg (corner → end). Points in the 10×7 mark box.
  function poly(pts) { return "polygon(" + pts.map(function (p) { return p[0] + "px " + p[1] + "px"; }).join(", ") + ")"; }
  var LEG1 = 0.396;   // short leg / whole path length
  var DRAW = [
    { offset: 0,    clipPath: poly([[1.02, 1.28], [1.02, 1.28], [1.02, 1.28], [-0.82, 3.12], [-0.82, 3.12], [-0.82, 3.12]]) },
    { offset: LEG1, clipPath: poly([[1.02, 1.28], [3.96, 4.2], [4.88, 5.12], [3.04, 6.96], [3.04, 6.96], [-0.82, 3.12]]) },
    { offset: LEG1, clipPath: poly([[1.02, 1.28], [3.96, 4.2], [3.96, 4.2], [4.88, 6.96], [3.96, 7.88], [-0.82, 3.12]]) },
    { offset: 1,    clipPath: poly([[1.02, 1.28], [3.96, 4.2], [8.93, -0.77], [10.77, 1.07], [3.96, 7.88], [-0.82, 3.12]]) }
  ];

  function play(i, from, to) {
    var css = from === "on" && to === "off" || from === "off" && to === "on";   // scale runs in CSS
    (i._bogCheckboxAnims || []).forEach(function (a) { a.cancel(); });
    i._bogCheckboxAnims = null;
    i.removeAttribute("data-motion");
    if (to === "off" && from === "on") return;
    if (!i.animate || i.disabled) return;
    if (i.closest('[data-state="readonly"], [data-state="skeleton"]')) return;
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!css) i.setAttribute("data-motion", "");   // the mark's CSS transitions off while this runs
    var k = parseFloat(getComputedStyle(i).getPropertyValue("--bog-checkbox-slow")) || 1;
    var P = "::before", anims = [], start = 0;
    // 1. The old mark (check or dash) shrinks away: 150 ms
    if (from !== "off") {
      var old = from === "ind" ? "dash" : "check";
      anims.push(i.animate([shape(old, { scale: old === "dash" ? "1 1" : "1" }), shape(old, { scale: old === "dash" ? "0 1" : "0" })],
        { duration: 150 * k, easing: OUT, pseudoElement: P }));
      start = 150;
    }
    // 2. The new mark grows in from `start`, 333 ms with overshoot (radio Select)
    if (to === "ind") {         // dash grows from its centre
      anims.push(i.animate([{ scale: "0 1" }, { scale: "1 1" }],
        { duration: 333 * k, delay: start * k, easing: POP, pseudoElement: P }));
    } else if (to === "on") {   // check grows from its centre (CSS from Off) while its path draws, 250 ms
      if (!css) anims.push(i.animate([{ scale: "0" }, { scale: "1" }], { duration: 333 * k, delay: start * k, easing: POP, pseudoElement: P }));
      anims.push(i.animate(DRAW, { duration: 250 * k, delay: start * k, easing: PATH, pseudoElement: P }));
    }
    i._bogCheckboxAnims = anims;
    Promise.all(anims.map(function (a) { return a.finished; })).then(function () {
      if (i._bogCheckboxAnims === anims) { i.removeAttribute("data-motion"); i._bogCheckboxAnims = null; }
    }, function () {});
  }

  // After any change (a tap, or a handler that sets other checkboxes), animate every checkbox
  // whose state moved in or out of Indeterminate. Listeners on the checkboxes run first.
  function sync(tapped) {
    document.querySelectorAll(SEL).forEach(function (i) {
      var was = last.get(i), now = stateOf(i);
      // Added after load: a tap flipped it from the other state
      if (!was && i === tapped) was = now === "on" ? "off" : "on";
      if (was && was !== now) play(i, was, now);
      last.set(i, now);
    });
  }
  document.addEventListener("change", function (e) { if (e.target.matches && e.target.matches(SEL)) sync(e.target); });
  window.BOG = window.BOG || {};
  BOG.checkboxSync = function () { sync(); };
  snapshot();
  window.addEventListener("load", snapshot);
})();

/* ---- Radio Button: unselect ------------------------------------------------
   Off by default — BOG: a radio choice can't be cleared by tapping it again; "no choice" needs
   its own option (e.g. None). Opt in with data-deselectable (or ="true") on the group, row or
   input: then tapping (or Space on) the selected option clears it and fires "change"; the dot
   plays the Deselect motion in radio.css. data-deselectable="false" on an inner element turns it
   back off there. */
(function () {
  var SEL = ".bog-radio__input";
  function inputOf(t) {
    if (!t.closest) return null;
    if (t.matches(SEL)) return t;
    var row = t.closest(".bog-radio");
    return row ? row.querySelector(SEL) : null;
  }
  function on(i) {
    var opt = i && i.closest("[data-deselectable]");
    return opt && opt.getAttribute("data-deselectable") !== "false" && !i.disabled &&
      !i.closest('[data-state="readonly"], [data-state="skeleton"]');
  }
  var was = null;   // the input under the pointer / key, if it was already selected
  function mark(e) { var i = inputOf(e.target); was = on(i) && i.checked ? i : null; }
  document.addEventListener("pointerdown", mark, true);
  document.addEventListener("keydown", function (e) { if (e.key === " ") mark(e); }, true);
  document.addEventListener("click", function (e) {
    var i = inputOf(e.target);
    if (!i || i !== was || e.target.closest("a")) return;
    was = null;
    // The browser re-selects it during this click; clear it right after
    setTimeout(function () {
      if (!i.checked) return;
      i.checked = false;
      i.dispatchEvent(new Event("input", { bubbles: true }));
      i.dispatchEvent(new Event("change", { bubbles: true }));
    }, 0);
  });
})();

/* ---- Toggle Switch: data-indeterminate → indeterminate property; read-only can't change;
   motion to and from Indeterminate (Figma "Toggle (Off to Intermediate)" / "(Intermediate to On)").
   Off ↔ On is plain CSS (toggle.css). In and out of Indeterminate the circle squashes into the
   16×2 bar while it slides 11px, overshoots ~1px and settles — two steps, so it runs here. */
(function () {
  var SEL = ".bog-toggle__input";
  document.querySelectorAll(SEL + "[data-indeterminate]").forEach(function (i) {
    i.indeterminate = true;
    i.removeAttribute("data-indeterminate");   // the property drives it from now on
  });

  // A tap on a read-only switch (or anywhere on its row) is ignored
  document.addEventListener("click", function (e) {
    var row = e.target.closest && e.target.closest(".bog-toggle, " + SEL);
    if (!row) return;
    var input = row.matches(SEL) ? row : row.querySelector(SEL);
    if (input && input.closest('[data-state="readonly"], ' + SEL + '[data-state="readonly"]')) e.preventDefault();
  });

  var last = new WeakMap();
  function stateOf(i) { return i.indeterminate ? "ind" : i.checked ? "on" : "off"; }
  function snapshot() { document.querySelectorAll(SEL).forEach(function (i) { last.set(i, stateOf(i)); }); }

  // Circle centre X in the 44×24 track: off 12, indeterminate bar 22, on 32
  var E = function (x1, y1, x2, y2) { return "cubic-bezier(" + [x1, y1, x2, y2].join(", ") + ")"; };
  var MOVES = {
    // Off → Indeterminate: bg 0–100, size 0–200, X 33–233 (+11) then 233–383 (−1)
    "off>ind": { total: 383, x: [[0, 12], [33, 12, E(0.33, 0, 0.13, 1)], [233, 23, E(0.33, 0, 0, 1)], [383, 22]],
                 size: [200, [20, 20], [16, 2], E(0.33, 0, 0.05, 1)], bg: [100, E(0.33, 0, 0.67, 1)] },
    // Indeterminate → On: X 0–200 (+11) then 200–300 (−1), size 0–150, bg stays
    "ind>on":  { total: 300, x: [[0, 22, E(0.33, 0, 0.22, 1)], [200, 33, E(0.33, 0, 0.16, 1)], [300, 32]],
                 size: [150, [16, 2], [20, 20], E(0.17, 0, 0.67, 1)] },
    // Not in the guide — the same moves mirrored
    "ind>off": { total: 300, x: [[0, 22, E(0.33, 0, 0.22, 1)], [200, 11, E(0.33, 0, 0.16, 1)], [300, 12]],
                 size: [150, [16, 2], [20, 20], E(0.17, 0, 0.67, 1)], bg: [100, E(0.33, 0, 0.67, 1)] },
    "on>ind":  { total: 383, x: [[0, 32], [33, 32, E(0.33, 0, 0.13, 1)], [233, 21, E(0.33, 0, 0, 1)], [383, 22]],
                 size: [200, [20, 20], [16, 2], E(0.33, 0, 0.05, 1)] }
  };

  function play(i, from, to) {
    var m = MOVES[from + ">" + to];
    if (!m || !i.animate) return;
    if (i.closest('[data-state="readonly"], [data-state="skeleton"], ' + SEL + '[data-state]')) return;
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    (i._bogToggleAnims || []).forEach(function (a) { a.cancel(); });
    i.setAttribute("data-motion", "");   // CSS transitions off while this runs
    var cs = getComputedStyle(i);
    var k = parseFloat(cs.getPropertyValue("--bog-toggle-slow")) || 1;
    var T = m.total * k, P = "::before";
    var anims = [
      // Centre the circle on (x, 12) for the whole move; x and size animate separately
      i.animate([{ top: "12px", translate: "-50% -50%" }, { top: "12px", translate: "-50% -50%" }], { duration: T, pseudoElement: P }),
      i.animate(m.x.map(function (s) {
        var f = { left: s[1] + "px", offset: s[0] / m.total };
        if (s[2]) f.easing = s[2];
        return f;
      }), { duration: T, pseudoElement: P }),
      i.animate([{ width: m.size[1][0] + "px", height: m.size[1][1] + "px" }, { width: m.size[2][0] + "px", height: m.size[2][1] + "px" }],
        { duration: m.size[0] * k, easing: m.size[3], pseudoElement: P })
    ];
    if (m.bg) {
      var off = cs.getPropertyValue("--_track").trim(), on = cs.getPropertyValue("--_on").trim();
      anims.push(i.animate([{ backgroundColor: to === "off" ? on : off }, { backgroundColor: to === "off" ? off : on }],
        { duration: m.bg[0] * k, easing: m.bg[1] }));
    }
    i._bogToggleAnims = anims;
    Promise.all(anims.map(function (a) { return a.finished; })).then(function () {
      if (i._bogToggleAnims === anims) { i.removeAttribute("data-motion"); i._bogToggleAnims = null; }
    }, function () {});
  }

  // After any change (a tap, or a handler that sets other switches), animate every switch
  // whose state moved in or out of Indeterminate. Listeners on the switches run first.
  function sync() {
    document.querySelectorAll(SEL).forEach(function (i) {
      var was = last.get(i), now = stateOf(i);
      if (was && was !== now) play(i, was, now);
      last.set(i, now);
    });
  }
  document.addEventListener("change", function (e) { if (e.target.matches && e.target.matches(SEL)) sync(); });
  // Changing .indeterminate in code fires no event: call BOG.toggleSync() afterwards
  window.BOG = window.BOG || {};
  BOG.toggleSync = sync;
  snapshot();
  window.addEventListener("load", snapshot);
})();

/* ---- Result Page: load-in motion (Figma "Result Pages" 417:443) -----------
   BOG.resultIn(page, { slow })  plays the recipe for the page's .bog-result:
     success      "Default - Result Page": the icon appears in the middle of the screen,
                  then rises to its spot (1167–2000 ms); the text blocks fade in and
                  rise 20/30 px from 1400 ms, 66.7 ms apart.
     pending      "Pending": icon scales in (0–500 ms), title / description from 100 / 200 ms.
     warning, info  no guide of their own — they use Pending.
     negative     "Error": Pending + the icon shakes on X (+10, −20, +15, −5 px).
     custom       "Result - Card": the card visual drops in with a 3D flip, text from 500 ms.
   Any number of blocks works: each next block starts one step later.
   <section class="bog-result-page" data-animate> plays it on load. */
(function () {
  var E = function (a, b, c, d) { return "cubic-bezier(" + [a, b, c, d].join(", ") + ")"; };
  var RECIPES = {
    success:  { start: 1400, step: 66.7, dur: 500, fade: 500, ease: E(0.45, 0, 0.10, 1), rise: [20, 20, 30] },
    pending:  { start: 100,  step: 100,  dur: 500, fade: 500, ease: E(0.29, 0, 0.01, 1), rise: [20, 20, 20] },
    custom:   { start: 500,  step: 67,   dur: 500, fade: 333, ease: E(0.29, 0, 0.01, 1), rise: [20, 20, 30] }
  };
  function blocks(r) {
    var out = [];
    [".bog-result__title", ".bog-result__desc", ".bog-result__amount-title", ".bog-result__amount .bog-amount",
     ".bog-result__support", ".bog-result__action", ".bog-result__extra"].forEach(function (s) {
      r.querySelectorAll(s).forEach(function (el) { out.push(el); });
    });
    return out;
  }
  function resultIn(page, opts) {
    var r = page && (page.matches(".bog-result") ? page : page.querySelector(".bog-result"));
    if (!r || !r.animate) return [];
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return [];
    var k = (opts && opts.slow) || 1;
    (r._bogResultAnims || []).forEach(function (a) { a.cancel(); });
    var status = r.getAttribute("data-status") || "success";
    var rec = RECIPES[status] || RECIPES.pending;
    var anims = [], T = function (ms) { return ms * k; };
    var play = function (el, frames, o) { o.duration = T(o.duration); o.delay = T(o.delay || 0); o.fill = o.fill || "backwards"; anims.push(el.animate(frames, o)); };

    // Text blocks: fade in and rise, one step apart
    blocks(r).forEach(function (el, i) {
      var y = rec.rise[Math.min(i, rec.rise.length - 1)], d = rec.start + i * rec.step;
      play(el, [{ translate: "0 " + y + "px" }, { translate: "0 0" }], { duration: rec.dur, delay: d, easing: rec.ease });
      play(el, [{ opacity: 0 }, { opacity: 1 }], { duration: rec.fade, delay: d, easing: rec.ease });
    });

    var icon = r.querySelector(".bog-result__icon");
    var visual = r.querySelector(".bog-result__visual > *");
    if (status === "custom" && visual) {
      // Card: drops 85 px into place, flips up from −72° (X) and −90° (Z), scale 68% → 111% → 100%
      r.querySelector(".bog-result__visual").style.perspective = "800px";
      play(visual, [{ translate: "0 -85.28px" }, { translate: "0 0" }], { duration: 1000, easing: E(0.33, 0, 0.14, 1) });
      play(visual, [{ transform: "rotateX(-72deg)" }, { transform: "rotateX(0deg)" }], { duration: 1000, easing: E(0.33, 0, 0.27, 1) });
      anims.push(visual.animate([{ transform: "rotateZ(-90deg)" }, { transform: "rotateZ(0deg)" }], { duration: T(750), easing: E(0.33, 0, 0.21, 1), composite: "add", fill: "backwards" }));
      play(visual, [{ scale: 0.677, easing: E(0.33, 0, 0.21, 1) }, { scale: 1.108, offset: 0.5, easing: E(0.17, 0, 0.21, 1) }, { scale: 1 }], { duration: 1000 });
    } else if (icon) {
      // Icon (stands in for the Lottie): scales in, 500 ms
      play(icon, [{ scale: 0 }, { scale: 1 }], { duration: 500, easing: E(0.29, 0, 0.01, 1) });
      if (status === "success") {
        // …in the middle of the screen, then rises to its spot (Lottie Position 1167–2000 ms)
        var pr = page.getBoundingClientRect(), ir = icon.getBoundingClientRect();
        var dy = (pr.top + pr.height / 2) - (ir.top + ir.height / 2);
        play(icon, [{ translate: "0 " + dy + "px", offset: 0 }, { translate: "0 " + dy + "px", offset: 1167 / 2000, easing: E(0.33, 0, 0, 1) }, { translate: "0 0" }], { duration: 2000 });
      }
      if (status === "negative") {
        // Error shake: +10, −20, +15, −5 px from 250 ms (100 ms each)
        var S = E(0.33, 0, 0, 1);
        play(icon, [
          { translate: "0 0", offset: 0, easing: S }, { translate: "10px 0", offset: 100 / 402, easing: S },
          { translate: "-10px 0", offset: 200 / 402 }, { translate: "-10px 0", offset: 202 / 402, easing: S },
          { translate: "5px 0", offset: 302 / 402, easing: E(0.17, 0, 0.83, 1) }, { translate: "0 0", offset: 1 }
        ], { duration: 402, delay: 250, fill: "none" });
      }
    }
    r._bogResultAnims = anims;
    return anims;
  }
  window.BOG = window.BOG || {};
  BOG.resultIn = resultIn;
  document.querySelectorAll(".bog-result-page[data-animate]").forEach(function (p) { resultIn(p); });
})();

/* ---- Chips: toggle aria-pressed on filter / icon chips -------------------- */
(function () {
  document.addEventListener("click", function (e) {
    var chip = e.target.closest(".bog-chip[aria-pressed]");
    // e.defaultPrevented: the page (or a data-sheet-open chip) manages aria-pressed itself
    if (!chip || chip.disabled || e.defaultPrevented || chip.closest(".bog-picker__chips")) return;
    chip.setAttribute("aria-pressed", chip.getAttribute("aria-pressed") === "true" ? "false" : "true");
  });
})();

/* ---- Feedback: close button + BOG.toast() --------------------------------- */
(function () {
  // The toasts left behind slide into their new spots with the Toast In bounce:
  // past the spot by up to 20px (250ms), then settle back (250ms), cubic-bezier(0.33, 0, 0.25, 1).
  var EASE = "cubic-bezier(0.33, 0, 0.25, 1)";
  function reflow(region, leaving) {
    var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    var stay = [].slice.call(region.children).filter(function (c) { return c !== leaving && !c.hasAttribute("data-leaving"); });
    var before = stay.map(function (s) { return s.getBoundingClientRect().top; });
    // Take the closing toast out of the stack where it is, so the others can move now
    var top = leaving.offsetTop, left = leaving.offsetLeft, width = leaving.offsetWidth;
    leaving.style.position = "absolute";
    leaving.style.top = top + "px";
    leaving.style.left = left + "px";
    leaving.style.width = width + "px";
    if (reduce || !leaving.animate) return;
    var k = parseFloat(getComputedStyle(region).getPropertyValue("--bog-toast-slow")) || 1;
    stay.forEach(function (s, n) {
      var d = before[n] - s.getBoundingClientRect().top;   // + = it moved up
      if (Math.abs(d) < 1) return;
      var past = -Math.sign(d) * Math.min(20, Math.abs(d) / 2);
      s.animate([
        { transform: "translateY(" + d + "px)", easing: EASE },
        { transform: "translateY(" + past + "px)", offset: 0.5, easing: EASE },
        { transform: "translateY(0)" }
      ], { duration: 500 * k, composite: "add" });   // adds onto a Toast In that may still be running
    });
  }
  function dismiss(el) {
    if (el.parentElement && el.parentElement.classList.contains("bog-toast-region")) {
      if (el.hasAttribute("data-leaving")) return;
      reflow(el.parentElement, el);
      el.setAttribute("data-leaving", "");           // toast: slides back out (see feedback.css), removed when it's done
      var out = el.getAnimations ? el.getAnimations().filter(function (a) { return /out/.test(a.animationName || ""); })[0] : null;
      if (out) out.finished.then(function () { el.remove(); }, function () {}); else setTimeout(function () { el.remove(); }, 250);
      return;
    }
    el.setAttribute("data-removing", "");
    setTimeout(function () { el.remove(); }, 180);
  }
  document.addEventListener("click", function (e) {
    var close = e.target.closest(".bog-feedback__close");
    if (close) dismiss(close.closest(".bog-feedback"));
  });
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  // BOG.toast({ status, title, text, actions: [{label, type}], timeout, position: "top"|"bottom", host })
  // timeout (ux-guidelines): ≈ 4 s without actions, ≈ 8 s with actions; 0 keeps it until users tap × —
  // use 0 for critical / sensitive messages (e.g. a failed transfer).
  function toast(o) {
    o = o || {};
    var host = o.host || document.querySelector(".bog-sheet-host") || document.body;
    var pos = o.position || "top";
    var region = host.querySelector(':scope > .bog-toast-region[data-position="' + pos + '"]');
    if (!region) {
      region = document.createElement("div");
      region.className = "bog-toast-region";
      region.setAttribute("data-position", pos);
      host.appendChild(region);
    }
    var el = document.createElement("div");
    el.className = "bog-feedback";
    el.setAttribute("role", "status");
    el.setAttribute("data-status", o.status || "neutral");
    if (o.appearance) el.setAttribute("data-appearance", o.appearance);
    el.innerHTML = (o.status === "neutral" || !o.status ? '<span class="bog-icon"></span>' : "") +
      '<div class="bog-feedback__text">' + (o.title ? '<p class="bog-feedback__title">' + esc(o.title) + "</p>" : "") +
      '<p class="bog-feedback__desc">' + esc(o.text || "") + "</p></div>" +
      '<button type="button" class="bog-feedback__close" aria-label="Close"></button>' +
      (o.actions && o.actions.length ? '<div class="bog-feedback__actions">' + o.actions.map(function (a) {
        return '<button type="button" class="bog-btn" data-size="small" data-type="' + (a.type || "primary") + '">' + esc(a.label) + "</button>";
      }).join("") + "</div>" : "");
    region.appendChild(el);
    // visible ~4 s (~8 s with actions) after it has settled (the enter animation is 500ms)
    if (o.timeout !== 0) {
      var ms = o.timeout || (o.actions && o.actions.length ? 8000 : 4000);
      var wait = function () { setTimeout(function () { if (el.isConnected) dismiss(el); }, ms); };
      var enter = el.getAnimations ? el.getAnimations()[0] : null;
      if (enter) enter.finished.then(wait, function () {}); else setTimeout(wait, 500);
    }
    return el;
  }
  window.BOG = window.BOG || {};
  window.BOG.toast = toast;
})();

/* ---- Currency Input: pick a currency from its bottom sheet ---------------- */
(function () {
  document.addEventListener("click", function (e) {
    var item = e.target.closest(".bog-list-item[data-currency]");
    if (!item) return;
    var sheet = item.closest(".bog-sheet");
    var btn = sheet && sheet._opener && sheet._opener.closest && sheet._opener.closest(".bog-currency-input__currency");
    if (!btn) return;
    var code = item.getAttribute("data-currency");
    var flag = item.getAttribute("data-flag");
    var img = btn.querySelector("img");
    if (img && flag) img.src = flag;
    Array.prototype.forEach.call(btn.childNodes, function (n) { if (n.nodeType === 3 && n.textContent.trim()) n.textContent = code; });
    var field = btn.closest(".bog-currency-input");
    var sym = field && field.querySelector(".bog-currency-input__symbol");
    if (sym && item.hasAttribute("data-symbol")) sym.textContent = item.getAttribute("data-symbol");
    sheet.querySelectorAll(".bog-list-item[data-currency]").forEach(function (i) { i.setAttribute("aria-selected", i === item ? "true" : "false"); });
    if (field) field.dispatchEvent(new CustomEvent("currencychange", { bubbles: true, detail: { currency: code } }));
    setTimeout(function () { if (window.BOG && BOG.closeSheet) BOG.closeSheet(sheet); }, 120);
  });
})();

/* ---- Odometer number roll (components/odometer.css) ------------------------------------
   BOG.odometer(el, from, to, slow) — call after el's text is already `to`. Each digit becomes a
   0–9 strip that slides from its old digit to the new one (220 ms, cubic-bezier(0.24, 1.34, 0.38, 1),
   a springy overshoot) while sharpening from a 2 px blur (260 ms, ease-out). Digits line up from
   the right; new leading digits roll up from 0. el's offset parent must be positioned. */
(function () {
  var MOVE = 220, BLUR = 260;
  var reduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  var isDigit = function (c) { return c >= "0" && c <= "9"; };
  window.BOG = window.BOG || {};
  BOG.odometer = function (el, from, to, slow) {
    from = String(from); to = String(to);
    if (el._odo) { el._odo.remove(); el._odo = null; el.removeAttribute("data-odo"); }
    if (from === to || (reduce && reduce.matches) || !el.animate) return;
    var k = slow || 1, cs = getComputedStyle(el), fs = parseFloat(cs.fontSize);
    var layer = document.createElement("span");
    layer.className = "bog-odo";
    layer.setAttribute("aria-hidden", "true");
    // Same font as el — family, size, weight, figure style (BOG's digits are proportional by default)
    layer.style.cssText = "left:" + el.offsetLeft + "px;top:" + (el.offsetTop + (el.offsetHeight - fs) / 2) + "px;" +
      "font-family:" + cs.fontFamily + ";font-size:" + cs.fontSize + ";font-weight:" + cs.fontWeight + ";font-style:" + cs.fontStyle +
      ";font-variant-numeric:" + cs.fontVariantNumeric + ";font-feature-settings:" + cs.fontFeatureSettings +
      ";letter-spacing:" + cs.letterSpacing + ";line-height:1;color:" + cs.color + ";--_odo-move:" + MOVE * k + "ms";
    // Give every character the exact advance it has in el's real text (kerning included), so the
    // layer lines up with it and nothing shifts when the plain text comes back
    var widths = [], tn = el.firstChild;
    if (tn && tn.nodeType === 3 && el.childNodes.length === 1 && tn.nodeValue === to && document.createRange) {
      var rg = document.createRange(), xs = [];
      for (var c = 0; c < to.length; c++) { rg.setStart(tn, c); rg.setEnd(tn, c + 1); xs.push(rg.getBoundingClientRect()); }
      for (c = 0; c < to.length; c++) widths.push(c + 1 < to.length ? xs[c + 1].left - xs[c].left : xs[c].width);
      layer.style.left = el.offsetLeft + (xs[0].left - el.getBoundingClientRect().left) + "px";
    } else {                                      // fallback: measure each character on its own
      var chars = [];
      for (var c2 = 0; c2 < to.length; c2++) {
        var m = document.createElement("span");
        m.className = "bog-odo__sym";
        m.textContent = to[c2];
        layer.appendChild(m);
        chars.push(m);
      }
      el.parentNode.appendChild(layer);
      widths = chars.map(function (x) { return x.getBoundingClientRect().width; });
      layer.textContent = "";
    }
    el.parentNode.appendChild(layer);
    var shift = to.length - from.length, strips = [];
    for (var i = 0; i < to.length; i++) {
      var ch = to[i], old = from[i - shift];
      if (!isDigit(ch)) {
        var sym = document.createElement("span");
        sym.className = "bog-odo__sym";
        sym.textContent = ch;
        sym.style.width = widths[i] + "px";
        layer.appendChild(sym);
        continue;
      }
      var col = document.createElement("span"), strip = document.createElement("span");
      col.className = "bog-odo__col";
      col.style.width = widths[i] + "px";
      strip.className = "bog-odo__strip";
      strip.innerHTML = "<span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span><span>9</span>";
      var start = old && isDigit(old) ? +old : 0;
      strip.style.transition = "none";
      strip.style.transform = "translateY(" + -start * 1.5 + "em)";
      col.appendChild(strip);
      layer.appendChild(col);
      if (start !== +ch) strips.push([strip, +ch]);
    }
    el._odo = layer;
    el.setAttribute("data-odo", "");
    layer.offsetWidth;   // commit the start positions before sliding
    strips.forEach(function (s) {
      s[0].style.transition = "";
      s[0].style.transform = "translateY(" + -s[1] * 1.5 + "em)";
      s[0].animate({ filter: ["blur(2px)", "blur(0)"] }, { duration: BLUR * k, easing: "ease-out" });
    });
    // The overshoot settles within the transition; then show the plain text again
    setTimeout(function () {
      if (el._odo !== layer) return;
      layer.remove();
      el._odo = null;
      el.removeAttribute("data-odo");
    }, Math.max(MOVE, BLUR) * k + 40);
  };
})();

/* ---- Amount: the up/down selector switches currency --------------------------------
   Press the amount (button.bog-amount__main with a selector) → the next currency; ↑ / ↓ when
   focused → previous / next. Currencies come from the balances row (₾ $ € £), or from
   data-currencies="₾ $ €" when there is none. data-rates='{"₾":1,"$":0.37,"€":0.32}' converts
   the value (any base; rates are per the same unit); without rates only the symbol changes.
   The value rolls like an odometer (BOG.odometer: each digit's 0–9 strip slides, 220 ms springy,
   blur 2 px → 0); the symbol rolls vertically — the old one leaves 0.25 em and fades (167 / 83 ms),
   the new one comes from the other side 33 ms later. data-roll="simple" rolls the value that way too.
   Fires "currencychange" (detail: currency, value). BOG.amountCurrency(el, "€") sets one from code. */
(function () {
  var EASE = "cubic-bezier(0.33, 0, 0.25, 1)", MOVE = 167, FADE = 83, DELAY = 33;
  var reduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  function symbols(a) {
    var bal = a.querySelectorAll(".bog-amount__balance");
    if (bal.length) return [].map.call(bal, function (b) {
      var t = "";
      [].forEach.call(b.childNodes, function (n) { if (n.nodeType === 3) t += n.nodeValue; });
      return t.trim();
    });
    return (a.getAttribute("data-currencies") || "").split(/\s+/).filter(Boolean);
  }
  function rates(a) { try { return JSON.parse(a.getAttribute("data-rates")); } catch (e) { return null; } }
  function fmt(n) { return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function swap(el, text, dir, k) {
    if (!el || el.textContent === text) return;
    if ((reduce && reduce.matches) || !el.animate) { el.textContent = text; return; }
    var ghost = el.cloneNode(true);
    ghost.classList.add("bog-amount__ghost");
    ghost.setAttribute("aria-hidden", "true");
    // The outgoing copy stays where the old text was, even if the layout has already moved on
    var at = el._from || { left: el.offsetLeft, top: el.offsetTop };
    el._from = null;
    ghost.style.left = at.left + "px";
    ghost.style.top = at.top + "px";
    el.parentNode.appendChild(ghost);
    el.textContent = text;
    var d = dir * 0.25;   // next: the old one goes up, the new one comes from below
    ghost.animate({ transform: ["translateY(0)", "translateY(" + -d + "em)"] }, { duration: MOVE * k, easing: EASE, fill: "forwards" });
    ghost.animate({ opacity: [1, 0] }, { duration: FADE * k, easing: EASE, fill: "forwards" }).onfinish = function () {
      setTimeout(function () { ghost.remove(); }, (MOVE - FADE) * k);
    };
    el.animate({ transform: ["translateY(" + d + "em)", "translateY(0)"] }, { duration: MOVE * k, delay: DELAY * k, easing: EASE, fill: "backwards" });
    el.animate({ opacity: [0, 1] }, { duration: FADE * k, delay: DELAY * k, easing: EASE, fill: "backwards" });
  }
  /* Symbol and arrow follow the value: when its width changes (1,000.00 → 370.00) they glide to their
     new spot instead of jumping — same 220 ms springy curve as the odometer digits. Uses the
     `translate` property, so it combines with the symbol's own vertical roll (transform). */
  var GLIDE = "cubic-bezier(0.24, 1.34, 0.38, 1)", GLIDE_MS = 220;
  function places(a) {
    var main = a.querySelector(".bog-amount__main");
    return main ? [].filter.call(main.children, function (c) { return !c.classList.contains("bog-amount__ghost") && !c.classList.contains("bog-odo"); }) : [];
  }
  function glide(a, before, k) {
    (a._glide || []).forEach(function (g) { g.cancel(); });
    a._glide = [];
    if ((reduce && reduce.matches) || !document.body.animate) return;
    before.forEach(function (b) {
      var dx = b.x - b.el.getBoundingClientRect().left;
      if (Math.abs(dx) < 0.5) return;
      a._glide.push(b.el.animate({ translate: [dx + "px 0", "0 0"] }, { duration: GLIDE_MS * k, easing: GLIDE }));
    });
  }
  function set(a, cur, dir) {
    var list = symbols(a), curEl = a.querySelector(".bog-amount__currency"), valEl = a.querySelector(".bog-amount__value");
    if (!curEl || !list.length) return;
    var from = curEl.textContent.trim();
    if (cur === from) return;
    if (dir == null) dir = list.indexOf(cur) > list.indexOf(from) ? 1 : -1;
    var k = parseFloat(getComputedStyle(a).getPropertyValue("--bog-amount-slow")) || 1;
    // Where everything sits now (mid-glide included), and where the old symbol / value were in the layout
    var before = places(a).map(function (el) { return { el: el, x: el.getBoundingClientRect().left }; });
    (a._glide || []).forEach(function (g) { g.cancel(); });
    a._glide = [];
    curEl._from = { left: curEl.offsetLeft, top: curEl.offsetTop };
    if (valEl) valEl._from = { left: valEl.offsetLeft, top: valEl.offsetTop };
    var r = rates(a), value = valEl ? parseFloat(valEl.textContent.replace(/,/g, "")) : NaN;
    // Convert from a remembered base, so switching round the list never drifts by rounding
    if (r && r[from] && r[cur] && !isNaN(value)) {
      if (a._base == null || a._baseCur !== from || fmt(a._base * r[from]) !== valEl.textContent) a._base = value / r[from];
      value = a._base * r[cur];
      a._baseCur = cur;
      if (a.getAttribute("data-roll") === "simple" || a.hasAttribute("data-hidden") || !BOG.odometer) swap(valEl, fmt(value), dir, k);
      else {                                   // default: odometer digits (BOG.odometer)
        var was = valEl.textContent;
        valEl.textContent = fmt(value);
        BOG.odometer(valEl, was, valEl.textContent, k);
      }
    }
    swap(curEl, cur, dir, k);
    glide(a, before.filter(function (b) { return b.el !== valEl || a.getAttribute("data-align") === "center"; }), k);
    a.setAttribute("data-currency", cur);
    a.dispatchEvent(new CustomEvent("currencychange", { bubbles: true, detail: { currency: cur, value: isNaN(value) ? null : value } }));
  }
  function step(a, by) {
    var list = symbols(a), curEl = a.querySelector(".bog-amount__currency");
    if (!curEl || list.length < 2) return;
    var i = list.indexOf(curEl.textContent.trim());
    set(a, list[(i + by + list.length) % list.length], by);
  }
  function target(e) {
    var m = e.target.closest && e.target.closest("button.bog-amount__main");
    var a = m && m.closest(".bog-amount");
    return a && m.querySelector(".bog-amount__selector") && !a.hasAttribute("data-state") ? a : null;
  }
  document.addEventListener("click", function (e) { var a = target(e); if (a) step(a, 1); });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    var a = target(e);
    if (!a) return;
    e.preventDefault();
    step(a, e.key === "ArrowDown" ? 1 : -1);
  });
  window.BOG = window.BOG || {};
  BOG.amountCurrency = function (a, cur) { set(a, cur); };

  // Hidden amount (data-hidden): "......" on screen, and screen readers hear "Amount hidden" instead of
  // the real number (the value stays in the page for prototypes that toggle it back)
  function privacy(a) {
    var v = a.querySelector(".bog-amount__value");
    if (!v) return;
    var note = a.querySelector(".bog-amount__hidden-note"), hidden = a.hasAttribute("data-hidden");
    if (hidden) {
      v.setAttribute("aria-hidden", "true");
      if (!note) {
        note = document.createElement("span");
        note.className = "bog-amount__hidden-note bog-visually-hidden";
        note.textContent = "Amount hidden";
        v.parentNode.insertBefore(note, v);
      }
    } else {
      if (v.getAttribute("aria-hidden") === "true") v.removeAttribute("aria-hidden");
      if (note) note.remove();
    }
  }
  function privacyAll() { document.querySelectorAll(".bog-amount").forEach(privacy); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", privacyAll); else privacyAll();
  new MutationObserver(function (records) {
    records.forEach(function (r) {
      if (r.type === "attributes") privacy(r.target);
      else r.addedNodes.forEach(function (n) { if (n.nodeType === 1) { if (n.matches(".bog-amount")) privacy(n); n.querySelectorAll && n.querySelectorAll(".bog-amount").forEach(privacy); } });
    });
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-hidden"] });
})();

/* ---- Currency Input: size the amount to its text where field-sizing isn't supported */
(function () {
  if (window.CSS && CSS.supports && CSS.supports("field-sizing", "content")) return;
  var canvas = document.createElement("canvas").getContext("2d");
  function fit(input) {
    var cs = getComputedStyle(input);
    canvas.font = cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily;
    input.style.width = Math.ceil(canvas.measureText(input.value || input.placeholder || "").width + 2) + "px";
  }
  function all() { document.querySelectorAll(".bog-currency-input__value > .bog-field__input").forEach(fit); }
  document.addEventListener("input", function (e) { if (e.target.matches && e.target.matches(".bog-currency-input__value > .bog-field__input")) fit(e.target); });
  document.addEventListener("focusin", function (e) { if (e.target.matches && e.target.matches(".bog-currency-input__value > .bog-field__input")) fit(e.target); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(all); else all();
})();

/* ---- Number Input: − / + stepper -------------------------------------- */
(function () {
  function sync(field) {
    var input = field.querySelector(".bog-field__input");
    if (!input) return;
    var v = parseFloat(input.value), min = parseFloat(input.dataset.min), max = parseFloat(input.dataset.max);
    var down = field.querySelector('[data-step="down"]'), up = field.querySelector('[data-step="up"]');
    var off = input.disabled;
    if (down) down.disabled = off || (!isNaN(min) && !isNaN(v) && v <= min);
    if (up) up.disabled = off || (!isNaN(max) && !isNaN(v) && v >= max);
  }
  // Value roll (Component Motion Guidelines › Numeric Stepper, see number-input.css).
  // dir 1 (+) moves the digits down, -1 (−) moves them up.
  var EASE = "cubic-bezier(0.33, 0, 0.25, 1)", SHIFT = 3.75, MOVE = 167, FADE = 83, DELAY = 33;
  var reduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  function roll(field, input, from, to, dir) {
    // A tap during a roll replaces it. Show the input text again first, so the new layer
    // copies its real color instead of the transparent one used while rolling.
    var prev = field.querySelector(".bog-number-input__roll");
    if (prev) prev.remove();
    field.removeAttribute("data-rolling");
    if ((reduce && reduce.matches) || !input.animate) return;
    var cs = getComputedStyle(input), layer = document.createElement("span");
    layer.className = "bog-number-input__roll";
    layer.setAttribute("aria-hidden", "true");
    layer.style.cssText = "top:" + input.offsetTop + "px;left:" + input.offsetLeft + "px;width:" + input.offsetWidth +
      "px;height:" + cs.lineHeight + ";font:" + cs.font + ";letter-spacing:" + cs.letterSpacing + ";color:" + cs.color + ";text-align:" + cs.textAlign;
    // Only digits that differ at the same position roll (12 → 13 rolls just the "3").
    // Each layer holds the whole number with the other digits hidden, so everything stays aligned.
    function piece(text, other, same) {
      var s = document.createElement("span");
      for (var i = 0; i < text.length; i++) {
        var c = document.createElement("span");
        c.textContent = text[i];
        if ((text[i] === other[i]) !== same) c.style.visibility = "hidden";
        s.appendChild(c);
      }
      layer.appendChild(s);
      return s;
    }
    function move(a, b) { return { transform: ["translateY(" + a + "px)", "translateY(" + b + "px)"] }; }
    piece(to, from, true);
    var out = piece(from, to, false), inn = piece(to, from, false), d = dir * SHIFT;
    input.parentNode.appendChild(layer);
    field.setAttribute("data-rolling", "");
    out.animate(move(0, d), { duration: MOVE, easing: EASE, fill: "forwards" });
    out.animate({ opacity: [1, 0] }, { duration: FADE, easing: EASE, fill: "forwards" });
    inn.animate({ opacity: [0, 1] }, { duration: FADE, delay: DELAY, easing: EASE, fill: "backwards" });
    inn.animate(move(-d, 0), { duration: MOVE, delay: DELAY, easing: EASE, fill: "backwards" }).onfinish = function () {
      if (!layer.isConnected) return;
      layer.remove();
      field.removeAttribute("data-rolling");
    };
  }
  // Button press (Numeric Stepper "made with Scale", 362:9475): 100% → 90% in 167ms, then back to 100%
  // in 167ms with a slight overshoot.
  var PRESS = "cubic-bezier(0.33, 0, 0.25, 1)", RELEASE = "cubic-bezier(0.44, 0, 0.30, 2.08)";
  function bump(btn) {
    if ((reduce && reduce.matches) || !btn.animate) return;
    btn.animate([
      { transform: "scale(1)", easing: PRESS },
      { transform: "scale(0.9)", easing: RELEASE },
      { transform: "scale(1)" }
    ], { duration: 2 * MOVE });
  }
  document.addEventListener("mousedown", function (e) { if (e.target.closest(".bog-number-input [data-step]")) e.preventDefault(); });
  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".bog-number-input [data-step]");
    if (!btn) return;
    e.preventDefault();
    var field = btn.closest(".bog-number-input"), input = field.querySelector(".bog-field__input");
    bump(btn);
    var step = parseFloat(input.dataset.step) || 1, min = parseFloat(input.dataset.min), max = parseFloat(input.dataset.max);
    var v = (parseFloat(input.value) || 0) + (btn.dataset.step === "up" ? step : -step);
    if (!isNaN(min)) v = Math.max(min, v);
    if (!isNaN(max)) v = Math.min(max, v);
    var from = input.value, to = String(Math.round(v * 1e6) / 1e6);
    input.value = to;
    if (from !== "" && from !== to) roll(field, input, from, to, btn.dataset.step === "up" ? 1 : -1);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  document.addEventListener("input", function (e) { var f = e.target.closest && e.target.closest(".bog-number-input"); if (f) sync(f); });
  function all() { document.querySelectorAll(".bog-number-input").forEach(sync); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", all); else all();
})();

/* ---- Text fields: helper / error text tied to the input for screen readers -----------
   Every .bog-field (Text, Number, Currency, Password, Phone) and Currency Small Input: the message
   under the field gets an id and the input points to it with aria-describedby, so it's read
   together with the field; data-validation="error" sets aria-invalid="true"; the message is a
   polite live region, so a new error is announced when it appears. Kept in sync as fields,
   messages and data-validation change. */
(function () {
  var FIELD = ".bog-field, .bog-currency-small";
  var INPUT = ".bog-field__input, .bog-currency-small__input";
  var MSG = ":scope > .bog-field__message, :scope > .bog-currency-small__message";
  var n = 0;
  function link(field) {
    var input = field.querySelector(INPUT), msg = field.querySelector(MSG);
    if (!input) return;
    var ids = (input.getAttribute("aria-describedby") || "").split(/\s+/).filter(function (id) { return id && id.indexOf("bog-msg-") !== 0; });
    if (msg) {
      if (!msg.id) msg.id = "bog-msg-" + (++n);
      if (ids.indexOf(msg.id) < 0) ids.push(msg.id);
      if (!msg.hasAttribute("aria-live")) msg.setAttribute("aria-live", "polite");
    }
    if (ids.length) input.setAttribute("aria-describedby", ids.join(" ")); else input.removeAttribute("aria-describedby");
    if (field.getAttribute("data-validation") === "error") input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
  }
  function all(root) {
    if (root.matches && root.matches(FIELD)) link(root);
    if (root.querySelectorAll) root.querySelectorAll(FIELD).forEach(link);
  }
  function init() {
    all(document);
    new MutationObserver(function (records) {
      records.forEach(function (r) {
        var t = r.target.nodeType === 1 ? r.target : r.target.parentNode;
        var f = t && t.closest && t.closest(FIELD);
        if (f) link(f);
        r.addedNodes && r.addedNodes.forEach(function (a) { if (a.nodeType === 1) all(a); });
      });
    }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-validation"] });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();

/* ---- Password Input: show / hide + live requirements ------------------- */
(function () {
  document.addEventListener("mousedown", function (e) { if (e.target.closest(".bog-password-input__toggle")) e.preventDefault(); });
  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".bog-password-input__toggle");
    if (!btn) return;
    e.preventDefault();
    var input = btn.closest(".bog-password-input").querySelector(".bog-field__input");
    var show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.setAttribute("aria-pressed", show ? "true" : "false");
    btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
  });
  function check(input, final) {
    if (!input.id) return;
    document.querySelectorAll('.bog-password-rules[data-for="' + input.id + '"] [data-pattern]').forEach(function (item) {
      var ok = new RegExp(item.getAttribute("data-pattern")).test(input.value);
      if (ok) item.setAttribute("data-status", "positive");
      else if (final && input.value) item.setAttribute("data-status", "negative");
      else item.removeAttribute("data-status");
    });
  }
  document.addEventListener("input", function (e) { if (e.target.matches && e.target.matches(".bog-field__input")) check(e.target, false); });
  document.addEventListener("focusout", function (e) { if (e.target.matches && e.target.matches(".bog-field__input")) check(e.target, true); });
})();

/* ---- Phone Input: country picker sheet --------------------------------
   Tapping .bog-phone-input__country opens a built-in Bottom Sheet of countries (flag, name, code).
   Give the button data-sheet-open="your-sheet-id" to use your own sheet instead
   (rows: .bog-list-item with data-dial and data-flag). Change the list with BOG.countries. */
(function () {
  var script = document.currentScript;
  var base = script && script.src ? script.src.replace(/[^\/]*$/, "") : "bog-ui/";
  window.BOG = window.BOG || {};
  // [ISO code (flag file in assets/flags/), name, dial code, number format (X = digit)]
  BOG.countries = BOG.countries || [
    ["ge", "Georgia", "+995", "XXX XX XX XX"],
    ["am", "Armenia", "+374", "XX XXX XXX"],
    ["az", "Azerbaijan", "+994", "XX XXX XX XX"],
    ["fr", "France", "+33", "X XX XX XX XX"],
    ["de", "Germany", "+49", "XXX XXXXXXXX"],
    ["gr", "Greece", "+30", "XXX XXX XXXX"],
    ["il", "Israel", "+972", "XX XXX XXXX"],
    ["it", "Italy", "+39", "XXX XXX XXXX"],
    ["ru", "Russia", "+7", "XXX XXX XX XX"],
    ["tj", "Tajikistan", "+992", "XX XXX XXXX"],
    ["tr", "Turkey", "+90", "XXX XXX XX XX"],
    ["ua", "Ukraine", "+380", "XX XXX XX XX"],
    ["ae", "United Arab Emirates", "+971", "XX XXX XXXX"],
    ["gb", "United Kingdom", "+44", "XXXX XXXXXX"],
    ["us", "United States", "+1", "(XXX) XXX-XXXX"],
    ["uz", "Uzbekistan", "+998", "XX XXX XX XX"]
  ];
  function flagSrc(iso) { return base + "assets/flags/" + iso + ".svg"; }

  function builtInSheet() {
    var sheet = document.getElementById("bog-country-sheet");
    if (sheet) return sheet;
    sheet = document.createElement("div");
    sheet.className = "bog-sheet";
    sheet.id = "bog-country-sheet";
    sheet.hidden = true;
    sheet.innerHTML = '<div class="bog-sheet__panel" role="dialog" aria-modal="true" aria-label="Country code">' +
      '<header class="bog-sheet__nav"><div class="bog-sheet__heading"><h2 class="bog-sheet__title">Country code</h2></div></header>' +
      '<div class="bog-sheet__content" data-type="list"><div class="bog-list" role="listbox">' +
      BOG.countries.map(function (c) {
        return '<button type="button" class="bog-list-item" role="option" data-dial="' + c[2] + '" data-flag="' + flagSrc(c[0]) + '" aria-selected="false">' +
          '<span class="bog-flag" data-size="32"><img src="' + flagSrc(c[0]) + '" alt=""></span>' +
          '<span class="bog-list-item__content"><span class="bog-list-item__label">' + c[1] + '</span></span>' +
          '<span class="bog-list-item__end"><span class="bog-list-item__value">' + c[2] + '</span></span></button>';
      }).join("") + "</div></div></div>";
    return sheet;
  }

  // Open the built-in sheet (capture phase, so it runs before the generic sheet handlers)
  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".bog-phone-input__country");
    if (!btn || btn.hasAttribute("data-sheet-open")) return;
    e.preventDefault();
    var sheet = builtInSheet();
    var host = btn.closest(".bog-sheet-host") || document.body;
    if (sheet.parentNode !== host) host.appendChild(sheet);
    var code = btn.querySelector(".bog-phone-input__code");
    var current = code ? code.textContent.trim() : "";
    var img = btn.querySelector(".bog-flag img");
    var currentFlag = img ? img.getAttribute("src").split("/").pop() : "";
    sheet.querySelectorAll(".bog-list-item[data-dial]").forEach(function (i) {
      var same = i.getAttribute("data-dial") === current && (!currentFlag || i.getAttribute("data-flag").split("/").pop() === currentFlag);
      i.setAttribute("aria-selected", same ? "true" : "false");
    });
    if (BOG.openSheet) BOG.openSheet(sheet, btn);
  });

  // ---- Number formatting by country ----
  // International: the format comes from the selected country. National: data-format on .bog-phone-input
  // (default Georgia). The placeholder shows the format; digits beyond it are dropped.
  var DEFAULT_FORMAT = "XXX XX XX XX";
  function countryOf(field) {
    var btn = field.querySelector(".bog-phone-input__country");
    if (!btn) return null;
    var img = btn.querySelector(".bog-flag img");
    var iso = img ? (img.getAttribute("src") || "").split("/").pop().replace(/\.svg.*$/, "") : "";
    var code = btn.querySelector(".bog-phone-input__code");
    var dial = code ? code.textContent.trim() : "";
    return BOG.countries.filter(function (c) { return c[0] === iso; })[0] ||
           BOG.countries.filter(function (c) { return c[2] === dial; })[0] || null;
  }
  function formatOf(field) {
    var c = countryOf(field);
    return (c && c[3]) || field.getAttribute("data-format") || DEFAULT_FORMAT;
  }
  function applyFormat(digits, format) {
    var out = "", d = 0;
    for (var i = 0; i < format.length && d < digits.length; i++) {
      if (format[i] === "X") out += digits[d++];
      else out += format[i];
    }
    return out;
  }
  function formatField(field, keepCaret) {
    var input = field.querySelector(".bog-field__input");
    if (!input) return;
    var format = formatOf(field);
    var max = (format.match(/X/g) || []).length;
    if (input.placeholder !== format) input.placeholder = format;
    var caret = keepCaret && input === document.activeElement ? input.selectionStart : null;
    var digitsBefore = caret == null ? 0 : input.value.slice(0, caret).replace(/\D/g, "").length;
    var digits = input.value.replace(/\D/g, "").slice(0, max);
    var next = applyFormat(digits, format);
    if (next === input.value) return;
    input.value = next;
    if (caret != null) {
      var pos = 0, seen = 0;
      while (pos < next.length && seen < digitsBefore) { if (/\d/.test(next[pos])) seen++; pos++; }
      input.setSelectionRange(pos, pos);
    }
  }
  BOG.formatPhone = formatField;
  document.addEventListener("input", function (e) {
    var field = e.target.closest && e.target.closest(".bog-phone-input");
    if (field && e.target.matches(".bog-field__input")) formatField(field, true);
  });
  document.addEventListener("countrychange", function (e) {
    if (e.target.matches && e.target.matches(".bog-phone-input")) formatField(e.target, false);
  });
  // Number side: digits-only keyboard on phones (iOS/Android number pad), whatever the markup says
  function numericKeyboard(field) {
    var input = field.querySelector(".bog-field__input");
    if (!input) return;
    if (input.getAttribute("inputmode") !== "numeric") input.setAttribute("inputmode", "numeric");
    if (!input.hasAttribute("autocomplete")) input.setAttribute("autocomplete", "tel-national");
  }
  // Country side: never focuses the number input; closes the keyboard if it's open, then the sheet opens
  function countryPress(e) {
    var btn = e.target.closest && e.target.closest(".bog-phone-input__country");
    if (!btn) return;
    e.preventDefault();                       // keep the tap from focusing the input (no keyboard)
    var input = btn.closest(".bog-phone-input").querySelector(".bog-field__input");
    if (input && document.activeElement === input) input.blur();
  }
  // The field is a <label> and its first control is the country button, so the browser would
  // forward every tap on the number side to the button (opening the sheet). Send it to the input.
  document.addEventListener("click", function (e) {
    var box = e.target.closest && e.target.closest(".bog-phone-input .bog-field__box");
    if (!box || e.target.closest(".bog-phone-input__country, .bog-field__clear, .bog-field__input")) return;
    var input = box.querySelector(".bog-field__input");
    if (!input || input.disabled) return;
    e.preventDefault();                       // no label activation of the country button
    input.focus();                            // inside the tap, so phones open the (numeric) keyboard
  }, true);
  document.addEventListener("pointerdown", countryPress, true);
  document.addEventListener("mousedown", countryPress, true);
  document.addEventListener("focusin", function (e) {
    var field = e.target.closest && e.target.closest(".bog-phone-input");
    if (field) numericKeyboard(field);
  });
  function formatAll() { document.querySelectorAll(".bog-phone-input").forEach(function (f) { numericKeyboard(f); formatField(f, false); }); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", formatAll); else formatAll();

  // Picking a row sets the flag + code on the button that opened the sheet
  document.addEventListener("click", function (e) {
    var item = e.target.closest(".bog-list-item[data-dial]");
    if (!item) return;
    var sheet = item.closest(".bog-sheet");
    var btn = sheet && sheet._opener && sheet._opener.closest && sheet._opener.closest(".bog-phone-input__country");
    if (!btn) return;
    var img = btn.querySelector(".bog-flag img"), flag = item.getAttribute("data-flag");
    if (img && flag) img.src = flag;
    var code = btn.querySelector(".bog-phone-input__code");
    if (code) code.textContent = item.getAttribute("data-dial");
    sheet.querySelectorAll(".bog-list-item[data-dial]").forEach(function (i) { i.setAttribute("aria-selected", i === item ? "true" : "false"); });
    var field = btn.closest(".bog-phone-input");
    var label = item.querySelector(".bog-list-item__label");
    if (field) field.dispatchEvent(new CustomEvent("countrychange", { bubbles: true, detail: { dial: item.getAttribute("data-dial"), country: label ? label.textContent : "" } }));
    setTimeout(function () { if (BOG.closeSheet) BOG.closeSheet(sheet); }, 120);
  });
})();

/* ---- Modal Dialog ------------------------------------------------------ */
(function () {
  function resolve(m) { return typeof m === "string" ? document.getElementById(m) : m; }
  // Modals opened by openModal, newest last. Escape closes the newest; static mockups that are
  // only marked data-open in the HTML aren't in here, so it leaves them alone.
  var stack = [];
  function openModal(modal, opener) {
    modal = resolve(modal);
    if (!modal || modal.hasAttribute("data-open")) return;
    modal._opener = opener || document.activeElement;
    modal._closing = null;
    if (modal.hidden) { modal.hidden = false; modal.getBoundingClientRect(); }
    // Reopened while closing: swap the state in one go so it animates back from where it is
    modal.removeAttribute("data-closing");
    modal.setAttribute("data-open", "");
    stack.push(modal);
    var dialog = modal.querySelector(".bog-modal__dialog");
    if (dialog) { if (!dialog.hasAttribute("tabindex")) dialog.setAttribute("tabindex", "-1"); setTimeout(function () { dialog.focus({ preventScroll: true }); }, 50); }
  }
  function closeModal(modal) {
    modal = resolve(modal) || document.querySelector(".bog-modal[data-open]");
    if (!modal || !modal.hasAttribute("data-open")) return;
    // Close motion (modal.css) runs while data-closing is set; hide once the overlay and dialog
    // transitions are done (none under reduced motion, so it hides right away).
    modal.removeAttribute("data-open");
    modal.setAttribute("data-closing", "");
    stack = stack.filter(function (m) { return m !== modal; });
    var token = modal._closing = {}, dialog = modal.querySelector(".bog-modal__dialog");
    var anims = modal.getAnimations ? modal.getAnimations().concat(dialog ? dialog.getAnimations() : []) : [];
    Promise.all(anims.map(function (a) { return a.finished.catch(function () {}); })).then(function () {
      if (modal._closing !== token || modal.hasAttribute("data-open")) return;
      modal.hidden = true;
      modal.removeAttribute("data-closing");
    });
    if (modal._opener && modal._opener.focus) modal._opener.focus({ preventScroll: true });
    modal.dispatchEvent(new CustomEvent("modalclose", { bubbles: true }));
  }
  document.addEventListener("click", function (e) {
    var opener = e.target.closest("[data-modal-open]");
    if (opener) { e.preventDefault(); openModal(opener.getAttribute("data-modal-open"), opener); return; }
    var closer = e.target.closest("[data-modal-close]");
    if (closer && closer.closest(".bog-modal")) { closeModal(closer.closest(".bog-modal")); return; }
    if (e.target.classList && e.target.classList.contains("bog-modal") && e.target.getAttribute("data-dismiss") !== "false") closeModal(e.target);
  });
  // Escape closes only the newest modal. It runs first (capture) and stops the key there, so a
  // Bottom Sheet under the modal stays open (one Escape = one layer).
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" || !stack.length) return;
    closeModal(stack[stack.length - 1]);
    e.stopImmediatePropagation();
  }, true);
  window.BOG = window.BOG || {};
  window.BOG.openModal = openModal;
  window.BOG.closeModal = closeModal;
})();

/* ---- Code Input + Keypad ---------------------------------------------------
   .bog-code shows a code in cells; with a .bog-code__input it follows the phone
   keyboard (and SMS autofill), with a .bog-keypad[data-for] it follows the keypad.
   Fires "codechange" and "codecomplete" (detail.value) on the .bog-code. */
(function () {
  function cells(el) { return el.querySelectorAll(".bog-code__cell"); }
  function render(el, value) {
    var c = cells(el), masked = el.hasAttribute("data-mask");
    c.forEach(function (cell, i) {
      var d = value.charAt(i);
      cell.textContent = d && !masked ? d : "";
      cell.toggleAttribute("data-filled", !!d);
      cell.toggleAttribute("data-active", i === Math.min(value.length, c.length - 1) && value.length < c.length);
    });
  }
  function setCode(el, value) {
    if (typeof el === "string") el = document.getElementById(el);
    if (!el) return;
    var max = cells(el).length;
    value = String(value || "").replace(/\D/g, "").slice(0, max);
    var prev = el._code || "";
    el._code = value;
    var input = el.querySelector(".bog-code__input");
    if (input && input.value !== value) input.value = value;
    if (value.length > prev.length) el.removeAttribute("data-validation");
    render(el, value);
    if (value !== prev) {
      el.dispatchEvent(new CustomEvent("codechange", { bubbles: true, detail: { value: value } }));
      if (value.length === max) el.dispatchEvent(new CustomEvent("codecomplete", { bubbles: true, detail: { value: value } }));
    }
  }
  document.querySelectorAll(".bog-code").forEach(function (el) { el._code = ""; render(el, ""); });
  document.addEventListener("input", function (e) {
    if (e.target.matches(".bog-code__input")) setCode(e.target.closest(".bog-code"), e.target.value);
  });

  // Keyboard Numeric (.bog-keypad) aimed at a Code Input: types into its cells.
  // Pads aimed at a plain input are handled by the Keyboard Numeric block.
  function codeOf(pad) {
    var el = pad && document.getElementById(pad.getAttribute("data-for"));
    return el && el.classList.contains("bog-code") ? el : null;
  }
  function press(el, key) {
    if (el.getAttribute("data-state") === "loading") return;
    var v = el._code || "";
    if (key === "back" || key === "backspace") setCode(el, v.slice(0, -1));
    else if (/^\d$/.test(key)) setCode(el, v + key);
  }
  document.addEventListener("click", function (e) {
    var key = e.target.closest && e.target.closest(".bog-keypad__key");
    var el = key && codeOf(key.closest(".bog-keypad"));
    if (el) press(el, key.getAttribute("data-key") || key.value);
  });
  // Desktop: number keys and Backspace type into the visible keypad's Code Input
  document.addEventListener("keydown", function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey || (e.target.matches && e.target.matches("input, textarea"))) return;
    var key = /^[0-9]$/.test(e.key) ? e.key : e.key === "Backspace" ? "back" : null;
    if (!key) return;
    var pad = Array.prototype.find.call(document.querySelectorAll(".bog-keypad"), function (p) { return p.offsetParent !== null && !p.closest("[inert]") && codeOf(p); });
    if (pad) { e.preventDefault(); press(codeOf(pad), key); }
  });

  window.BOG = window.BOG || {};
  window.BOG.setCode = setCode;
})();

/* ---- Menu (pill trigger + iOS pull-down) -----------------------------------
   Tap the trigger to open; picking a row moves the checkmark, updates the trigger
   text and fires "menuchange" (detail.value, detail.label) on the .bog-menu. */
(function () {
  function close(menu) {
    if (!menu || !menu.hasAttribute("data-open")) return;
    menu.removeAttribute("data-open");
    var t = menu.querySelector(".bog-menu__trigger"); if (t) t.setAttribute("aria-expanded", "false");
  }
  function closeAll(except) { document.querySelectorAll(".bog-menu[data-open]").forEach(function (m) { if (m !== except) close(m); }); }
  function select(menu, value) {
    var item = menu.querySelector('.bog-menu__item[data-value="' + value + '"]');
    if (!item) return;
    menu.querySelectorAll(".bog-menu__item").forEach(function (i) { i.setAttribute("aria-checked", i === item ? "true" : "false"); });
    var v = menu.querySelector(".bog-menu__value"); if (v) v.textContent = item.getAttribute("data-label") || item.textContent.trim();
  }
  document.addEventListener("click", function (e) {
    var trigger = e.target.closest(".bog-menu__trigger");
    var item = e.target.closest(".bog-menu__item");
    if (trigger) {
      var menu = trigger.closest(".bog-menu"), open = !menu.hasAttribute("data-open");
      closeAll(menu);
      menu.toggleAttribute("data-open", open);
      trigger.setAttribute("aria-expanded", String(open));
      return;
    }
    if (item) {
      var m = item.closest(".bog-menu"), value = item.getAttribute("data-value"), was = item.getAttribute("aria-checked") === "true";
      select(m, value);
      setTimeout(function () { close(m); }, 80);
      if (!was) m.dispatchEvent(new CustomEvent("menuchange", { bubbles: true, detail: { value: value, label: item.getAttribute("data-label") || item.textContent.trim() } }));
      return;
    }
    if (!e.target.closest(".bog-menu__panel")) closeAll();
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeAll(); });

  window.BOG = window.BOG || {};
  window.BOG.selectMenu = function (menu, value) { if (typeof menu === "string") menu = document.getElementById(menu); if (menu) select(menu, value); };
  window.BOG.closeMenu = closeAll;
})();

/* ---- Input motion: Default ⇄ Active, Error ------------------------------
   Figma: Component Motion Guidelines › Input Active (2274:961), Input Error (2274:2662),
   Message → Error (3090:12182). Runs on every .bog-field (Text, Number, Currency, Password, Phone)
   and the Currency Small Input (border fade on focus + error motion; it has no floating label).
   Active → Default plays the Default → Active motion backwards. Off under prefers-reduced-motion. */
(function () {
  var reduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  function still() { return (reduce && reduce.matches) || !document.documentElement.animate; }

  // Easings [x1, y1, x2, y2] from the guides
  var E = {
    ringA: [0.33, 0, 0.16, 1], label: [0.33, 0, 0.67, 1],
    phScale: [0.33, 0, 0.26, 1], phSettle: [0.17, 0, 0.83, 1], ph: [0.33, 0, 0.17, 1],
    errW: [0.33, 0, 0.67, 1], shake: [0.33, 0, 0.27, 1], errMsg: [0.33, 0, 0.21, 1],
    msgOut: [0.33, 0, 0, 1], msgInY: [0.33, 0, 0.07, 1], msgInA: [0.33, 0, 0.67, 1]
  };
  var FOCUS_MS = 250, DELAY = 17;   // Default → Active is 250ms; placeholder and caret start 17ms in
  // Fields that get this motion: Text Input–based fields, and the Currency Small Input (no floating label,
  // so only its border and error motion apply)
  var FIELD = ".bog-field, .bog-currency-small", INPUT = ".bog-field__input, .bog-currency-small__input";
  var BOX = ".bog-field__box, .bog-currency-small__box", MSG = ":scope > :is(.bog-field__message, .bog-currency-small__message)";

  function css(e) { return e === "linear" ? "linear" : "cubic-bezier(" + e.join(", ") + ")"; }
  function rev(e) { return e === "linear" ? e : [1 - e[2], 1 - e[3], 1 - e[0], 1 - e[1]]; }
  function bez(e) {
    if (e === "linear") return function (t) { return t; };
    function f(a, b, u) { var v = 1 - u; return 3 * v * v * u * a + 3 * v * u * u * b + u * u * u; }
    return function (t) {
      if (t <= 0) return 0;
      if (t >= 1) return 1;
      var lo = 0, hi = 1, u = t;
      for (var i = 0; i < 30; i++) {
        var x = f(e[0], e[2], u);
        if (Math.abs(x - t) < 1e-5) break;
        if (x < t) lo = u; else hi = u;
        u = (lo + hi) / 2;
      }
      return f(e[1], e[3], u);
    };
  }
  // Value of segments [from, to, ms, easing] at t ms
  function valueAt(segs, t) {
    for (var i = 0; i < segs.length; i++) {
      var g = segs[i];
      if (t <= g[2]) return g[0] + (g[1] - g[0]) * bez(g[3])(Math.max(0, t) / g[2]);
      t -= g[2];
    }
    return segs[segs.length - 1][1];
  }
  // Animate one CSS property through segments. o.reverse plays it backwards inside o.total ms;
  // o.fmt turns a number into the CSS value.
  function track(el, prop, segs, delay, o) {
    var len = segs.reduce(function (s, g) { return s + g[2]; }, 0);
    if (o.reverse) {
      delay = o.total - delay - len;
      segs = segs.slice().reverse().map(function (g) { return [g[1], g[0], g[2], rev(g[3])]; });
    }
    var frames = [], at = 0, fmt = (o.fmt && o.fmt[prop]) || String;
    segs.forEach(function (g) {
      var k = { offset: at / len, easing: css(g[3]) };
      k[prop] = fmt(g[0]);
      frames.push(k);
      at += g[2];
    });
    var end = { offset: 1 };
    end[prop] = fmt(segs[segs.length - 1][1]);
    frames.push(end);
    // Helper layers (copies, drawn caret) can finish before the whole motion does and are removed
    // only then: they hold their last frame so they don't pop back in meanwhile.
    var helper = el.classList.contains("bog-field__ghost") || el.classList.contains("bog-field__caret");
    return el.animate(frames, { duration: len, delay: delay, fill: helper ? "both" : "backwards" });
  }

  // Colors as [r, g, b, a]
  var ctx = document.createElement("canvas").getContext("2d");
  function color(s) {
    ctx.fillStyle = "#000";
    ctx.fillStyle = String(s).trim() || "transparent";
    var v = ctx.fillStyle;
    if (v[0] === "#") return [parseInt(v.substr(1, 2), 16), parseInt(v.substr(3, 2), 16), parseInt(v.substr(5, 2), 16), 1];
    var m = v.match(/[\d.]+/g);
    return [+m[0], +m[1], +m[2], m[3] == null ? 1 : +m[3]];
  }
  function mix(a, b, k) {
    var from = a[3] ? a : [b[0], b[1], b[2], 0], to = b[3] ? b : [a[0], a[1], a[2], 0];
    return from.map(function (v, i) { return v + (to[i] - v) * k; });
  }
  function rgba(c) { return "rgba(" + Math.round(c[0]) + ", " + Math.round(c[1]) + ", " + Math.round(c[2]) + ", " + c[3].toFixed(3) + ")"; }
  // Border (inset box-shadow) sampled at 60fps, so width, color and opacity keep their own curves
  function ring(box, ms, at) {
    var frames = [];
    for (var t = 0; ; t = Math.min(ms, t + 1000 / 60)) {
      var r = at(t);
      frames.push({ offset: t / ms, boxShadow: "inset 0 0 0 " + r[0].toFixed(3) + "px " + rgba(r[1]) });
      if (t >= ms) break;
    }
    return box.animate(frames, { duration: ms });
  }
  function ringOf(field) {
    var s = getComputedStyle(field);
    return { w: parseFloat(s.getPropertyValue("--_border-w")) || 0, c: color(s.getPropertyValue("--_border")) };
  }

  // Put a helper layer exactly over rect (viewport coords), inside host
  function place(el, host, rect) {
    el.style.left = "0px";
    el.style.top = "0px";
    host.appendChild(el);
    var r = el.getBoundingClientRect();
    el.style.left = (rect.left - r.left) + "px";
    el.style.top = (rect.top - r.top) + "px";
    return el;
  }
  function rel(r, to) { return { left: r.left - to.left, top: r.top - to.top, width: r.width, height: r.height }; }
  function abs(r, to) { return { left: r.left + to.left, top: r.top + to.top, width: r.width, height: r.height }; }
  // The element in .bog-field__text that holds the input (the input, or e.g. the currency value row)
  function rowOf(input) {
    var n = input;
    while (n.parentElement && !n.parentElement.classList.contains("bog-field__text")) n = n.parentElement;
    return n.parentElement ? n : input;
  }
  function done(anims, then) {
    Promise.all(anims.map(function (a) { return a.finished.catch(function () {}); })).then(then);
  }
  function stop(field) {
    (field._motion || []).forEach(function (a) { a.cancel(); });
    (field._motionEls || []).forEach(function (el) { el.remove(); });
    field._motion = field._motionEls = null;
    var input = field.querySelector(INPUT);
    if (input) input.style.caretColor = "";
    field.removeAttribute("data-moving");
  }

  // ---- Default ⇄ Active -----------------------------------------------------
  function toggle(field, on) {
    stop(field);
    var input = field.querySelector(INPUT), box = field.querySelector(BOX);
    if (still() || !input || !box || input.disabled || field.hasAttribute("data-state")) return;
    var label = field.querySelector(".bog-field__label"), row = rowOf(input);
    var o = { reverse: !on, total: FOCUS_MS }, anims = [], els = [];
    var bx = box.getBoundingClientRect(), s = getComputedStyle(field);
    field.setAttribute("data-moving", "");   // label font-size jumps; the motion scales it instead

    // Input container: the 1.6px border only fades in (250ms); its width doesn't animate.
    // Only from a plain, borderless rest.
    if (!field.hasAttribute("data-validation") && !input.readOnly) {
      var c = color(s.getPropertyValue("--_focus").trim() || s.getPropertyValue("--border-selected-neutral-strong")), w = parseFloat(s.getPropertyValue("--border-width-trick")) || 1.6;
      anims.push(ring(box, FOCUS_MS, function (t) {
        if (!on) t = FOCUS_MS - t;
        return [w, [c[0], c[1], c[2], c[3] * valueAt([[0, 1, 250, E.ringA]], t)]];
      }));
    }

    // Label, placeholder and caret move only when the field is empty (otherwise the label stays up)
    if (input.value === "" && label) {
      if (on) {
        var ir = input.getBoundingClientRect(), right = /right|end/.test(getComputedStyle(input).textAlign);
        field._geo = {
          dy: row.offsetHeight / 2,
          row: rel(row.getBoundingClientRect(), bx),
          caret: rel({ left: right ? ir.right - 2 : ir.left, top: ir.top, width: 2, height: ir.height }, bx),
          font: getComputedStyle(input).font,
          ph: getComputedStyle(input, "::placeholder").color,
          caretColor: getComputedStyle(input).caretColor
        };
      }
      var g = field._geo || { dy: 10 };
      var R = (parseFloat(s.getPropertyValue("--body-large-size")) || 16) / (parseFloat(s.getPropertyValue("--label-xsmall-size")) || 11);

      // Label: big → small with a 95% undershoot; rises by half the value row
      if (label) {
        var lo = { reverse: !on, total: FOCUS_MS, fmt: {
          scale: function (v) { return String(on ? v : v / R); },
          translate: function (v) { return "0 " + (on ? v : v - g.dy) + "px"; } } };
        anims.push(track(label, "scale", [[R, 0.95, 100, E.label], [0.95, 1, 100, E.label]], 0, lo));
        anims.push(track(label, "translate", [[g.dy, -0.34, 100, E.label], [-0.34, 0, 100, E.label]], 0, lo));
      }

      // Placeholder: 80% → 105% → 100%, rises 10px, fades in. On blur the row is already collapsed,
      // so a copy of the placeholder plays it backwards.
      var ph = on ? row : null;
      if (!on && g.row && input.placeholder.trim()) {
        ph = document.createElement("span");
        ph.className = "bog-field__ghost";
        ph.textContent = input.placeholder;
        ph.style.cssText += ";font:" + g.font + ";color:" + g.ph + ";height:" + g.row.height + "px;line-height:" + g.row.height + "px";
        els.push(place(ph, box, abs(g.row, bx)));
      }
      if (ph) {
        var po = { reverse: !on, total: FOCUS_MS, fmt: { translate: function (v) { return "0 " + v + "px"; } } };
        anims.push(track(ph, "scale", [[0.8, 1.05, 100, E.phScale], [1.05, 1, 100, E.phSettle]], DELAY, po));
        anims.push(track(ph, "translate", [[10, -1, 100, E.ph], [-1, 0, 100, E.ph]], DELAY, po));
        anims.push(track(ph, "opacity", [[0, 1, 150, E.ph]], DELAY, po));
      }

      // Caret: only fades in, with the placeholder (no scale or movement). A drawn caret; the real one
      // is hidden meanwhile.
      if (g.caret) {
        var caret = document.createElement("span");
        caret.className = "bog-field__caret";
        caret.style.cssText += ";width:" + g.caret.width + "px;height:" + g.caret.height + "px;background:" + g.caretColor;
        els.push(place(caret, box, abs(g.caret, bx)));
        if (on) input.style.caretColor = "transparent";
        anims.push(track(caret, "opacity", [[0, 1, 150, E.ph]], DELAY, o));
      }
    }

    field._motion = anims;
    field._motionEls = els;
    done(anims, function () { if (field._motion === anims) stop(field); });
  }
  function fieldOf(el) { return el && el.closest ? el.closest(FIELD) : null; }
  document.addEventListener("focusin", function (e) {
    var f = fieldOf(e.target);
    if (f && !f.classList.contains("bog-field__ghost") && fieldOf(e.relatedTarget) !== f) toggle(f, true);
  });
  document.addEventListener("focusout", function (e) {
    var f = fieldOf(e.target);
    if (f && !f.classList.contains("bog-field__ghost") && fieldOf(e.relatedTarget) !== f) toggle(f, false);
  });

  // ---- Error -----------------------------------------------------------------
  var observer;
  function snap(field) {
    var m = field.querySelector(MSG);
    return { v: field.getAttribute("data-validation"), msg: m ? m.outerHTML : null };
  }
  // Border before the change: briefly put the old validation back and read it
  function ringBefore(field, v) {
    var now = field.getAttribute("data-validation");
    if (v == null) field.removeAttribute("data-validation"); else field.setAttribute("data-validation", v);
    var r = ringOf(field);
    field.setAttribute("data-validation", now);
    observer.takeRecords();
    return r;
  }
  function errorIn(field, before) {
    var box = field.querySelector(BOX);
    if (still() || !box || field.hasAttribute("data-state")) return;
    (field._errMotion || []).forEach(function (a) { a.cancel(); });
    (field._errEls || []).forEach(function (el) { el.remove(); });
    var start = ringBefore(field, before.v), end = ringOf(field), anims = [], els = [];

    // Container: color → error (100ms, linear), border → 3px → resting width, shake 3.33px right, left, back
    anims.push(ring(box, 450, function (t) {
      return [valueAt([[start.w, 3, 100, E.errW], [3, end.w, 250, E.errW]], t), mix(start.c, end.c, Math.min(1, t / 100))];
    }));
    anims.push(track(box, "translate", [[0, 3.33, 150, E.shake], [3.33, -3.33, 150, E.shake], [-3.33, 0, 150, E.shake]], 0,
      { fmt: { translate: function (v) { return v + "px 0"; } } }));

    var msg = field.querySelector(MSG);
    var y = { fmt: { translate: function (v) { return "0 " + v + "px"; } } };
    if (msg && before.msg) {
      // Helper text → error text: the old message drops away, the new one drops in 50ms later
      var wrap = document.createElement("div");
      wrap.innerHTML = before.msg;
      var old = wrap.firstElementChild, mr = msg.getBoundingClientRect();
      var ghost = document.createElement("div");
      ghost.className = (field.classList.contains("bog-currency-small") ? "bog-currency-small" : "bog-field") + " bog-field__ghost";
      if (before.v) ghost.setAttribute("data-validation", before.v);
      if (field.hasAttribute("data-appearance")) ghost.setAttribute("data-appearance", field.getAttribute("data-appearance"));
      ghost.style.width = mr.width + "px";
      ghost.style.whiteSpace = "normal";
      ghost.appendChild(old);
      els.push(place(ghost, field, mr));
      anims.push(track(ghost, "translate", [[0, 8.62, 167, E.msgOut]], 0, y));
      anims.push(track(ghost, "opacity", [[1, 0, 83, E.msgOut]], 0, {}));
      anims.push(track(msg, "translate", [[-4.58, 0, 167, E.msgInY]], 50, y));
      anims.push(track(msg, "opacity", [[0, 1, 83, E.msgInA]], 50, {}));
    } else if (msg) {
      // No message before: the error message drops in past its spot and settles back
      anims.push(track(msg, "translate", [[-3.17, 3.33, 150, E.errMsg], [3.33, 0, 150, E.errMsg]], DELAY, y));
      anims.push(track(msg, "opacity", [[0, 1, 150, E.errMsg]], DELAY, {}));
    }
    observer.takeRecords();
    field._errMotion = anims;
    field._errEls = els;
    done(anims, function () {
      if (field._errMotion !== anims) return;
      els.forEach(function (el) { el.remove(); });
      field._errMotion = field._errEls = null;
    });
  }

  function init() {
    document.querySelectorAll(FIELD).forEach(function (f) { f._bogState = snap(f); });
    observer = new MutationObserver(function (records) {
      var touched = [];
      records.forEach(function (r) {
        var t = r.target.nodeType === 1 ? r.target : r.target.parentNode;
        if (!t || !t.closest || t.closest(".bog-field__ghost")) return;
        r.addedNodes.forEach(function (n) {
          if (n.nodeType !== 1 || n.classList.contains("bog-field__ghost")) return;
          var list = n.matches(FIELD) ? [n] : [];
          n.querySelectorAll(FIELD).forEach(function (f) { list.push(f); });
          list.forEach(function (f) { if (!f._bogState) f._bogState = snap(f); });
        });
        var f = t.closest(FIELD);
        if (f && touched.indexOf(f) < 0) touched.push(f);
      });
      touched.forEach(function (f) {
        var before = f._bogState, now = snap(f);
        if (!before) { f._bogState = now; return; }
        if (now.v === "error" && before.v !== "error") errorIn(f, before);
        f._bogState = now;
      });
    });
    observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["data-validation"] });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();

  // Shared with the other component motions below
  window.BOG = window.BOG || {};
  window.BOG.motion = { still: still, track: track, valueAt: valueAt, css: css, color: color, rgba: rgba, done: done };
})();

/* ---- Account Picker motion ----------------------------------------------
   Figma: Component Motion Guidelines › Account Picker page — chips on (919:13920) / off (919:15157),
   Select (951:18757), Minimize (961:19904), page load (1241:4887), Error (1424:4099).
   Off under prefers-reduced-motion. BOG.pickerPageIn(page) plays the page load. */
(function () {
  var M = window.BOG.motion;
  var E = {
    chipW: [0.33, 0, 0.16, 1], chipSettle: [0.17, 0, 0.16, 1], checkX: [0.33, 0, 0.1, 1], checkDraw: [0.33, 0, 0.07, 1],
    chipOff: [0.17, 0, 0.67, 1], chipOffSettle: [0.33, 0, 0.67, 1],
    open: [0.33, 0, 0.28, 1], borderIn: [0.33, 0, 0.67, 1],
    closeChips: [0.72, 0, 0.67, 1], closeFade: [0.91, 0, 0.67, 1], closeSettle: [1, 0, 0.67, 1],
    page: [0.33, 0, 0.12, 1], shake: [0.33, 0, 0.25, 1]
  };
  function px(v) { return v + "px"; }
  function y(v) { return "0 " + v + "px"; }
  function x(v) { return v + "px 0"; }
  function run(el, list) {
    (el._pickerMotion || []).forEach(function (a) { a.cancel(); });
    el._pickerMotion = list;
    return list;
  }
  // Border (inset box-shadow) with its color at a given alpha
  function border(shadow, alpha) {
    var m = /^(rgba?\([^)]*\))\s+(.*)$/.exec(shadow || "");
    if (!m) return null;
    var c = M.color(m[1]);
    return M.rgba([c[0], c[1], c[2], c[3] * alpha]) + " " + m[2];
  }

  // State is read in the capture phase (before the library's own click / key handlers change it)
  // and animated from a window listener, which runs after them.
  var pending = [];
  function after() { var jobs = pending; pending = []; jobs.forEach(function (j) { j(); }); }
  window.addEventListener("click", after);
  window.addEventListener("keydown", after);

  // ---- Currency chips: on / off ------------------------------------------------
  function chipOn(chip, w0, w1) {
    var bg = getComputedStyle(chip).backgroundColor;
    chip.setAttribute("data-moving", "");
    var list = run(chip, [
      // Shape grows past its new width by 3px, then settles; color white → selected (linear)
      M.track(chip, "width", [[w0, w1 + 3, 200, E.chipW], [w1 + 3, w1, 50, E.chipSettle]], 0, { fmt: { width: px } }),
      chip.animate({ backgroundColor: ["#ffffff", bg] }, { duration: 100, easing: "linear" }),
      // Check draws in from the left while sliding 3.33px right
      chip.animate({ translate: ["-3.33px 0", "0 0"] }, { duration: 100, delay: 67, easing: M.css(E.checkX), fill: "backwards", pseudoElement: "::before" }),
      chip.animate({ clipPath: ["inset(0 100% 0 0)", "inset(0 0 0 0)"] }, { duration: 100, delay: 67, easing: M.css(E.checkDraw), fill: "backwards", pseudoElement: "::before" })
    ]);
    M.done(list, function () { if (chip._pickerMotion === list) chip.removeAttribute("data-moving"); });
  }
  function chipOff(chip, w0, w1) {
    var bg = getComputedStyle(chip).backgroundColor;
    chip.setAttribute("data-moving", "");
    chip.setAttribute("data-unchecking", "");   // keeps the check while it un-draws
    var list = run(chip, [
      chip.animate({ translate: ["0 0", "-3.33px 0"] }, { duration: 100, easing: M.css(E.chipOff), fill: "forwards", pseudoElement: "::before" }),
      chip.animate({ clipPath: ["inset(0 0 0 0)", "inset(0 100% 0 0)"] }, { duration: 100, easing: M.css(E.chipOff), fill: "forwards", pseudoElement: "::before" }),
      // 17ms later: shape shrinks 2px past its new width, then settles; color back to white
      M.track(chip, "width", [[w0, w1 - 2, 100, E.chipOff], [w1 - 2, w1, 50, E.chipOffSettle]], 17, { fmt: { width: px } }),
      chip.animate({ backgroundColor: ["#ffe0d0", bg] }, { duration: 100, delay: 17, easing: "linear", fill: "backwards" })
    ]);
    M.done(list, function () {
      if (chip._pickerMotion !== list) return;
      chip.removeAttribute("data-moving");
      chip.removeAttribute("data-unchecking");
    });
  }
  // Read widths before the chip handler changes aria-pressed (capture phase), animate after it
  document.addEventListener("click", function (e) {
    var chip = e.target.closest && e.target.closest(".bog-currency-chip");
    if (!chip || chip.disabled || M.still()) return;
    var group = chip.closest(".bog-picker__chips");
    var chips = group ? [].slice.call(group.querySelectorAll(".bog-currency-chip")) : [chip];
    var before = chips.map(function (c) {
      return { chip: c, on: c.getAttribute("aria-pressed") === "true", w: c.getBoundingClientRect().width };
    });
    pending.push(function () {
      before.forEach(function (b) {
        var c = b.chip, on = c.getAttribute("aria-pressed") === "true";
        if (on === b.on) return;
        (c._pickerMotion || []).forEach(function (a) { a.cancel(); });
        c.removeAttribute("data-unchecking");
        var w1 = c.getBoundingClientRect().width;
        if (on) chipOn(c, b.w, w1); else chipOff(c, b.w, w1);
      });
    });
  }, true);

  // ---- Picker: Select (expand) / Minimize ----------------------------------------
  function snapshot(picker) {
    var box = picker.querySelector(".bog-picker__box");
    return {
      picker: picker, box: box,
      selected: picker.hasAttribute("data-selected"),
      expanded: picker.hasAttribute("data-expanded"),
      h: box.getBoundingClientRect().height,
      shadow: getComputedStyle(box).boxShadow
    };
  }
  function animatePicker(b) {
    var p = b.picker, box = b.box, chips = p.querySelector(".bog-picker__expand > .bog-picker__chips");
    var selected = p.hasAttribute("data-selected"), expanded = p.hasAttribute("data-expanded");
    if (selected === b.selected && expanded === b.expanded) return;
    (p._pickerMotion || []).forEach(function (a) { a.cancel(); });
    p.removeAttribute("data-collapsing");
    p.setAttribute("data-moving", "");
    var list = [];

    if (expanded && !b.expanded) {
      // Select: the card grows 11px past its open height and settles; chips drop in 10px, rise 3px, fade in
      var h1 = box.getBoundingClientRect().height;
      list.push(M.track(box, "height", [[b.h, h1 + 11, 200, E.open], [h1 + 11, h1, 150, E.open]], 0, { fmt: { height: px } }));
      if (chips) {
        list.push(M.track(chips, "translate", [[-6.66, 3.34, 200, E.open], [3.34, 0, 150, E.open]], 50, { fmt: { translate: y } }));
        list.push(M.track(chips, "opacity", [[0, 1, 150, E.open]], 100, {}));
      }
    } else if (!expanded && b.expanded) {
      // Minimize: chips rise 6px and fade; 20ms later the card shrinks 3px past its closed height and settles
      var h0 = box.getBoundingClientRect().height;   // closed layout (data-collapsing not set yet)
      p.setAttribute("data-collapsing", "");          // keep the chips laid out while they animate out
      list.push(M.track(box, "height", [[b.h, h0 - 3, 150, E.closeChips], [h0 - 3, h0, 80, E.closeSettle]], 20, { fmt: { height: px } }));
      if (chips) {
        list.push(chips.animate({ translate: ["0 0", "0 -6px"] }, { duration: 150, easing: M.css(E.closeChips), fill: "forwards" }));
        list.push(chips.animate({ opacity: [1, 0] }, { duration: 100, easing: M.css(E.closeFade), fill: "forwards" }));
      }
    }

    // Border: fades in on select (200ms), out on deselect (80ms, 20ms in)
    var now = getComputedStyle(box).boxShadow;
    if (selected && !b.selected && border(now, 1)) {
      list.push(box.animate({ boxShadow: [border(now, 0), now] }, { duration: 200, easing: M.css(E.borderIn) }));
    } else if (!selected && b.selected && border(b.shadow, 1)) {
      list.push(box.animate({ boxShadow: [b.shadow, border(b.shadow, 0)] }, { duration: 80, delay: 20, easing: M.css(E.closeSettle), fill: "backwards" }));
    }

    run(p, list);
    M.done(list, function () {
      if (p._pickerMotion !== list) return;
      // Collapse the layout while transitions are still off, so the CSS transition doesn't replay it
      p.removeAttribute("data-collapsing");
      if (chips) getComputedStyle(chips).visibility;
      p.removeAttribute("data-moving");
    });
  }
  function beforePick(e) {
    var box = e.target.closest && e.target.closest(".bog-picker__box");
    if (!box || e.target.closest(".bog-currency-chip") || M.still()) return;
    if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
    var picker = box.closest(".bog-picker"), group = picker.closest(".bog-picker-group");
    var all = group ? [].slice.call(group.querySelectorAll(".bog-picker")) : [picker];
    var before = all.map(snapshot);
    pending.push(function () { before.forEach(animatePicker); });
  }
  document.addEventListener("click", beforePick, true);
  document.addEventListener("keydown", beforePick, true);

  // ---- Error: the picker list shakes (+10, −5, +5, 0px over 550ms) ----------------
  function shake(picker) {
    if (M.still()) return;
    var target = picker.closest(".bog-picker-group") || picker;
    var list = run(target, [M.track(target, "translate",
      [[0, 10, 200, E.shake], [10, -5, 150, E.shake], [-5, 5, 100, E.shake], [5, 0, 100, E.shake]], 0, { fmt: { translate: x } })]);
    return list;
  }
  new MutationObserver(function (records) {
    var shaken = [];
    records.forEach(function (r) {
      var p = r.target;
      if (!p.classList || !p.classList.contains("bog-picker")) return;
      if (p.getAttribute("data-validation") !== "error" || r.oldValue === "error") return;
      var t = p.closest(".bog-picker-group") || p;
      if (shaken.indexOf(t) < 0) { shaken.push(t); shake(p); }
    });
  }).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ["data-validation"], attributeOldValue: true });

  // ---- Page load: page slides in from the right, then the title and the cards rise in ----
  // page: the screen content under the navigation bar. Title: [data-picker-title] (or the first heading).
  window.BOG.pickerPageIn = function (page) {
    if (!page || M.still()) return [];
    var title = page.querySelector("[data-picker-title]") || page.querySelector("h1, h2, h3");
    var o = { fmt: { translate: y } }, list = [];
    list.push(M.track(page, "translate", [[190, 0, 400, E.page]], 0, { fmt: { translate: x } }));
    list.push(M.track(page, "opacity", [[0, 1, 400, E.page]], 0, {}));
    if (title) {
      list.push(M.track(title, "translate", [[39.65, 0, 400, E.page]], 100, o));
      list.push(M.track(title, "opacity", [[0, 1, 400, E.page]], 100, {}));
    }
    page.querySelectorAll(".bog-picker").forEach(function (card, i) {
      var d = 130 + 70 * i;   // 130, 200, 270ms…
      list.push(M.track(card, "translate", [[30, 0, 500, E.page]], d, o));
      list.push(M.track(card, "opacity", [[0, 1, 500, E.page]], d, {}));
    });
    return list;
  };
})();

/* ---- Chip motion: filter and icon chips on / off -------------------------
   The Account Picker currency-chip motion (Component Motion Guidelines › Account Picker,
   chips on 919:13920 / off 919:15157) applied to the Chip component.
   On:  the chip grows to its new width, 3px past it, then settles (200 + 50 ms); the colour
        fades to Selected (100 ms, linear); the check draws in from the left 67 ms in.
   Off: the check un-draws (100 ms); 17 ms in, the chip shrinks 2px past its new width and
        settles (100 + 50 ms) while the colour fades back.
   A filter chip's check sits before the label, so the check's slot opens and closes with the
   shape and the label glides over instead of jumping. Icon-only chips keep their size: colour
   only. Off under prefers-reduced-motion. */
(function () {
  var E = {
    w: [0.33, 0, 0.16, 1], settle: [0.17, 0, 0.16, 1], checkX: [0.33, 0, 0.1, 1], checkDraw: [0.33, 0, 0.07, 1],
    off: [0.17, 0, 0.67, 1], offSettle: [0.33, 0, 0.67, 1]
  };
  var CHIP = '.bog-chip:is([data-type="filter"], [data-type="icon"])[aria-pressed]';
  function px(v) { return v + "px"; }
  // width in CSS px (border-box), so it stays right inside a zoomed / scaled container
  function look(c) { var s = getComputedStyle(c); return { bg: s.backgroundColor, line: s.boxShadow, fg: s.color, w: parseFloat(s.width) }; }
  function stop(c) {
    (c._chipMotion || []).forEach(function (a) { a.cancel(); });
    c._chipMotion = null;
    c.removeAttribute("data-moving");
    c.removeAttribute("data-unchecking");
  }
  // The check's slot: 16px wide, -4 / +4 margins, plus the chip's 4px gap → 20px of the row
  function slot(c, open) {
    var s = getComputedStyle(c), gap = parseFloat(s.columnGap) || 0;
    return open ? { width: "16px", marginLeft: "", marginRight: "" } : { width: "0px", marginLeft: "0px", marginRight: -gap + "px" };
  }
  function slotFrames(c, from, to) {
    var b = getComputedStyle(c, "::before"), full = { width: b.width, marginLeft: b.marginLeft, marginRight: b.marginRight };
    var shut = slot(c, false);
    var a = from ? full : shut, z = to ? full : shut;
    return { width: [a.width, z.width], marginLeft: [a.marginLeft, z.marginLeft], marginRight: [a.marginRight, z.marginRight] };
  }

  function on(c, b, M) {
    var a = look(c), filter = c.getAttribute("data-type") === "filter";
    var list = [c.animate({ backgroundColor: [b.bg, a.bg], boxShadow: [b.line, a.line], color: [b.fg, a.fg] }, { duration: 100, easing: "linear" })];
    if (filter) {
      c.setAttribute("data-moving", "");
      list.push(
        M.track(c, "width", [[b.w, a.w + 3, 200, E.w], [a.w + 3, a.w, 50, E.settle]], 0, { fmt: { width: px } }),
        c.animate(slotFrames(c, false, true), { duration: 200, easing: M.css(E.w), pseudoElement: "::before" }),
        // check draws in from the left while sliding 3.33px right
        c.animate({ translate: ["-3.33px 0", "0 0"] }, { duration: 100, delay: 67, easing: M.css(E.checkX), fill: "backwards", pseudoElement: "::before" }),
        c.animate({ clipPath: ["inset(0 100% 0 0)", "inset(0 0 0 0)"] }, { duration: 100, delay: 67, easing: M.css(E.checkDraw), fill: "backwards", pseudoElement: "::before" })
      );
    }
    c._chipMotion = list;
    M.done(list, function () { if (c._chipMotion === list) stop(c); });
  }
  function off(c, b, M) {
    var a = look(c), filter = c.getAttribute("data-type") === "filter";
    var list = [c.animate({ backgroundColor: [b.bg, a.bg], boxShadow: [b.line, a.line], color: [b.fg, a.fg] }, { duration: 100, delay: 17, easing: "linear", fill: "backwards" })];
    if (filter) {
      c.setAttribute("data-moving", "");
      c.setAttribute("data-unchecking", "");     // keeps the check while it un-draws
      var slotAnim = slotFrames(c, true, false);
      list.push(
        c.animate({ translate: ["0 0", "-3.33px 0"] }, { duration: 100, easing: M.css(E.off), fill: "forwards", pseudoElement: "::before" }),
        c.animate({ clipPath: ["inset(0 0 0 0)", "inset(0 100% 0 0)"] }, { duration: 100, easing: M.css(E.off), fill: "forwards", pseudoElement: "::before" }),
        c.animate(slotAnim, { duration: 150, delay: 17, easing: M.css(E.off), fill: "both", pseudoElement: "::before" }),
        M.track(c, "width", [[b.w, a.w - 2, 100, E.off], [a.w - 2, a.w, 50, E.offSettle]], 17, { fmt: { width: px } })
      );
    }
    c._chipMotion = list;
    M.done(list, function () { if (c._chipMotion === list) stop(c); });
  }

  // Read the chip before the library's toggle (capture), animate after it (window, bubbling)
  var pending = [];
  document.addEventListener("click", function (e) {
    var M = window.BOG && window.BOG.motion;
    var c = e.target.closest && e.target.closest(CHIP);
    if (!M || !c || c.disabled || M.still() || c.closest(".bog-picker__chips")) return;
    // every chip in the tapped chip's group, so a single-select group also animates the chip turning off
    var group = c.closest(".bog-chip-group");
    var chips = group ? [].slice.call(group.querySelectorAll(CHIP)) : [c];
    var before = chips.map(function (x) { stop(x); return { c: x, b: look(x), was: x.getAttribute("aria-pressed") === "true" }; });
    pending.push(function () {
      before.forEach(function (r) {
        var now = r.c.getAttribute("aria-pressed") === "true";
        if (now !== r.was) (now ? on : off)(r.c, r.b, M);
      });
    });
  }, true);
  window.addEventListener("click", function () { var jobs = pending; pending = []; jobs.forEach(function (j) { j(); }); });
})();

/* ---- Hero Area motion ---------------------------------------------------
   Figma: Component Motion Guidelines › Hero Area (83:449) — Load and Slider. See hero.css.
   BOG.heroIn(hero) plays the load; BOG.heroSlide(slider, index) slides to another hero.
   Off under prefers-reduced-motion. */
(function () {
  var M = window.BOG.motion;
  var LOAD = [0.29, 0, 0.01, 1], SLIDE = [0.36, 0, 0.02, 1];
  var STEP = 1000 / 15;   // 66.7ms between slots: slot n starts (n − 1) × 66.7ms after the first
  function y(v) { return "0 " + v + "px"; }
  function x(v) { return v + "px 0"; }

  // Slots top to bottom: media, label, title, description, badges, then feedback / actions / anything else
  function slots(hero) {
    var out = [];
    [].forEach.call(hero.children, function (c) {
      if (c.hasAttribute("data-hero-static")) return;
      if (!c.classList.contains("bog-hero__content")) { out.push(c); return; }
      [].forEach.call(c.children, function (k) {
        if (k.classList.contains("bog-hero__text")) [].push.apply(out, k.children); else out.push(k);
      });
    });
    return out.filter(function (el) { return !el.hasAttribute("data-hero-static"); });
  }

  // Load: background fades in (600ms, linear); each slot rises 20px (500ms) and fades in (333ms)
  window.BOG.heroIn = function (hero) {
    if (!hero || M.still()) return [];
    var list = [];
    if (hero.hasAttribute("data-gradient")) {
      list.push(hero.animate({ opacity: [0, 1] }, { duration: 600, easing: "linear", fill: "backwards", pseudoElement: "::before" }));
    }
    slots(hero).forEach(function (el, i) {
      list.push(M.track(el, "translate", [[20, 0, 500, LOAD]], i * STEP, { fmt: { translate: y } }));
      list.push(M.track(el, "opacity", [[0, 1, 333, LOAD]], i * STEP, {}));
    });
    return list;
  };

  // Slide: heroes travel 760px (2 × screen + 10) in 750ms; the backgrounds stay put and cross-fade —
  // the old one fades out (150ms), then the new one fades in (250ms)
  window.BOG.heroSlide = function (slider, index) {
    var heroes = [].slice.call(slider.querySelectorAll(":scope > .bog-hero"));
    // During a slide both heroes are active; the slider remembers which one it is heading to
    var at = slider._heroIndex;
    if (!heroes[at] || !heroes[at].hasAttribute("data-active")) at = Math.max(0, heroes.findIndex(function (h) { return h.hasAttribute("data-active"); }));
    var from = heroes[at], to = heroes[index];
    if (!to || to === from) return [];
    slider._heroIndex = index;
    // A slide still running jumps to its end first
    (slider._heroMotion || []).forEach(function (a) { if (a.playState !== "idle" && a.playState !== "finished") a.finish(); });
    heroes.forEach(function (h) { h.toggleAttribute("data-active", h === from || h === to); });
    var done = function () { if (from !== to) from.removeAttribute("data-active"); };
    if (M.still()) { done(); return []; }
    var dir = heroes.indexOf(to) > heroes.indexOf(from) ? 1 : -1;
    var d = (2 * slider.getBoundingClientRect().width + 10) * dir;
    var bg = function (el, frames, opts) {
      return el.hasAttribute("data-gradient") ? [el.animate(frames, Object.assign({ pseudoElement: "::before" }, opts))] : [];
    };
    var list = [
      M.track(from, "translate", [[0, -d, 750, SLIDE]], 0, { fmt: { translate: x } }),
      M.track(to, "translate", [[d, 0, 750, SLIDE]], 0, { fmt: { translate: x } })
    ].concat(
      // backgrounds counter-move so they stay in place while the content slides
      bg(from, { opacity: [1, 0] }, { duration: 150, easing: "linear", fill: "forwards" }),
      bg(from, { translate: ["0px 0", d + "px 0"] }, { duration: 750, easing: M.css(SLIDE), fill: "forwards" }),
      bg(to, { opacity: [0, 1] }, { duration: 250, delay: 150, easing: "linear", fill: "backwards" }),
      bg(to, { translate: [-d + "px 0", "0px 0"] }, { duration: 750, easing: M.css(SLIDE) })
    );
    slider._heroMotion = list;
    M.done(list, function () {
      if (slider._heroMotion !== list) return;
      done();
      list.forEach(function (a) { a.cancel(); });
      slider._heroMotion = null;
    });
    return list;
  };
})();

/* ---- Search input: clear and Cancel ----------------------------------------
   Clear empties the field and keeps focus; Cancel empties it and leaves the field. */
(function () {
  // Keep focus in the field when Cancel / Clear is pressed, so the click lands on them
  document.addEventListener("mousedown", function (e) {
    if (e.target.closest && e.target.closest(".bog-search__cancel, .bog-search__clear")) e.preventDefault();
  });
  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest(".bog-search__cancel, .bog-search__clear");
    if (!btn) return;
    var search = btn.closest(".bog-search"), input = search && search.querySelector(".bog-search__input");
    if (!input) return;
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    if (btn.classList.contains("bog-search__cancel")) input.blur(); else input.focus();
  });
})();

/* ---- Text area: character counter "n/max" ----------------------------------- */
(function () {
  function count(t) {
    var field = t.closest(".bog-field"), c = field && field.querySelector(".bog-field__counter");
    if (!c) return;
    var max = t.getAttribute("maxlength");
    c.textContent = t.value.length + (max ? "/" + max : "");
  }
  document.querySelectorAll("textarea.bog-field__input").forEach(count);
  document.addEventListener("input", function (e) { if (e.target.matches && e.target.matches("textarea.bog-field__input")) count(e.target); });
})();

/* ---- Tabs and Segmented Control: tapping selects one --------------------------
   Tabs: aria-selected, and the tab's aria-controls panel shows (the others hide).
   Segmented Control: aria-checked. Both fire "change" on the group. Arrow keys move along. */
(function () {
  var ITEM = ".bog-tab, .bog-segment";
  function select(item) {
    if (!item || item.disabled || item.getAttribute("data-state") === "skeleton") return;
    var tab = item.classList.contains("bog-tab"), attr = tab ? "aria-selected" : "aria-checked";
    var group = item.closest(tab ? ".bog-tabs" : ".bog-segmented");
    if (!group || item.getAttribute(attr) === "true") return;
    group.querySelectorAll(tab ? ".bog-tab" : ".bog-segment").forEach(function (o) {
      var on = o === item;
      o.setAttribute(attr, String(on));
      o.tabIndex = on ? 0 : -1;
      var panel = tab && o.getAttribute("aria-controls") && document.getElementById(o.getAttribute("aria-controls"));
      if (panel) panel.hidden = !on;
    });
    if (tab && group.scrollWidth > group.clientWidth) item.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    group.dispatchEvent(new Event("change", { bubbles: true }));
  }
  document.addEventListener("click", function (e) { select(e.target.closest && e.target.closest(ITEM)); });
  document.addEventListener("keydown", function (e) {
    var item = e.target.closest && e.target.closest(ITEM);
    if (!item || (e.key !== "ArrowRight" && e.key !== "ArrowLeft")) return;
    var all = [].slice.call(item.parentElement.querySelectorAll(ITEM)).filter(function (o) { return !o.disabled; });
    var next = all[(all.indexOf(item) + (e.key === "ArrowRight" ? 1 : all.length - 1)) % all.length];
    if (next) { e.preventDefault(); next.focus(); select(next); }
  });
})();

/* ---- Tab Bar: the tapped tab becomes the current one ------------------------- */
document.addEventListener("click", function (e) {
  var item = e.target.closest && e.target.closest(".bog-tabbar__item");
  if (!item) return;
  item.closest(".bog-tabbar").querySelectorAll(".bog-tabbar__item").forEach(function (o) {
    if (o === item) o.setAttribute("aria-current", "page"); else o.removeAttribute("aria-current");
  });
  if (item.getAttribute("href") === "#") e.preventDefault();
});

/* ---- PIN code Input: one dot per digit, "pincomplete" when full --------------- */
(function () {
  function paint(input) {
    var pin = input.closest(".bog-pin");
    if (!pin) return;
    input.value = input.value.replace(/\D/g, "");
    var dots = pin.querySelectorAll(".bog-pin__dots > i"), n = input.value.length;
    if (n) pin.removeAttribute("data-state");               // typing again clears the error
    dots.forEach(function (d, i) { d.toggleAttribute("data-filled", i < n); });
    if (n && n === (+input.maxLength > 0 ? +input.maxLength : dots.length)) {
      pin.dispatchEvent(new CustomEvent("pincomplete", { bubbles: true, detail: { value: input.value } }));
    }
  }
  document.addEventListener("input", function (e) { if (e.target.matches && e.target.matches(".bog-pin__input")) paint(e.target); });
  window.BOG = window.BOG || {};
  BOG.pinPaint = paint;
})();

/* ---- OTP Verification: resend countdown --------------------------------------- */
(function () {
  function start(timer) {
    var otp = timer.closest(".bog-otp"), btn = otp && otp.querySelector(".bog-otp__resend");
    var left = parseInt(timer.getAttribute("data-otp-timer"), 10) || 0, b = timer.querySelector("b");
    clearInterval(timer._bogOtp);
    timer.hidden = false;
    if (btn) btn.disabled = true;
    function tick() {
      if (b) b.textContent = String(Math.floor(left / 60)).padStart(2, "0") + ":" + String(left % 60).padStart(2, "0");
      if (left <= 0) { clearInterval(timer._bogOtp); timer.hidden = true; if (btn) btn.disabled = false; return; }
      left--;
    }
    tick();
    timer._bogOtp = setInterval(tick, 1000);
  }
  document.querySelectorAll(".bog-otp__timer[data-otp-timer]").forEach(start);
  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest(".bog-otp__resend");
    if (!btn || btn.disabled) return;
    var otp = btn.closest(".bog-otp"), timer = otp.querySelector(".bog-otp__timer[data-otp-timer]");
    otp.removeAttribute("data-state");
    otp.dispatchEvent(new CustomEvent("otpresend", { bubbles: true }));
    if (timer) start(timer);
  });
  window.BOG = window.BOG || {};
  BOG.otpTimer = start;
})();

/* ---- Numeric Stepper: − / + within data-min and data-max ---------------------- */
(function () {
  function sync(st) {
    var out = st.querySelector(".bog-stepper__value"), v = parseFloat(out.textContent) || 0;
    var min = st.hasAttribute("data-min") ? parseFloat(st.getAttribute("data-min")) : -Infinity;
    var max = st.hasAttribute("data-max") ? parseFloat(st.getAttribute("data-max")) : Infinity;
    var off = st.hasAttribute("data-disabled") || st.getAttribute("data-state") === "loading";
    st.querySelectorAll("[data-step]").forEach(function (b) {
      var s = parseFloat(b.getAttribute("data-step"));
      b.disabled = off || (s < 0 ? v <= min : v >= max);
    });
  }
  document.querySelectorAll(".bog-stepper").forEach(function (st) { if (st.querySelector(".bog-stepper__value")) sync(st); });

  /* Motion — Component Motion Guidelines › Numeric Stepper ("made with Scale", 362:9475):
       button   scale 100% → 90%   0–167 ms     (0.33, 0, 0.25, 1)
                scale 90% → 100%   167–333 ms   (0.44, 0, 0.30, 2.08)  overshoot
       old digit  moves 3.75 px    0–167 ms     fades out 0–83 ms      (0.33, 0, 0.25, 1)
       new digit  from 3.75 px     33–200 ms    fades in 33–116 ms     (0.33, 0, 0.25, 1)
     + moves the digits down; − mirrors it (up). Only digits that change roll (12 → 13: just the "3").
     Same timings as Number Input. --bog-stepper-slow on .bog-stepper multiplies them (docs). */
  var EASE = "cubic-bezier(0.33, 0, 0.25, 1)", SHIFT = 3.75, MOVE = 167, FADE = 83, DELAY = 33;
  var PRESS = "cubic-bezier(0.33, 0, 0.25, 1)", RELEASE = "cubic-bezier(0.44, 0, 0.30, 2.08)";
  var reduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  function still() { return (reduce && reduce.matches) || !document.body.animate; }
  function slow(st) { return parseFloat(getComputedStyle(st).getPropertyValue("--bog-stepper-slow")) || 1; }
  function bump(st, btn) {
    if (still()) return;
    btn.animate([
      { transform: "scale(1)", easing: PRESS },
      { transform: "scale(0.9)", easing: RELEASE },
      { transform: "scale(1)" }
    ], { duration: 2 * MOVE * slow(st) });
  }
  function roll(st, out, from, to, dir) {
    var prev = st.querySelector(".bog-stepper__roll");
    if (prev) prev.remove();
    st.removeAttribute("data-rolling");
    if (still() || from === to) return;
    var k = slow(st), layer = document.createElement("span");
    layer.className = "bog-stepper__roll";
    layer.setAttribute("aria-hidden", "true");
    layer.style.cssText = "left:" + out.offsetLeft + "px;top:" + out.offsetTop + "px;width:" + out.offsetWidth + "px;height:" + out.offsetHeight + "px";
    // Each piece holds the whole number with the other digits hidden, so everything stays aligned
    function piece(text, other, same) {
      var s = document.createElement("span");
      for (var i = 0; i < text.length; i++) {
        var c = document.createElement("span");
        c.textContent = text[i];
        if ((text[i] === other[i]) !== same) c.style.visibility = "hidden";
        s.appendChild(c);
      }
      layer.appendChild(s);
      return s;
    }
    function move(a, b) { return { transform: ["translateY(" + a + "px)", "translateY(" + b + "px)"] }; }
    piece(to, from, true);
    var old = piece(from, to, false), neu = piece(to, from, false), d = dir * SHIFT;
    st.appendChild(layer);
    st.setAttribute("data-rolling", "");
    old.animate(move(0, d), { duration: MOVE * k, easing: EASE, fill: "forwards" });
    old.animate({ opacity: [1, 0] }, { duration: FADE * k, easing: EASE, fill: "forwards" });
    neu.animate({ opacity: [0, 1] }, { duration: FADE * k, delay: DELAY * k, easing: EASE, fill: "backwards" });
    neu.animate(move(-d, 0), { duration: MOVE * k, delay: DELAY * k, easing: EASE, fill: "backwards" }).onfinish = function () {
      if (!layer.isConnected) return;
      layer.remove();
      st.removeAttribute("data-rolling");
    };
  }
  /* Limit: pressing − at the minimum or + at the maximum (the button is disabled) shakes the
     number — 3.33 px right, left, back, 150 ms each (0.33, 0, 0.27, 1), the text field's error
     shake from the motion guide. Disabled buttons let the press through (stepper.css), so it's
     caught on the stepper. Fires "steplimit" (detail.limit = "min" | "max"). */
  var SHAKE = "cubic-bezier(0.33, 0, 0.27, 1)";
  function shake(st) {
    var els = [st.querySelector(".bog-stepper__value"), st.querySelector(".bog-stepper__roll")].filter(Boolean);
    if (still()) return;
    var k = slow(st);
    els.forEach(function (el) {
      el.animate([
        { transform: "translateX(0)", easing: SHAKE },
        { transform: "translateX(3.33px)", easing: SHAKE, offset: 1 / 3 },
        { transform: "translateX(-3.33px)", easing: SHAKE, offset: 2 / 3 },
        { transform: "translateX(0)" }
      ], { duration: 450 * k, composite: "add" });
    });
  }
  document.addEventListener("pointerdown", function (e) {
    var st = e.target.closest && e.target.closest(".bog-stepper");
    if (!st || st.hasAttribute("data-disabled") || st.hasAttribute("data-state")) return;
    [].forEach.call(st.querySelectorAll("[data-step]:disabled"), function (b) {
      var r = b.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
      shake(st);
      st.dispatchEvent(new CustomEvent("steplimit", { bubbles: true, detail: { limit: parseFloat(b.getAttribute("data-step")) < 0 ? "min" : "max" } }));
    });
  });

  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest(".bog-stepper [data-step]");
    if (!b || b.disabled) return;
    var st = b.closest(".bog-stepper"), out = st.querySelector(".bog-stepper__value");
    var step = parseFloat(b.getAttribute("data-step")), from = out.textContent.trim();
    var to = String(Math.round(((parseFloat(from) || 0) + step) * 1e6) / 1e6);
    out.textContent = to;
    bump(st, b);
    if (st.getAttribute("data-roll") === "odometer" && BOG.odometer) BOG.odometer(out, from, to, slow(st));
    else roll(st, out, from, to, step > 0 ? 1 : -1);
    sync(st);
    st.dispatchEvent(new Event("change", { bubbles: true }));
  });
  window.BOG = window.BOG || {};
  BOG.stepperSync = sync;
})();

/* ---- Feedback: notch sound + haptic tick (used by Range Slider) ------------------
   BOG.feedback.notch(at)  plays one "notch": a short, soft 230 Hz sine blip through an 820 Hz
                           low-pass (49 ms, 6 ms attack). `at` (0–1) is the position along the
                           control; pitch rises from 0.75× to 1.5× across it. Notches closer than
                           28 ms are dropped, so fast drags stay a clean ratchet, not a buzz.
                           It also fires a haptic tick: navigator.vibrate on Android, and on iOS
                           Safari 18+ the system tick of a hidden <input type="checkbox" switch>.
   BOG.feedback.sound / .haptics   set to false to mute either one for the whole page.
   Sound is synthesised with Web Audio (no files); browsers only allow it after a tap or key. */
(function () {
  var ctx = null, last = 0, iosSwitch = null;
  var GAP = 28;
  var NOTCH = { hz: 230, ms: 49, gain: 0.048, cut: 820, atk: 6 };

  function audio() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
    }
    if (ctx.state !== "running") ctx.resume();
    return ctx;
  }
  // Unlock audio on the first real gesture, so the first notch of a drag is already audible
  ["pointerdown", "keydown", "touchend"].forEach(function (ev) {
    window.addEventListener(ev, function unlock(e) {
      if (!e.isTrusted || !e.target.closest || !e.target.closest("[data-feedback], .bog-slider")) return;
      audio();
    }, true);
  });

  function blip(at) {
    var c = audio();
    if (!c || c.state !== "running") return;
    var p = at == null ? 1 : 0.75 + Math.min(1, Math.max(0, at)) * 0.75;
    var t = c.currentTime, end = t + NOTCH.ms / 1000;
    var osc = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(NOTCH.hz * p, t);
    lp.type = "lowpass";
    lp.frequency.value = NOTCH.cut;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(NOTCH.gain, t + Math.min(NOTCH.atk, NOTCH.ms * 0.6) / 1000);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(lp).connect(g).connect(c.destination);
    osc.start(t);
    osc.stop(end + 0.02);
  }

  function tick() {
    if (navigator.vibrate) { try { navigator.vibrate(8); } catch (e) {} return; }
    // iOS Safari has no vibrate(); toggling a switch-style checkbox plays the system haptic
    if (!iosSwitch) {
      iosSwitch = document.createElement("label");
      iosSwitch.setAttribute("aria-hidden", "true");
      iosSwitch.style.cssText = "position:fixed;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;clip-path:inset(50%)";
      iosSwitch.innerHTML = '<input type="checkbox" switch tabindex="-1">';
      document.body.appendChild(iosSwitch);
    }
    iosSwitch.click();
  }

  window.BOG = window.BOG || {};
  BOG.feedback = {
    sound: true,
    haptics: true,
    notch: function (at) {
      var now = performance.now();
      if (now - last < GAP) return;
      last = now;
      if (BOG.feedback.sound) blip(at);
      if (BOG.feedback.haptics) tick();
    }
  };
})();

/* ---- Range Slider: orange fill, ticks, value tooltip, notch feedback ------------- */
(function () {
  // Native thumbs travel from 16px to (width − 16px); map values onto that
  function at(p) { return "calc(16px + (100% - 32px) * " + p + ")"; }
  function frac(i) { return (i.value - i.min) / ((i.max - i.min) || 1); }
  function fmt(s, v) { return (s.getAttribute("data-format") || "{v}").replace("{v}", Number(v).toLocaleString("en-US")); }
  function paint(s) {
    var ins = s.querySelectorAll(".bog-slider__track input"), t = s.querySelector(".bog-slider__track");
    if (!ins.length) return;
    if (ins.length > 1 && +ins[0].value > +ins[1].value) {           // keep from ≤ to
      var a = document.activeElement === ins[0] ? 0 : 1;
      ins[a].value = ins[1 - a].value;
    }
    t.style.setProperty("--from", ins.length > 1 ? at(frac(ins[0])) : "0%");
    t.style.setProperty("--to", at(frac(ins[ins.length - 1])));
  }
  function ticks(s) {
    var n = parseInt(s.getAttribute("data-segments"), 10), t = s.querySelector(".bog-slider__track");
    t.querySelectorAll(".bog-slider__tick").forEach(function (k) { k.remove(); });
    if (!n) return;
    for (var i = 0; i <= n; i++) {
      var k = document.createElement("span");
      k.className = "bog-slider__tick";
      k.style.left = i === 0 ? "0" : i === n ? "calc(100% - 1px)" : at(i / n);
      if (i === 0) k.style.marginLeft = "0";
      t.insertBefore(k, t.firstChild);
    }
  }
  function tip(input, show) {
    var s = input.closest(".bog-slider"), t = s.querySelector(".bog-slider__track"), el = t.querySelector(".bog-slider__tip");
    if (!el) { el = document.createElement("span"); el.className = "bog-slider__tip"; t.appendChild(el); }
    el.textContent = fmt(s, input.value);
    el.style.left = at(frac(input));
    el.toggleAttribute("data-show", show);
  }
  // Notches: one per segment, else one per step — capped at 36 along the track, like a ratchet.
  // data-feedback="off" silences a slider; "sound" or "haptic" keeps just that one.
  function notchAt(s, input) {
    var steps = Math.round((input.max - input.min) / (parseFloat(input.step) || 1));
    var n = parseInt(s.getAttribute("data-segments"), 10) || Math.min(steps || 36, 36);
    return Math.round(frac(input) * n);
  }
  function feedback(s, input) {
    var mode = s.getAttribute("data-feedback") || "on", k = notchAt(s, input);
    if (input._notch === k) return;
    input._notch = k;
    var f = window.BOG.feedback;
    if (mode === "off" || !f) return;
    var snd = f.sound, hap = f.haptics;
    if (mode === "sound") f.haptics = false;
    if (mode === "haptic") f.sound = false;
    f.notch(frac(input));
    f.sound = snd; f.haptics = hap;
  }
  function init(s) {
    ticks(s); paint(s);
    s.querySelectorAll(".bog-slider__track input").forEach(function (i) { i._notch = notchAt(s, i); });
  }
  document.querySelectorAll(".bog-slider").forEach(init);
  document.addEventListener("input", function (e) {
    if (!e.target.closest) return;
    var s = e.target.closest(".bog-slider");
    if (s) { paint(s); tip(e.target, true); feedback(s, e.target); }
  });
  document.addEventListener("pointerdown", function (e) { if (e.target.closest && e.target.closest(".bog-slider__track input")) tip(e.target, true); });
  ["pointerup", "pointercancel", "change", "blur"].forEach(function (ev) {
    document.addEventListener(ev, function (e) {
      document.querySelectorAll(".bog-slider__tip[data-show]").forEach(function (t) { t.removeAttribute("data-show"); });
    }, true);
  });
  window.BOG = window.BOG || {};
  BOG.sliderInit = init;
})();

/* ---- Wheel Picker: the middle option is selected ------------------------------ */
(function () {
  function mark(w) {
    var opts = [].slice.call(w.querySelectorAll(".bog-wheel__option"));
    if (!opts.length) return;
    var row = opts[0].offsetHeight, i = Math.max(0, Math.min(opts.length - 1, Math.round(w.scrollTop / row)));
    var was = w.querySelector('.bog-wheel__option[aria-selected="true"]');
    opts.forEach(function (o, j) {
      var d = Math.abs(j - i);
      o.setAttribute("aria-selected", String(d === 0));
      if (d >= 1 && d <= 3) o.setAttribute("data-d", d); else o.removeAttribute("data-d");
    });
    if (was !== opts[i]) w.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function go(w, i, smooth) {
    var opts = w.querySelectorAll(".bog-wheel__option");
    i = Math.max(0, Math.min(opts.length - 1, i));
    w.scrollTo({ top: i * opts[0].offsetHeight, behavior: smooth ? "smooth" : "auto" });
  }
  function init(w) {
    var opts = [].slice.call(w.querySelectorAll(".bog-wheel__option"));
    var sel = opts.findIndex(function (o) { return o.getAttribute("aria-selected") === "true"; });
    go(w, sel < 0 ? 0 : sel, false);
    mark(w);
    if (w._bogWheel) return;
    w._bogWheel = true;
    var raf;
    w.addEventListener("scroll", function () { cancelAnimationFrame(raf); raf = requestAnimationFrame(function () { mark(w); }); });
    w.addEventListener("click", function (e) {
      var o = e.target.closest(".bog-wheel__option");
      if (o) go(w, opts.indexOf(o), true);
    });
    w.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      var cur = opts.findIndex(function (o) { return o.getAttribute("aria-selected") === "true"; });
      go(w, cur + (e.key === "ArrowDown" ? 1 : -1), true);
    });
  }
  document.querySelectorAll(".bog-wheel").forEach(init);
  window.BOG = window.BOG || {};
  BOG.wheelInit = init;
})();

/* ---- Keyboard Numeric: types into the input in data-for ----------------------- */
(function () {
  document.addEventListener("click", function (e) {
    var key = e.target.closest && e.target.closest(".bog-keypad__key");
    if (!key) return;
    var pad = key.closest(".bog-keypad"), k = key.getAttribute("data-key") || key.value;
    var input = pad.getAttribute("data-for") && document.getElementById(pad.getAttribute("data-for"));
    if (input && (/^\d$/.test(k) || k === "dot" || k === "backspace")) {
      var v = input.value;
      if (k === "backspace") v = v.slice(0, -1);
      else if (!(input.maxLength > 0 && v.length >= input.maxLength)) v += k === "dot" ? "." : k;
      input.value = v;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    pad.dispatchEvent(new CustomEvent("keypad", { bubbles: true, detail: { key: k } }));
  });
})();

/* ---- File uploader: × removes a file row ---------------------------------------- */
document.addEventListener("click", function (e) {
  var b = e.target.closest && e.target.closest(".bog-file__remove");
  if (!b) return;
  var row = b.closest(".bog-file");
  if (!row.dispatchEvent(new CustomEvent("fileremove", { bubbles: true, cancelable: true }))) return;
  row.remove();
});

/* ---- Slider Indicator: page dots with a sliding window from 6 pages up ---------- */
(function () {
  function draw(el, cur) {
    var n = parseInt(el.getAttribute("data-count"), 10) || 0;
    cur = Math.max(1, Math.min(n, cur || parseInt(el.getAttribute("data-current"), 10) || 1));
    el.setAttribute("data-current", cur);
    while (el.children.length < n) el.appendChild(document.createElement("i"));
    while (el.children.length > n) el.lastChild.remove();
    // Window of 5 (all of them up to 5 pages); dots at a window edge with more beyond shrink
    var start = n <= 5 ? 1 : Math.max(1, Math.min(cur - 2, n - 4)), end = n <= 5 ? n : start + 4;
    [].forEach.call(el.children, function (d, i) {
      var p = i + 1;
      d.toggleAttribute("aria-current", p === cur);
      d.hidden = p < start || p > end;
      d.removeAttribute("data-size");
      if (n > 5 && p !== cur) {
        if ((p === start && start > 1) || (p === end && end < n)) d.setAttribute("data-size", "4");
        else if ((p === start + 1 && start > 1) || (p === end - 1 && end < n)) d.setAttribute("data-size", "6");
      }
    });
  }
  document.querySelectorAll(".bog-dots[data-count]").forEach(function (el) { draw(el); });
  window.BOG = window.BOG || {};
  BOG.dots = draw;
})();

/* ---- Tooltip: tap the icon to open, anywhere else to close; one at a time -------- */
document.addEventListener("click", function (e) {
  var trig = e.target.closest && e.target.closest(".bog-tooltip__trigger");
  document.querySelectorAll(".bog-tooltip[data-open]:not([data-pinned])").forEach(function (t) {
    if (!trig || t !== trig.closest(".bog-tooltip")) { t.removeAttribute("data-open"); t.querySelector(".bog-tooltip__trigger").setAttribute("aria-expanded", "false"); }
  });
  if (!trig) return;
  var tip = trig.closest(".bog-tooltip"), open = !tip.hasAttribute("data-open");
  tip.toggleAttribute("data-open", open);
  trig.setAttribute("aria-expanded", String(open));
});

/* ---- Banner: × removes it ------------------------------------------------------- */
document.addEventListener("click", function (e) {
  var b = e.target.closest && e.target.closest(".bog-banner__close");
  if (!b) return;
  e.preventDefault();
  b.closest(".bog-banner").remove();
});

/* ---- Accordion: data-single keeps one item open ----------------------------------- */
document.addEventListener("toggle", function (e) {
  var item = e.target;
  if (!item.matches || !item.matches(".bog-accordion__item") || !item.open) return;
  var acc = item.closest(".bog-accordion[data-single]");
  if (acc) acc.querySelectorAll(".bog-accordion__item[open]").forEach(function (o) { if (o !== item) o.open = false; });
}, true);

/* ---- Donut Chart and Sparkline: drawn from data-values ---------------------------- */
(function () {
  var NS = "http://www.w3.org/2000/svg";
  var PALETTE = ["--dv-01", "--dv-09", "--dv-06", "--dv-03", "--dv-10", "--dv-02", "--dv-17", "--dv-05", "--dv-07", "--dv-08", "--dv-15", "--dv-18"];
  var RO = 50, RI = 36, RI_SEL = 33.5, GAP = 2;   /* viewBox 100: outer r 50, inner 72 % (67 % when selected), 2° gaps */
  function pt(r, deg) { var a = (deg - 90) * Math.PI / 180; return [50 + r * Math.cos(a), 50 + r * Math.sin(a)]; }
  function sector(a0, a1, ro, ri) {
    if (a1 - a0 >= 359.99) a1 = a0 + 359.99;
    var big = a1 - a0 > 180 ? 1 : 0, p0 = pt(ro, a0), p1 = pt(ro, a1), p2 = pt(ri, a1), p3 = pt(ri, a0);
    return "M" + p0 + "A" + ro + "," + ro + " 0 " + big + " 1 " + p1 + "L" + p2 + "A" + ri + "," + ri + " 0 " + big + " 0 " + p3 + "Z";
  }
  function el(tag, attrs) { var n = document.createElementNS(NS, tag); for (var k in attrs) n.setAttribute(k, attrs[k]); return n; }
  function list(s) { return (s || "").split(",").map(function (v) { return v.trim(); }).filter(Boolean); }

  function donut(box) {
    var vals = list(box.getAttribute("data-values")).map(Number).filter(function (v) { return v > 0; });
    var colors = list(box.getAttribute("data-colors")), labels = list(box.getAttribute("data-labels"));
    var max = parseFloat(box.getAttribute("data-max")), sum = vals.reduce(function (a, b) { return a + b; }, 0);
    var old = box.querySelector(":scope > svg"); if (old) old.remove();
    box.querySelectorAll(":scope > .bog-donut__tag").forEach(function (t) { t.remove(); });
    var svg = el("svg", { viewBox: "0 0 100 100", "aria-hidden": "true" });
    svg.innerHTML = '<defs><pattern id="bog-hatch" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="3" fill="rgba(255,255,255,.6)"/><line x1="0" y1="0" x2="0" y2="3" stroke="rgba(218,30,40,.55)" stroke-width="1"/></pattern></defs>';
    var status = "";
    if (!sum) {
      svg.appendChild(el("path", { class: "bog-donut__rail", d: sector(0, 360, RO, RI) }));
      status = max ? "empty" : "";
    } else {
      var whole = max && sum < max ? max : sum;     /* the circle stands for the target, or the total when over it */
      var a = 0, sel = box.getAttribute("data-selected");
      var gap = vals.length > 1 || (max && sum !== max) ? GAP : 0;
      vals.forEach(function (v, i) {
        var span = v / whole * 360, on = sel !== null && +sel === i;
        var p = el("path", { class: "bog-donut__seg", d: sector(a + gap / 2, a + span - gap / 2, RO, on ? RI_SEL : RI), "data-index": i });
        p.style.fill = colors[i] || "var(" + PALETTE[i % PALETTE.length] + ")";
        if (on) p.setAttribute("data-on", "");
        svg.appendChild(p);
        if (labels[i]) {
          var mid = pt(RO + 12, a + span / 2), t = document.createElement("span");
          t.className = "bog-donut__tag"; t.textContent = labels[i];
          t.style.left = mid[0] + "%"; t.style.top = mid[1] + "%";
          box.appendChild(t);
        }
        a += span;
      });
      if (max) {
        if (sum < max) {
          svg.appendChild(el("path", { class: "bog-donut__rest", d: sector(a + gap / 2, 360 - gap / 2, RO, RI) }));
          status = "incomplete";
        } else if (sum > max) {
          var over = (sum - max) / sum * 360;
          svg.appendChild(el("path", { class: "bog-donut__over", d: sector(0, over, RO, RI), fill: "url(#bog-hatch)" }));
          var t0 = pt(RI - 2, over), t1 = pt(RO + 4, over);
          svg.appendChild(el("line", { class: "bog-donut__tick", x1: t0[0], y1: t0[1], x2: t1[0], y2: t1[1] }));
          status = "overflow";
        } else status = "complete";
      }
    }
    if (status) box.setAttribute("data-status", status); else box.removeAttribute("data-status");
    box.insertBefore(svg, box.firstChild);
    describe(box, vals, labels, sum, max, status);
  }

  // Text alternative: the chart is one image for screen readers. A page's own aria-label wins;
  // otherwise it's built from the centre text and each part's share ("Utilities 124.00 ₾. 7 parts: 25 %, 16 %…").
  function describe(box, vals, labels, sum, max, status) {
    if (!box.hasAttribute("role")) box.setAttribute("role", "img");
    if (box.hasAttribute("aria-label") && !box.hasAttribute("data-auto-label")) return;
    var c = box.querySelector(".bog-donut__center"), head = c ? [].map.call(c.children.length ? c.children : [c], function (x) { return x.textContent.trim(); }).filter(Boolean).join(" ") : "Chart";
    var whole = max && sum < max ? max : sum, parts;
    if (!sum) parts = "no data yet";
    else parts = vals.length + (vals.length === 1 ? " part: " : " parts: ") + vals.map(function (v, i) {
      return Math.round(v / whole * 100) + " %" + (labels[i] ? " (" + labels[i] + ")" : "");
    }).join(", ");
    var tail = status === "incomplete" ? ", target not reached" : status === "overflow" ? ", over the target" : "";
    box.setAttribute("aria-label", head + ". " + parts + tail);
    box.setAttribute("data-auto-label", "");
  }

  function spark(svg) {
    var v = list(svg.getAttribute("data-values")).map(Number);
    if (v.length < 2) return;
    var lo = Math.min.apply(null, v), hi = Math.max.apply(null, v), W = 228, H = 144, pad = 8;
    var x = function (i) { return i / (v.length - 1) * W; }, y = function (n) { return pad + (1 - (n - lo) / ((hi - lo) || 1)) * (H - pad * 2); };
    var d = "M" + x(0) + "," + y(v[0]);
    for (var i = 0; i < v.length - 1; i++) {   /* smooth: Catmull-Rom as cubic Beziers */
      var p0 = Math.max(0, i - 1), p3 = Math.min(v.length - 1, i + 2);
      var c1x = x(i) + (x(i + 1) - x(p0)) / 6, c1y = y(v[i]) + (y(v[i + 1]) - y(v[p0])) / 6;
      var c2x = x(i + 1) - (x(p3) - x(i)) / 6, c2y = y(v[i + 1]) - (y(v[p3]) - y(v[i])) / 6;
      d += " C" + c1x + "," + c1y + " " + c2x + "," + c2y + " " + x(i + 1) + "," + y(v[i + 1]);
    }
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.innerHTML = '<path class="bog-sparkline__area" d="' + d + " L" + W + "," + H + " L0," + H + ' Z"/><path class="bog-sparkline__line" d="' + d + '"/>';
    // Text alternative (a page's own aria-label wins): where the trend starts and ends, and its range
    svg.setAttribute("role", "img");
    if (!svg.hasAttribute("aria-label") || svg.hasAttribute("data-auto-label")) {
      svg.setAttribute("aria-label", "Trend from " + v[0] + " to " + v[v.length - 1] + ", lowest " + lo + ", highest " + hi);
      svg.setAttribute("data-auto-label", "");
    }
  }

  function init(root) {
    (root || document).querySelectorAll(".bog-donut[data-values], .bog-donut:not([data-values])").forEach(donut);
    (root || document).querySelectorAll(".bog-sparkline[data-values]").forEach(spark);
  }
  document.addEventListener("click", function (e) {
    var seg = e.target.closest && e.target.closest(".bog-donut[data-selectable] .bog-donut__seg");
    if (!seg) return;
    var box = seg.closest(".bog-donut"), i = seg.getAttribute("data-index");
    if (box.getAttribute("data-selected") === i) box.removeAttribute("data-selected"); else box.setAttribute("data-selected", i);
    donut(box);
    box.dispatchEvent(new CustomEvent("segmentselect", { bubbles: true, detail: { index: box.hasAttribute("data-selected") ? +i : null } }));
  });
  /* After DOMContentLoaded, so charts in markup that other deferred scripts render (the docs index) are drawn too */
  if (document.readyState === "complete") init();
  else { document.addEventListener("DOMContentLoaded", function () { init(); }); window.addEventListener("load", function () { init(); }); }
  window.BOG = window.BOG || {};
  BOG.donut = donut;
  BOG.sparkline = spark;
  BOG.chartsInit = init;
})();

/* ---- Important Information: [data-must-read] unlocks [data-requires-read] at the end ---- */
(function () {
  function check(box) {
    if (box.hasAttribute("data-read")) return;
    if (box.scrollTop + box.clientHeight < box.scrollHeight - 8) return;
    box.setAttribute("data-read", "");
    var scope = box.closest(".bog-sheet__panel, [data-must-read-scope]") || document;
    scope.querySelectorAll("[data-requires-read]").forEach(function (b) { b.disabled = false; });
    box.dispatchEvent(new CustomEvent("mustread", { bubbles: true }));
  }
  document.addEventListener("scroll", function (e) { if (e.target.matches && e.target.matches("[data-must-read]")) check(e.target); }, true);
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest(".bog-must-read__more");
    if (!b) return;
    var box = b.closest("[data-must-read]");
    box.scrollBy({ top: box.clientHeight * 0.8, behavior: "smooth" });
  });
  window.BOG = window.BOG || {};
  BOG.mustReadCheck = check;   /* call after the text changes: short text counts as read at once */
})();

/* ---- Feature Notes: the dots follow the swipe; the button goes to the next note, then closes ---- */
/* The dots stay in the top 44px of the note's text block, even when larger text makes the block
   taller than its 132px (they live in the footer, so their offset follows the text block's height). */
(function () {
  function place(root) {
    var dots = root.querySelector(".bog-notes__footer > .bog-dots"), track = root.querySelector(".bog-notes__track");
    if (!dots || !track || !track.children.length) return;
    var i = Math.min(track.children.length - 1, Math.max(0, Math.round(track.scrollLeft / (track.clientWidth || 1))));
    var text = track.children[i].querySelector(".bog-notes__text");
    if (text) dots.style.top = -(text.offsetHeight - 24) + "px";
  }
  var ro = window.ResizeObserver ? new ResizeObserver(function (entries) {
    entries.forEach(function (en) { var r = en.target.closest(".bog-notes"); if (r) place(r); });
  }) : null;
  function watch() {
    document.querySelectorAll(".bog-notes").forEach(function (r) {
      place(r);
      if (ro) r.querySelectorAll(".bog-notes__text").forEach(function (t) { ro.observe(t); });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watch); else watch();
  document.addEventListener("scroll", function (e) { if (e.target.classList && e.target.classList.contains("bog-notes__track")) place(e.target.closest(".bog-notes")); }, true);
  document.addEventListener("noteschange", function (e) { setTimeout(function () { place(e.target); }, 0); });
  window.BOG = window.BOG || {};
  BOG.notesLayout = watch;   /* call after rendering new notes */
})();
document.addEventListener("scroll", function (e) {
  var t = e.target;
  if (!t.classList || !t.classList.contains("bog-notes__track")) return;
  var i = Math.round(t.scrollLeft / t.clientWidth) + 1, root = t.closest(".bog-notes"), dots = root.querySelector(".bog-dots");
  if (dots && +dots.getAttribute("data-current") !== i && window.BOG && BOG.dots) BOG.dots(dots, i);
  root.setAttribute("data-current", i);
}, true);
/* Next → "Feature Note – Slide" (Component Motion Guidelines 2657:20030). Four layers, 0–470 ms:
     new picture    slides in from the right edge   0–400 ms     (0.33, 0, 0.20, 1)   — drawn on top
     old picture    slides out to the left          50–450 ms    (0.33, 0, 0.06, 1)
     old text       moves 50 px left                0–400 ms     (0.33, 0, 0.17, 1)
                    fades out                       0–300 ms     (0.79, 0, 0.27, 1)
     new text       moves in from 50 px right       50–450 ms    (0.33, 0, 0.17, 1)
                    fades in                        170–470 ms   (0.67, 0, 0.18, 1)
   The track stays put while the layers move, then jumps to the new note. Swiping by hand is a
   plain scroll. --bog-notes-slow on .bog-notes multiplies the timings (docs slow-motion switch). */
(function () {
  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)");
  function slide(root, track, from, to) {
    var w = track.clientWidth, slides = track.children;
    var a = slides[from], b = slides[to];
    var k = parseFloat(getComputedStyle(root).getPropertyValue("--bog-notes-slow")) || 1;
    var dots = root.querySelector(".bog-dots");
    if (dots && window.BOG && BOG.dots) BOG.dots(dots, to + 1);
    root.setAttribute("data-current", to + 1);
    root.dispatchEvent(new CustomEvent("noteschange", { bubbles: true, detail: { index: to + 1 } }));
    if (!a || !b || !a.animate || (reduced && reduced.matches)) { track.scrollLeft = to * w; return null; }
    var dir = to > from ? 1 : -1, off = (to - from) * w;          // b sits `off` px to the right of a
    var t = function (ms) { return ms * k; };
    var ease = function (x1, y1, x2, y2) { return "cubic-bezier(" + x1 + "," + y1 + "," + x2 + "," + y2 + ")"; };
    var q = function (s, sel) { return s.querySelector(sel); };
    var list = [
      q(b, ".bog-notes__media").animate([{ transform: "translateX(0)" }, { transform: "translateX(" + -off + "px)" }],
        { duration: t(400), easing: ease(0.33, 0, 0.2, 1), fill: "both" }),
      q(a, ".bog-notes__media").animate([{ transform: "translateX(0)" }, { transform: "translateX(" + -dir * w + "px)" }],
        { duration: t(400), delay: t(50), easing: ease(0.33, 0, 0.06, 1), fill: "both" }),
      q(a, ".bog-notes__text").animate([{ transform: "translateX(0)" }, { transform: "translateX(" + -dir * 50 + "px)" }],
        { duration: t(400), easing: ease(0.33, 0, 0.17, 1), fill: "both" }),
      q(a, ".bog-notes__text").animate([{ opacity: 1 }, { opacity: 0 }],
        { duration: t(300), easing: ease(0.79, 0, 0.27, 1), fill: "both" }),
      q(b, ".bog-notes__text").animate([{ transform: "translateX(" + (-off + dir * 50) + "px)" }, { transform: "translateX(" + -off + "px)" }],
        { duration: t(400), delay: t(50), easing: ease(0.33, 0, 0.17, 1), fill: "both" }),
      q(b, ".bog-notes__text").animate([{ opacity: 0 }, { opacity: 1 }],
        { duration: t(300), delay: t(170), easing: ease(0.67, 0, 0.18, 1), fill: "both" })
    ];
    // The new picture must cover the old one, whichever way we go
    b.style.position = "relative"; b.style.zIndex = "1";
    track.setAttribute("data-moving", "");
    return Promise.all(list.map(function (x) { return x.finished; })).then(function () {
      track.style.scrollSnapType = "none";                        // jump without a snap fight
      track.scrollLeft = to * w;
      list.forEach(function (x) { x.cancel(); });
      b.style.position = b.style.zIndex = "";
      track.style.scrollSnapType = "";
      track.removeAttribute("data-moving");
    });
  }
  window.BOG = window.BOG || {};
  /* BOG.notesGo(root, index) — animate to a note (1-based); returns a promise */
  BOG.notesGo = function (root, index) {
    var track = root.querySelector(".bog-notes__track");
    if (track.hasAttribute("data-moving")) return Promise.resolve();
    var from = Math.round(track.scrollLeft / track.clientWidth), to = index - 1;
    if (to === from || to < 0 || to >= track.children.length) return Promise.resolve();
    return Promise.resolve(slide(root, track, from, to));
  };
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest(".bog-notes__next");
    if (!b) return;
    var root = b.closest(".bog-notes"), track = root.querySelector(".bog-notes__track");
    if (track.hasAttribute("data-moving")) return;
    var n = track.children.length, i = Math.round(track.scrollLeft / track.clientWidth) + 1;
    if (i < n) BOG.notesGo(root, i + 1);
    else root.dispatchEvent(new CustomEvent("notesdone", { bubbles: true }));
  });
})();

/* ---- Asset Card group: load-in -----------------------------------------------------
   BOG.assetIn(group, { from, stagger, slow }) — the cards fade in and move into place one after
   another (no Figma guide yet; timing borrowed from the Result Page text blocks):
     each card   opacity 0 → 100%, 500 ms · position 24 px (sideways) / 20 px (up, down) → 0, 500 ms
     curve       cubic-bezier(0.29, 0, 0.01, 1) — quick start, long soft settle
     stagger     70 ms between cards (option)
   from: "left"   cards come in from the left, first card first (left → right)
         "right"  cards come in from the right (move right → left), first card leading
         "bottom" cards rise into place, left → right
         "top"    cards drop into place, left → right
   <div class="bog-asset-group" data-animate="left"> plays it on load (data-stagger="70").
   Reduce Motion: cards just appear. Returns the animations. */
(function () {
  var EASE = "cubic-bezier(0.29, 0, 0.01, 1)", DUR = 500, STEP = 70;
  var OFF = { left: [-24, 0], right: [24, 0], bottom: [0, 20], top: [0, -20] };
  var reduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  function assetIn(group, opts) {
    opts = opts || {};
    var from = OFF[opts.from] ? opts.from : "left";
    var step = opts.stagger != null ? +opts.stagger : STEP, k = opts.slow || 1;
    var cards = [].slice.call(group.querySelectorAll(":scope > .bog-asset"));
    (group._assetIn || []).forEach(function (a) { a.cancel(); });
    group._assetIn = [];
    settle(group);                                    // a replay starts from the group's own styles
    group.setAttribute("data-animated", "");          // lifts the before-load hide (asset-card.css)
    if ((reduce && reduce.matches) || !group.animate) { settle(group); return []; }
    // Stagger only the cards on screen, first card leading in every direction; the ones
    // scrolled out of view follow after, so the first visible card never waits on hidden ones
    var box = group.getBoundingClientRect();
    var seen = cards.filter(function (c) { var r = c.getBoundingClientRect(); return r.right > box.left + 1 && r.left < box.right - 1; });
    var rest = cards.filter(function (c) { return seen.indexOf(c) < 0; });
    var order = seen.concat(rest), o = OFF[from];
    // While the cards move: no scroll snapping (moving cards change the scroll area and the row
    // would jump), and room above and below so vertical moves aren't clipped by the scroller
    group._assetSaved = {};
    PROPS.forEach(function (p) { group._assetSaved[p] = group.style[p]; });
    group.style.scrollSnapType = "none";
    if (o[1]) {
      var pad = Math.abs(o[1]) + 4, cs = getComputedStyle(group);
      group.style.paddingTop = parseFloat(cs.paddingTop) + pad + "px";
      group.style.paddingBottom = parseFloat(cs.paddingBottom) + pad + "px";
      group.style.marginTop = parseFloat(cs.marginTop) - pad + "px";
      group.style.marginBottom = parseFloat(cs.marginBottom) - pad + "px";
    }
    order.forEach(function (card, i) {
      group._assetIn.push(card.animate([
        { opacity: 0, translate: o[0] + "px " + o[1] + "px" },
        { opacity: 1, translate: "0 0" }
      ], { duration: DUR * k, delay: i * step * k, easing: EASE, fill: "backwards" }));
    });
    var mine = group._assetIn;
    Promise.all(mine.map(function (a) { return a.finished; })).then(function () {
      if (group._assetIn === mine) settle(group);
    }, function () {});
    return mine;
  }
  var PROPS = ["scrollSnapType", "paddingTop", "paddingBottom", "marginTop", "marginBottom"];
  function settle(group) {                            // put back the group's own inline styles
    var saved = group._assetSaved;
    if (!saved) return;
    PROPS.forEach(function (p) { group.style[p] = saved[p]; });
    group._assetSaved = null;
  }
  window.BOG = window.BOG || {};
  BOG.assetIn = assetIn;
  document.querySelectorAll(".bog-asset-group[data-animate]").forEach(function (g) {
    assetIn(g, { from: g.getAttribute("data-animate"), stagger: g.hasAttribute("data-stagger") ? +g.getAttribute("data-stagger") : undefined });
  });
})();

/* ---- Icons: paths and names that just work ------------------------------------
   An author writes --icon: url(...) relative to their page or their own CSS file, but the
   browser resolves it against bog-ui/components/icon.css (where the variable is used), so
   the icon 404s and disappears. This finds the file the author meant (next to the page, next
   to one of the page's own stylesheets, or the old path relative to components/) and pins
   its full URL on the icon.
   data-icon="name" works for every icon in bog-ui/icons/ (name.svg, name-16.svg or
   name-24.svg), not only the few with CSS rules.
   An icon that can't be found anywhere shows the placeholder and a console warning instead
   of an empty space. */
(function () {
  var BASE = (document.currentScript && document.currentScript.src) || location.href;
  var LIB = new URL("icons/", BASE).href, COMPONENTS = new URL("components/", BASE).href;
  var LIB_ROOT = new URL(".", BASE).href;
  var PLACEHOLDER = 'url("' + LIB + 'placeholder.svg")';
  // data-icon names that icon.css already maps
  var CSS_NAMES = ["close", "plus", "minus", "eye", "eye-hidden", "chevron-down", "chevron-right", "retry", "chevron-left", "chat", "search", "upload"];
  var probes = {}, seen = new WeakMap(), warned = {};

  // true = exists, false = 404, null = can't tell (file://, offline)
  function exists(url) {
    if (!probes[url]) {
      probes[url] = fetch(url, { method: "HEAD", cache: "force-cache" }).then(function (r) {
        if (r.status === 405 || r.status === 501) return fetch(url).then(function (g) { return g.ok; });
        return r.ok;
      }, function () { return null; });
    }
    return probes[url];
  }
  // First URL that exists; the first candidate when nothing can be checked; null when none exists
  function firstExisting(urls, i, unsure) {
    i = i || 0;
    if (i >= urls.length) return Promise.resolve(unsure ? urls[0] : null);
    return exists(urls[i]).then(function (ok) {
      return ok ? urls[i] : firstExisting(urls, i + 1, unsure || ok === null);
    });
  }
  function warn(key, msg) { if (!warned[key]) { warned[key] = 1; console.warn("bog-ui: " + msg); } }
  function setIcon(el, url) { el.style.setProperty("--icon", 'url("' + url + '")'); }

  function ownSheets() {
    var out = [];
    document.querySelectorAll('link[rel~="stylesheet"][href]').forEach(function (l) {
      if (l.href.indexOf(LIB_ROOT) !== 0) out.push(l.href);
    });
    return out;
  }

  function fix(el) {
    var name = el.getAttribute("data-icon");
    var inline = el.style.getPropertyValue("--icon").trim();
    var raw = getComputedStyle(el).getPropertyValue("--icon").trim();
    var key = (name || "") + "|" + raw;
    if (seen.get(el) === key) return;
    seen.set(el, key);

    // Library icon by name
    if (name && !inline && CSS_NAMES.indexOf(name) < 0) {
      firstExisting([LIB + name + ".svg", LIB + name + "-16.svg", LIB + name + "-24.svg"]).then(function (url) {
        if (url) setIcon(el, url);
        else warn("name:" + name, 'no icon named "' + name + '" in bog-ui/icons/ — showing the placeholder.');
        seen.set(el, (name || "") + "|" + getComputedStyle(el).getPropertyValue("--icon").trim());
      });
      return;
    }

    // Custom icon path
    var m = raw.match(/^url\(\s*(['"]?)(.*?)\1\s*\)$/);
    if (!m) return;
    var path = m[2];
    if (!path || /^([a-z][a-z0-9+.-]*:|\/|#)/i.test(path)) return; // already absolute, data: or root-relative
    var bases = inline ? [document.baseURI].concat(ownSheets()) : ownSheets().concat([document.baseURI]);
    bases.push(COMPONENTS); // old style: written relative to bog-ui/components/
    var urls = [];
    bases.forEach(function (b) { var u = new URL(path, b).href; if (urls.indexOf(u) < 0) urls.push(u); });
    firstExisting(urls).then(function (url) {
      if (url) setIcon(el, url);
      else {
        el.style.setProperty("--icon", PLACEHOLDER);
        warn("path:" + path, 'icon not found: "' + path + '" (looked next to the page, its stylesheets and bog-ui/components/) — showing the placeholder.');
      }
      seen.set(el, (name || "") + "|" + getComputedStyle(el).getPropertyValue("--icon").trim());
    });
  }

  function scan(root) {
    if (root.nodeType !== 1) return;
    if (root.matches(".bog-icon")) fix(root);
    root.querySelectorAll(".bog-icon").forEach(fix);
  }

  var queue = [], queued = false;
  function flush() {
    queued = false;
    var list = queue; queue = [];
    list.forEach(scan);
  }
  function later(node) {
    queue.push(node);
    if (!queued) { queued = true; setTimeout(flush, 0); }  // not rAF: it pauses in background tabs
  }

  function start() {
    scan(document.documentElement);
    new MutationObserver(function (records) {
      records.forEach(function (r) {
        if (r.type === "childList") r.addedNodes.forEach(function (n) { if (n.nodeType === 1) later(n); });
        // style changes matter only on the icon itself; class changes can switch an inherited --icon
        else if (r.attributeName === "class" || r.target.matches(".bog-icon")) later(r.target);
      });
    }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style", "data-icon"] });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
  window.addEventListener("load", function () { scan(document.documentElement); });

  window.BOG = window.BOG || {};
  window.BOG.fixIcons = function (root) { scan(root || document.documentElement); };
})();
