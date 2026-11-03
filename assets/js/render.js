/**
 * Fills the page from the concert data.
 *
 * Where the data comes from, fastest first:
 *   1. data/site-data.json - made by Netlify each time the site is published (scripts/prepare-site.js).
 *      Small and quick, so visitors don't have to download the spreadsheet reader.
 *   2. The spreadsheet itself, read right here in the browser. Used when site-data.json isn't there
 *      (for example in a local preview). data/workbook.txt, also made when publishing, names the file;
 *      without it, the one spreadsheet in the data folder is used (or data/concert-data.xlsx).
 *   3. Older sites: data/concert-info.json, data/program.json and data/students.json.
 */
(function () {
  "use strict";

  const SITE_DATA = "data/site-data.json";
  const DEFAULT_WORKBOOK = "data/concert-data.xlsx";

  async function fetchJSON(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) {
      throw new Error("Failed to load " + path + " (" + res.status + ")");
    }
    return res.json();
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = function () {
        reject(new Error("Could not load " + src));
      };
      document.head.appendChild(script);
    });
  }

  async function loadPreparedData() {
    try {
      const res = await fetch(SITE_DATA);
      if (res.ok) return await res.json();
    } catch (err) {
      // not there: fall through to reading the spreadsheet
    }
    return null;
  }

  function safeWorkbookName(name) {
    return /\.xlsx$/i.test(name) && !/[\/\\]/.test(name) && name.indexOf("..") === -1;
  }

  // Where to look for the spreadsheet, best guess first:
  //   1. data/workbook.txt, written by the publishing step (scripts/find-workbook.sh).
  //   2. The folder listing of data/ that a local preview server (Live Server, python) shows: the one
  //      .xlsx there that isn't the blank starter, an example or an Excel temp file.
  //   3. data/concert-data.xlsx.
  // Each is only tried if the one before it didn't turn up a spreadsheet.
  async function* workbookCandidates() {
    try {
      const res = await fetch("data/workbook.txt", { cache: "no-store" });
      if (res.ok) {
        const name = (await res.text()).trim();
        if (safeWorkbookName(name)) yield "data/" + encodeURIComponent(name);
      }
    } catch (err) {
      // no workbook.txt: try the folder listing
    }

    try {
      const res = await fetch("data/", { cache: "no-store" });
      if (res.ok) {
        const found = [];
        const links = (await res.text()).match(/href\s*=\s*"[^"]*\.xlsx"/gi) || [];
        links.forEach(function (link) {
          const href = link.slice(link.indexOf('"') + 1, -1).split(/[?#]/)[0];
          let name = href.split("/").pop();
          try {
            name = decodeURIComponent(name);
          } catch (err) {
            // keep the name as written
          }
          if (safeWorkbookName(name) && !/^~\$|example/i.test(name) && name.toLowerCase() !== "concert-data.xlsx" && found.indexOf(name) === -1) {
            found.push(name);
          }
        });
        found.sort();
        if (found.length) yield "data/" + encodeURIComponent(found[0]);
      }
    } catch (err) {
      // no folder listing (the published site doesn't have one, and doesn't need it)
    }

    yield DEFAULT_WORKBOOK;
  }

  async function loadFromWorkbook() {
    let res = null;
    for await (const candidate of workbookCandidates()) {
      // no-store: always read the latest saved spreadsheet, never a cached copy
      const attempt = await fetch(candidate, { cache: "no-store" });
      if (attempt.ok) {
        res = attempt;
        break;
      }
    }
    if (!res) return null;

    // the spreadsheet reader is big, so it is only downloaded when it's actually needed
    if (typeof XLSX === "undefined") await loadScript("assets/vendor/xlsx/xlsx.full.min.js");
    if (typeof ConcertParser === "undefined") await loadScript("assets/js/parse-workbook.js");

    const workbook = XLSX.read(await res.arrayBuffer(), { type: "array" });
    return ConcertParser.parseWorkbook(XLSX, workbook);
  }

  async function loadConcertData() {
    const prepared = await loadPreparedData();
    if (prepared) return prepared;

    try {
      const fromWorkbook = await loadFromWorkbook();
      if (fromWorkbook) return fromWorkbook;
    } catch (err) {
      console.error("Failed to read the concert spreadsheet, falling back to individual JSON files:", err);
    }

    const [info, program, students] = await Promise.all([
      fetchJSON("data/concert-info.json"),
      fetchJSON("data/program.json"),
      fetchJSON("data/students.json"),
    ]);
    return { info: info, program: program, students: students, bios: [] };
  }

  function el(tag, opts = {}) {
    const node = document.createElement(tag);
    if (opts.className) node.className = opts.className;
    if (opts.text !== undefined) node.textContent = opts.text;
    if (opts.html !== undefined) node.innerHTML = opts.html;
    return node;
  }

  function slugify(str) {
    return String(str)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  // Top-left header. By default: the year (taken from the Date) followed by the concert name
  // (Big Title Line 2), with the concert name in the primary color - e.g. "2026 City Jazz Concert".
  // If "Top-Left Header Text" is filled in, that text is used instead, and the concert name is
  // still shown in the primary color wherever it appears inside it.
  function renderHeaderTitle(el, info) {
    if (!el) return;
    const name = (info.concertTitleLine2 || "").trim();
    const custom = (info.headerTitle || "").trim();
    el.textContent = "";

    function accent(text) {
      const span = document.createElement("span");
      span.textContent = text;
      el.appendChild(span);
    }

    if (custom) {
      const at = name ? custom.toLowerCase().indexOf(name.toLowerCase()) : -1;
      if (at === -1) {
        el.textContent = custom;
      } else {
        el.appendChild(document.createTextNode(custom.slice(0, at)));
        accent(custom.slice(at, at + name.length));
        el.appendChild(document.createTextNode(custom.slice(at + name.length)));
      }
      return;
    }

    const year = (info.concertDate || "").match(/\b(?:19|20)\d{2}\b/);
    if (year) el.appendChild(document.createTextNode(year[0] + " "));
    if (name) accent(name);
  }

  function renderConcertInfo(info) {
    // The tab title and top-left header are optional; if left blank, build
    // them from the big title so people don't have to type the same thing twice.
    const pageTitle = info.websiteTitle || [info.concertTitleLine1, info.concertTitleLine2].filter(Boolean).join(" - ");
    if (pageTitle) {
      document.title = pageTitle;
    }

    // Optional accent color (headings, links, highlights). Accepts a color name
    // ("red", "hot pink", "sky blue") or a hex code ("#ff0000"); anything the
    // browser doesn't understand is ignored and the default color stays.
    const accent = (info.primaryColor || "").replace(/\s+/g, "");
    if (accent && window.CSS && CSS.supports("color", accent)) {
      document.documentElement.style.setProperty("--primary-color", accent);
    }

    // Optional background dimming: a number from 0 (no dimming) to 100 (black).
    // Empty or not a number keeps the default (50).
    const dimText = (info.backgroundDimming || "").toString().replace("%", "").trim();
    if (dimText !== "" && !isNaN(Number(dimText))) {
      const dim = Math.min(100, Math.max(0, Number(dimText)));
      document.documentElement.style.setProperty("--hero-dim", String(dim / 100));
    }

    const hero = document.getElementById("hero");
    if (hero && info.heroImage) {
      hero.style.backgroundImage = 'url("' + info.heroImage + '")';
    }

    renderHeaderTitle(document.getElementById("header-title-text"), info);

    const schoolName = document.getElementById("concert-school-name");
    if (schoolName) schoolName.textContent = info.concertTitleLine1 || "";

    const concertName = document.getElementById("concert-name");
    if (concertName) concertName.textContent = info.concertTitleLine2 || "";

    const dtl = document.getElementById("concert-datetime-location");
    if (dtl) {
      const parts = [info.concertDate, info.concertTime, info.concertLocation].filter(Boolean);
      dtl.innerHTML = parts.join("<br>");
    }

    const directorsList = document.getElementById("directors-list");
    if (directorsList) {
      const directors = info.directors || [];
      directorsList.innerHTML = directors.join("<br>");
    }

    const accompanistBlock = document.getElementById("accompanist-block");
    const accompanistName = document.getElementById("accompanist-name");
    if (accompanistBlock) {
      if (info.accompanist && info.accompanist.trim()) {
        accompanistBlock.style.display = "";
        if (accompanistName) accompanistName.textContent = info.accompanist;
      } else {
        accompanistBlock.style.display = "none";
      }
    }

    // Optional livestream button: shown only when a web address (http or https) is filled in.
    const liveBlock = document.getElementById("livestream-block");
    const liveLink = document.getElementById("livestream-link");
    if (liveBlock && liveLink) {
      const liveUrl = (info.livestreamLink || "").trim();
      if (/^https?:\/\//i.test(liveUrl)) {
        liveLink.href = liveUrl;
        liveBlock.style.display = "flex";
      } else {
        liveBlock.style.display = "none";
      }
    }

    const thankYouHeading = document.getElementById("thank-you-heading");
    const thankYouWrap = document.getElementById("thank-you-wrap");
    const thankYouList = document.getElementById("thank-you-list");
    const thankYouItems = info.thankYou || [];
    if (thankYouItems.length) {
      if (thankYouHeading) thankYouHeading.style.display = "";
      if (thankYouWrap) thankYouWrap.style.display = "";
      if (thankYouList) {
        thankYouList.innerHTML = "";
        thankYouItems.forEach(function (item) {
          thankYouList.appendChild(el("li", { text: item }));
        });
      }
    } else {
      if (thankYouHeading) thankYouHeading.style.display = "none";
      if (thankYouWrap) thankYouWrap.style.display = "none";
    }

    const closing = document.getElementById("closing-statement");
    if (closing) closing.textContent = info.closingStatement || "Thank you for your support!";
  }

  // Optional director bios: one button per director in the top section. Each opens a pop-up
  // with the director's photo (if any) and bio text. Nothing shows if there are no bios.
  function setupBioDialog() {
    const dialog = document.getElementById("bio-dialog");
    if (!dialog) return;

    function close() {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
    dialog.querySelectorAll("[data-close-bio]").forEach(function (button) {
      button.addEventListener("click", close);
    });
    // a click on the dark area around the pop-up closes it (clicks inside land on the inner box)
    dialog.addEventListener("click", function (event) {
      if (event.target === dialog) close();
    });
  }

  function openBio(bio) {
    const dialog = document.getElementById("bio-dialog");
    if (!dialog) return;

    const photo = document.getElementById("bio-dialog-photo");
    if (bio.photo) {
      photo.src = "assets/img/directors/" + encodeURIComponent(bio.photo);
      photo.alt = bio.name;
      photo.style.display = "";
    } else {
      photo.removeAttribute("src");
      photo.style.display = "none";
    }

    document.getElementById("bio-dialog-name").textContent = bio.name;
    document.getElementById("bio-dialog-group").textContent = bio.group || "";

    const text = document.getElementById("bio-dialog-text");
    text.innerHTML = "";
    bio.paragraphs.forEach(function (paragraph) {
      text.appendChild(el("p", { text: paragraph }));
    });

    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function renderBios(bios) {
    const block = document.getElementById("bios-block");
    const buttons = document.getElementById("bios-buttons");
    if (!block || !buttons) return;

    buttons.innerHTML = "";
    if (!bios || !bios.length) {
      block.style.display = "none";
      return;
    }

    bios.forEach(function (bio) {
      const button = el("button", { className: "btn btn-outline-light p-3 bio-btn" });
      button.type = "button";
      if (bio.group) {
        button.appendChild(document.createTextNode(bio.group));
        button.appendChild(document.createElement("br"));
      }
      button.appendChild(document.createTextNode(bio.name));
      button.addEventListener("click", function () {
        openBio(bio);
      });
      buttons.appendChild(button);
    });
    block.style.display = "";
  }

  function renderProgram(program) {
    const container = document.getElementById("program-container");
    if (!container) return;
    container.innerHTML = "";

    (program.groups || []).forEach(function (group) {
      const item = el("div", { className: "col-lg-12 program-item" });
      const heading = el("h2", { className: group.directors ? "text-center mb-2" : "text-center mb-4" });
      heading.appendChild(el("span", { text: group.name }));
      item.appendChild(heading);

      // optional, for joint concerts: the group's director(s) under its name
      if (group.directors) {
        const label = /,|&|\band\b|\//i.test(group.directors) ? "Directors: " : "Director: ";
        const directorsLine = el("p", { className: "text-center mb-4 program-directors" });
        directorsLine.appendChild(document.createTextNode(label));
        directorsLine.appendChild(el("em", { text: group.directors }));
        item.appendChild(directorsLine);
      }

      const tableWrap = el("div", { className: "table-responsive rounded" });
      const table = el("table", { className: "table table-borderless" });
      const tbody = el("tbody");

      (group.songs || []).forEach(function (song) {
        const tr = el("tr");
        const tdTitle = el("td");
        tdTitle.appendChild(document.createTextNode(song.title || ""));

        // optional movements of a longer piece, numbered 1, 2, 3...
        if (Array.isArray(song.movements) && song.movements.length) {
          const movementList = el("ul", { className: "movements" });
          song.movements.forEach(function (movement, n) {
            movementList.appendChild(el("li", { text: n + 1 + ". " + movement }));
          });
          tdTitle.appendChild(movementList);
        }

        const infoItems = Array.isArray(song.info) ? song.info : song.info ? [song.info] : [];
        if (infoItems.length) {
          const ul = el("ul");
          infoItems.forEach(function (line) {
            ul.appendChild(el("li", { text: line }));
          });
          tdTitle.appendChild(ul);
        }

        const tdComposer = el("td", { className: "text-end", text: song.composer || "" });

        tr.appendChild(tdTitle);
        tr.appendChild(tdComposer);
        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      tableWrap.appendChild(table);
      item.appendChild(tableWrap);
      container.appendChild(item);
    });
  }

  function renderStudents(students) {
    const filters = document.getElementById("students-filters");
    const container = document.getElementById("students-container");
    if (!container) return;

    const groups = students.groups || [];
    const groupFilterClasses = groups.map(function (g) {
      return "filter-" + slugify(g.name);
    });

    if (filters) {
      filters.innerHTML = "";
      // list items that behave as buttons: reachable with Tab, activated with Enter or Space
      const makeButton = function (li, active) {
        li.setAttribute("role", "button");
        li.setAttribute("tabindex", "0");
        li.setAttribute("aria-pressed", active ? "true" : "false");
        return li;
      };

      const allLi = makeButton(el("li", { text: "All" }), true);
      allLi.setAttribute("data-filter", "*");
      allLi.classList.add("filter-active-students");
      filters.appendChild(allLi);

      groups.forEach(function (g, i) {
        const li = makeButton(el("li", { text: g.name }), false);
        li.setAttribute("data-filter", "." + groupFilterClasses[i]);
        filters.appendChild(li);
      });
    }

    container.innerHTML = "";
    groups.forEach(function (g, i) {
      const col = el("div", { className: "col-lg-4 col-sm-12 mt-lg-0 students-item " + groupFilterClasses[i] });
      const box = el("div", { className: "box" });

      box.appendChild(el("span", { className: "text-center", text: g.name }));

      (g.sections || []).forEach(function (sec) {
        // each instrument block (title + names) is wrapped so the name search can hide a whole block
        const block = el("div", { className: "students-section" });
        if (sec.instrument && sec.instrument.trim()) {
          block.appendChild(el("h4", { text: sec.instrument }));
        }
        const ul = el("ul");
        (sec.students || []).forEach(function (name) {
          ul.appendChild(el("li", { text: name }));
        });
        block.appendChild(ul);
        box.appendChild(block);
      });

      col.appendChild(box);
      container.appendChild(col);
    });
  }

  function initIsotope() {
    if (typeof Isotope === "undefined") return;

    const layouts = [];

    const programContainer = document.querySelector(".program-container");
    if (programContainer) {
      layouts.push(new Isotope(programContainer, { itemSelector: ".program-item", layoutMode: "fitRows" }));
    }

    const studentsContainer = document.querySelector(".students-container");
    if (studentsContainer) {
      const studentsIsotope = new Isotope(studentsContainer, { itemSelector: ".students-item", layoutMode: "fitRows" });
      layouts.push(studentsIsotope);
      const studentsFilters = [...document.querySelectorAll("#students-filters li")];

      // what is currently shown: the chosen group button AND the text in the name search
      let groupFilter = "*";
      let searchTerm = "";

      const normalize = function (text) {
        return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      };

      function applyStudentView() {
        const term = normalize(searchTerm);
        let cardsShown = 0;
        studentsContainer.querySelectorAll(".students-item").forEach(function (card) {
          let hits = 0;
          card.querySelectorAll(".students-section").forEach(function (block) {
            let blockHits = 0;
            block.querySelectorAll("li").forEach(function (li) {
              const match = !term || normalize(li.textContent).indexOf(term) !== -1;
              li.classList.toggle("search-hidden", !match);
              if (match) blockHits++;
            });
            block.classList.toggle("search-hidden", term !== "" && blockHits === 0);
            hits += blockHits;
          });
          card.setAttribute("data-hits", String(hits));
        });

        studentsIsotope.arrange({
          filter: function (card) {
            const inGroup = groupFilter === "*" || card.matches(groupFilter);
            const hasHits = card.getAttribute("data-hits") !== "0";
            if (inGroup && hasHits) cardsShown++;
            return inGroup && hasHits;
          },
        });

        const empty = document.getElementById("students-search-empty");
        if (empty) empty.style.display = term && cardsShown === 0 ? "" : "none";
      }

      studentsFilters.forEach(function (li) {
        li.addEventListener("keydown", function (event) {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            this.click();
          }
        });
        li.addEventListener("click", function () {
          studentsFilters.forEach(function (other) {
            other.classList.remove("filter-active-students");
            other.setAttribute("aria-pressed", "false");
          });
          this.classList.add("filter-active-students");
          this.setAttribute("aria-pressed", "true");

          groupFilter = this.getAttribute("data-filter");
          applyStudentView();
        });
      });
      studentsIsotope.on("arrangeComplete", function () {
        if (window.AOS) AOS.refresh();
      });

      const searchBox = document.getElementById("students-search");
      if (searchBox) {
        let searchTimer;
        searchBox.addEventListener("input", function () {
          clearTimeout(searchTimer);
          searchTimer = setTimeout(function () {
            searchTerm = searchBox.value;
            applyStudentView();
          }, 120);
        });
      }
    }

    // Isotope measures each box's height once, when it starts. Web fonts and other late content can
    // change those heights afterwards, which leaves odd gaps or overlaps until the page is refreshed.
    // So measure again when fonts and the page have finished loading, and whenever a box changes size.
    function relayout() {
      layouts.forEach(function (iso) {
        iso.layout();
      });
      if (window.AOS) AOS.refresh();
    }
    if (document.fonts) {
      if (document.fonts.ready) document.fonts.ready.then(relayout);
      // fires every time another font finishes loading, including ones that load later
      if (document.fonts.addEventListener) document.fonts.addEventListener("loadingdone", relayout);
    }
    window.addEventListener("load", relayout);
    // a couple of cheap safety re-checks shortly after the page starts
    setTimeout(relayout, 400);
    setTimeout(relayout, 1500);
    if (typeof ResizeObserver !== "undefined") {
      let timer;
      const observer = new ResizeObserver(function () {
        clearTimeout(timer);
        timer = setTimeout(relayout, 60);
      });
      document.querySelectorAll(".program-item, .students-item").forEach(function (item) {
        observer.observe(item);
      });
    }
  }

  // "Print" buttons: the browser's print dialog (the page has its own print layout, see style.css)
  function setupPrintButtons() {
    document.querySelectorAll("[data-print]").forEach(function (button) {
      button.addEventListener("click", function (event) {
        event.preventDefault();
        window.print();
      });
    });
  }

  async function init() {
    try {
      const data = await loadConcertData();

      renderConcertInfo(data.info);
      renderProgram(data.program);
      renderStudents(data.students);
      renderBios(data.bios);
      setupBioDialog();
      setupPrintButtons();

      initIsotope();
    } catch (err) {
      console.error("Failed to load concert data:", err);
    } finally {
      // the top of the page stays hidden until the real content is in, so the template's
      // placeholder text never flashes (see "data-ready" in style.css)
      document.body.classList.add("data-ready");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
