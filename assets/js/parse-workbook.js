/**
 * Turns the concert spreadsheet (a SheetJS workbook) into plain data:
 *   { info, program, students, bios, warnings }
 *
 * Used in two places, so the result is always the same:
 *   - scripts/prepare-site.js, when Netlify publishes the site (it saves the result as data/site-data.json);
 *   - the website itself (render.js), only if that saved file isn't there (for example in a local preview).
 *
 * Usage:  ConcertParser.parseWorkbook(XLSX, workbook)
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ConcertParser = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Tabs that are not student groups.
  const RESERVED_SHEET_NAMES = new Set(["start here", "instructions", "example", "concert info", "program", "bios"]);

  // Rows whose first cell starts with this mark are instructions for the
  // person filling out the spreadsheet, and are ignored when reading it.
  const NOTE_MARK = "►"; // ►

  function cellText(value) {
    return value === undefined || value === null ? "" : value.toString().trim();
  }

  function normalizeLabel(value) {
    return cellText(value).toLowerCase().replace(/\s+/g, " ");
  }

  // Rows of a sheet as arrays of cell text (as displayed in Excel), minus the instruction rows.
  function readRows(XLSX, sheet) {
    return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false }).filter(function (row) {
      return cellText(row[0]).indexOf(NOTE_MARK) !== 0;
    });
  }

  function splitLines(value) {
    return (value === undefined || value === null ? "" : value.toString())
      .split(/\r\n|\r|\n/)
      .map(function (line) {
        return line.trim();
      })
      .filter(Boolean);
  }

  function findColumn(headers, names) {
    return headers.findIndex(function (h) {
      return names.indexOf(h) !== -1;
    });
  }

  // "Concert Info" tab: label in column A, answer in column B. Anything in other columns (help text,
  // examples) is ignored. "Director" and "Person or Group to Thank" can repeat on as many rows as
  // needed. The older labels (e.g. "Concert Title Line 1") are still understood.
  const INFO_FIELDS = new Map([
    ["big title line 1 - school or group name", "concertTitleLine1"],
    ["big title line 2 - name of the concert", "concertTitleLine2"],
    ["date", "concertDate"],
    ["time", "concertTime"],
    ["location", "concertLocation"],
    ["director", "directors"],
    ["accompanist (optional)", "accompanist"],
    ["person or group to thank (optional)", "thankYou"],
    ["closing message", "closingStatement"],
    ["livestream link (optional)", "livestreamLink"],
    ["livestream link", "livestreamLink"],
    ["browser tab title (optional)", "websiteTitle"],
    ["top-left header text (optional)", "headerTitle"],
    ["hero image (leave as is)", "heroImage"],
    ["primary color (optional)", "primaryColor"],
    ["primary color", "primaryColor"],
    ["background dimming (optional)", "backgroundDimming"],
    // older labels
    ["concert title line 1", "concertTitleLine1"],
    ["concert title line 2", "concertTitleLine2"],
    ["concert date", "concertDate"],
    ["concert time", "concertTime"],
    ["concert location", "concertLocation"],
    ["accompanist", "accompanist"],
    ["thank you", "thankYou"],
    ["closing statement", "closingStatement"],
    ["website title", "websiteTitle"],
    ["header title", "headerTitle"],
    ["hero image", "heroImage"],
  ]);
  const INFO_LIST_FIELDS = new Set(["directors", "thankYou"]);

  function parseConcertInfoSheet(XLSX, sheet) {
    const info = { directors: [], thankYou: [] };

    readRows(XLSX, sheet).forEach(function (row) {
      const key = INFO_FIELDS.get(normalizeLabel(row[0]));
      if (!key) return;

      const value = cellText(row[1]);
      if (INFO_LIST_FIELDS.has(key)) {
        if (value) info[key].push(value);
      } else {
        info[key] = value;
      }
    });

    return info;
  }

  // "Program" tab: one row per song. The header row is found by looking for the song-title column,
  // so instructions above it are fine. A blank Group cell continues the previous row's group. The
  // notes cell supports multiple lines (Alt+Enter in Excel) for multiple soloists. Rows without a
  // song title are skipped, so unused rows can stay blank.
  const PROGRAM_HEADERS = {
    group: ["group name", "group", "ensemble"],
    title: ["song title", "title", "song"],
    composer: ["composer / arranger", "composer/arranger", "composer", "arranger"],
    info: ["soloists or notes (optional)", "soloists or notes", "info", "soloist", "notes"],
    // optional, for joint concerts: the director(s) of that group, shown under the group's name
    directors: [
      "directors of this group (optional)",
      "directors of this group",
      "group directors (optional)",
      "group directors",
      "directors (optional)",
      "director(s)",
      "directors",
      "director",
    ],
    // optional: the parts of a longer piece, one per line; shown numbered under the song title
    movements: ["movements (optional)", "movements", "movement", "parts of this piece"],
  };

  // a movement typed as "1. Chaconne" or "2) Toccata" is shown as "1. Chaconne" / "2. Toccata" either way
  function parseMovements(value) {
    return splitLines(value).map(function (line) {
      return line.replace(/^\d+\s*[.)]\s*/, "");
    }).filter(Boolean);
  }

  // Besides the data, the parse functions note anything that looks like a mistake in `warnings`
  // (scripts/prepare-site.js prints them when the site is published).
  function parseProgramSheet(XLSX, sheet, warnings) {
    const rows = readRows(XLSX, sheet);
    const headerIndex = rows.findIndex(function (row) {
      return findColumn(row.map(normalizeLabel), PROGRAM_HEADERS.title) !== -1;
    });
    if (headerIndex === -1) return { groups: [] };

    const headers = rows[headerIndex].map(normalizeLabel);
    const groupCol = findColumn(headers, PROGRAM_HEADERS.group);
    const titleCol = findColumn(headers, PROGRAM_HEADERS.title);
    const composerCol = findColumn(headers, PROGRAM_HEADERS.composer);
    const infoCol = findColumn(headers, PROGRAM_HEADERS.info);
    const directorsCol = findColumn(headers, PROGRAM_HEADERS.directors);
    const movementsCol = findColumn(headers, PROGRAM_HEADERS.movements);

    const groups = [];
    const groupsByName = new Map();
    let lastGroupName = "";

    rows.slice(headerIndex + 1).forEach(function (row) {
      const title = cellText(row[titleCol]);
      if (!title) {
        // text in the other boxes but no song title: that row is skipped, which is probably not what was meant
        const stray = [composerCol, infoCol, movementsCol].some(function (c) {
          return c !== -1 && cellText(row[c]);
        });
        if (stray) warnings.push('Program tab: a row has a composer, notes or movements but no Song Title, so it is left out ("' + (cellText(row[composerCol]) || cellText(row[infoCol]) || "...").slice(0, 40) + '").');
        return;
      }

      let groupName = groupCol === -1 ? "" : cellText(row[groupCol]);
      if (groupName) {
        lastGroupName = groupName;
      } else {
        groupName = lastGroupName;
      }
      if (!groupName) {
        warnings.push('Program tab: the song "' + title + '" has no Group Name above it, so it is left out.');
        return;
      }

      const composer = composerCol === -1 ? "" : cellText(row[composerCol]);
      const info = infoCol === -1 ? [] : splitLines(row[infoCol]);

      let group = groupsByName.get(groupName);
      if (!group) {
        group = { name: groupName, songs: [] };
        groupsByName.set(groupName, group);
        groups.push(group);
      }
      const song = { title: title, composer: composer, info: info };
      const movements = movementsCol === -1 ? [] : parseMovements(row[movementsCol]);
      if (movements.length) song.movements = movements;
      group.songs.push(song);

      // the group's directors: typed once, on a row of that group (the first one found is used)
      if (directorsCol !== -1 && !group.directors) {
        const directors = splitLines(row[directorsCol]).join(", ");
        if (directors) group.directors = directors;
      }
    });

    groups.forEach(function (group) {
      if (/^type group name here$/i.test(group.name)) {
        warnings.push('Program tab: songs are listed under "' + group.name + '" - the group name was never filled in.');
      }
    });

    return { groups: groups };
  }

  // "Bios" tab (optional): one row per director. Needs a name and bio text; rows missing either are
  // skipped, so spare rows can stay blank. The bio can have several paragraphs (Alt+Enter in Excel).
  const BIO_HEADERS = {
    group: ["group or ensemble", "group", "ensemble", "group name"],
    name: ["director name", "name", "director"],
    photo: ["photo file name (optional)", "photo file name", "photo"],
    bio: ["bio", "bio text", "biography"],
  };

  function parseBiosSheet(XLSX, sheet, warnings) {
    const rows = readRows(XLSX, sheet);
    const headerIndex = rows.findIndex(function (row) {
      return findColumn(row.map(normalizeLabel), BIO_HEADERS.name) !== -1;
    });
    if (headerIndex === -1) return [];

    const headers = rows[headerIndex].map(normalizeLabel);
    const groupCol = findColumn(headers, BIO_HEADERS.group);
    const nameCol = findColumn(headers, BIO_HEADERS.name);
    const photoCol = findColumn(headers, BIO_HEADERS.photo);
    const bioCol = findColumn(headers, BIO_HEADERS.bio);
    if (bioCol === -1) return [];

    const bios = [];
    rows.slice(headerIndex + 1).forEach(function (row) {
      const name = cellText(row[nameCol]);
      const paragraphs = splitLines(row[bioCol]);
      if (!name || !paragraphs.length) {
        if (name || paragraphs.length) {
          warnings.push("Bios tab: " + (name ? '"' + name + '" has no bio text' : "a bio has no director name") + ", so that row is left out.");
        }
        return;
      }

      const photo = photoCol === -1 ? "" : cellText(row[photoCol]);
      if (photo && !/^[^\/\\:]+\.(jpe?g|png|webp|gif)$/i.test(photo)) {
        warnings.push('Bios tab: the photo for "' + name + '" should be just a file name like "olson.jpg" (not a path or web address), so no photo is shown.');
      }
      bios.push({
        group: groupCol === -1 ? "" : cellText(row[groupCol]),
        name: name,
        // just a file name (it lives in assets/img/directors/); never a path or web address
        photo: /^[^\/\\:]+\.(jpe?g|png|webp|gif)$/i.test(photo) ? photo : "",
        paragraphs: paragraphs,
      });
    });
    return bios;
  }

  // A student group tab: the first row is the instrument names (one per column) and the names go
  // underneath. Columns may be different lengths. Instruments with no students are left out, and a
  // tab with no students at all is skipped, so spare columns and spare tabs can stay as they are.
  // A tab that only has one column is shown as a plain list with no instrument heading.
  function parseStudentGroupSheet(XLSX, sheet, sheetName) {
    const rows = readRows(XLSX, sheet);
    if (!rows.length) return null;

    const headerRow = rows[0];
    const dataRows = rows.slice(1);
    const columnCount = dataRows.reduce(function (max, r) {
      return Math.max(max, r.length);
    }, headerRow.length);

    const columns = [];
    for (let c = 0; c < columnCount; c++) {
      const header = cellText(headerRow[c]);
      const values = dataRows
        .map(function (r) {
          return cellText(r[c]);
        })
        .filter(Boolean);
      if (header || values.length) columns.push({ header: header, values: values });
    }

    const sections =
      columns.length === 1
        ? [{ instrument: "", students: columns[0].values }]
        : columns
            .filter(function (c) {
              return c.values.length;
            })
            .map(function (c) {
              return { instrument: c.header, students: c.values };
            });

    if (
      !sections.some(function (s) {
        return s.students.length;
      })
    ) {
      return null;
    }
    return { name: sheetName, sections: sections };
  }

  function parseWorkbook(XLSX, workbook) {
    let info = { directors: [], thankYou: [] };
    let program = { groups: [] };
    let bios = [];
    const studentGroups = [];
    const warnings = [];

    workbook.SheetNames.forEach(function (name) {
      const normalized = name.trim().toLowerCase();
      const sheet = workbook.Sheets[name];
      if (normalized === "concert info") {
        info = parseConcertInfoSheet(XLSX, sheet);
      } else if (normalized === "program") {
        program = parseProgramSheet(XLSX, sheet, warnings);
      } else if (normalized === "bios") {
        bios = parseBiosSheet(XLSX, sheet, warnings);
      } else if (!RESERVED_SHEET_NAMES.has(normalized)) {
        const group = parseStudentGroupSheet(XLSX, sheet, name);
        if (group) studentGroups.push(group);
      }
    });

    return { info: info, program: program, students: { groups: studentGroups }, bios: bios, warnings: warnings };
  }

  return { parseWorkbook: parseWorkbook };
});
