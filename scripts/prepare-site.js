// Runs on Netlify each time the site is published (see netlify.toml). It does three things:
//
// 1. Reads the spreadsheet once and saves the result as data/site-data.json. Visitors' phones then
//    download that small file instead of the spreadsheet plus a large spreadsheet-reading library,
//    so the page appears much faster.
//
// 2. Writes the real title and description into index.html. Link previews (when you text or post the
//    link) read the page's HTML before any JavaScript runs, so they would otherwise show the
//    placeholder title.
//      Title:       "Browser Tab Title" if filled in, otherwise "<Big Title Line 1> - <Big Title Line 2>"
//      Description: "<Date> | <Time> | <Location>"
//    It also adds the preview picture (the hero photo) when Netlify tells it the site's address.
//
// 3. Checks the spreadsheet for things that look like mistakes (a typo'd livestream link, a bio photo
//    that isn't in the folder, a song with no group name...) and lists them in the deploy
//    log. They are only reminders: the site is published either way.
//
// It only changes Netlify's copy of the site, never the files in your repo, and it never fails the
// build: if anything goes wrong the website simply reads the spreadsheet itself, as before.
//
// To try it on your own computer:
//   node scripts/prepare-site.js --check    only lists the things to check; changes nothing
//   node scripts/prepare-site.js --force    does everything, including editing your local index.html
//                                           (so don't commit the result)

const fs = require("fs");
const path = require("path");

const CHECK_ONLY = process.argv.includes("--check");

if (process.env.NETLIFY !== "true" && !process.argv.includes("--force") && !CHECK_ONLY) {
  console.log("prepare-site: not running on Netlify, leaving everything alone");
  process.exit(0);
}

// CSS color names the website understands (written without spaces, in lower case)
const COLOR_NAMES = new Set(("aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood " +
  "cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey " +
  "darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey " +
  "darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite " +
  "gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon " +
  "lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue " +
  "lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid " +
  "mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin " +
  "navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff " +
  "peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver " +
  "skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow " +
  "yellowgreen").split(" "));

const LARGE_IMAGE_BYTES = 600 * 1024;

function simplify(text) {
  return String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
}

// A bare, relative file path inside the project (never a web address or "..")
function projectFile(root, relative) {
  if (!relative || /^[a-z][a-z0-9+.-]*:/i.test(relative) || relative.startsWith("/") || relative.split(/[\\/]/).includes("..")) return null;
  return path.join(root, relative);
}

// Things in the spreadsheet that look like mistakes. Only reminders: nothing here stops the publish.
function findProblems(root, data) {
  const info = data.info;
  const problems = (data.warnings || []).slice();

  if (!info.websiteTitle && !info.concertTitleLine1 && !info.concertTitleLine2) problems.push("Concert Info: both Big Title lines are empty, so the page has no title.");
  if (!info.concertDate) problems.push("Concert Info: Date is empty.");
  if (!info.concertTime) problems.push("Concert Info: Time is empty.");
  if (!info.concertLocation) problems.push("Concert Info: Location is empty.");
  if (!(info.directors || []).length) problems.push("Concert Info: no Director is filled in.");

  const live = (info.livestreamLink || "").trim();
  if (live && !/^https?:\/\//i.test(live)) problems.push('Concert Info: the Livestream Link must start with "https://", so no livestream button will show.');

  const color = (info.primaryColor || "").replace(/\s+/g, "");
  if (color && !/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color) && !COLOR_NAMES.has(color.toLowerCase())) {
    problems.push('Concert Info: the Primary Color "' + info.primaryColor + '" is not a color name or hex code the site understands, so the standard yellow is used.');
  }

  const dim = (info.backgroundDimming || "").toString().replace("%", "").trim();
  if (dim !== "" && (isNaN(Number(dim)) || Number(dim) < 0 || Number(dim) > 100)) {
    problems.push('Concert Info: Background Dimming "' + info.backgroundDimming + '" should be a number from 0 to 100.');
  }

  const hero = info.heroImage || "assets/img/hero-bg.jpg";
  const heroFile = projectFile(root, hero);
  if (!heroFile) {
    problems.push('Concert Info: the Hero Image "' + hero + '" should be a file in this project (like assets/img/hero-bg.jpg).');
  } else if (!fs.existsSync(heroFile)) {
    problems.push('Concert Info: the Hero Image file "' + hero + '" is not in the project.');
  } else if (fs.statSync(heroFile).size > LARGE_IMAGE_BYTES) {
    problems.push('The hero photo "' + hero + '" is ' + Math.round(fs.statSync(heroFile).size / 1024) + " KB. Under about 600 KB loads faster and shows up in link previews more reliably (squoosh.app can shrink it).");
  }

  (data.bios || []).forEach(function (bio) {
    if (bio.photo && !fs.existsSync(path.join(root, "assets", "img", "directors", bio.photo))) {
      problems.push('Bios tab: the photo "' + bio.photo + '" for ' + bio.name + " is not in assets/img/directors/, so no photo is shown.");
    }
  });

  // (Program group names and student tab names are allowed to differ, e.g. "South High School Jazz Band 2"
  // in the program and "South Jazz 2" on its tab, so they are not compared.)
  if (!(data.program.groups || []).length) problems.push("Program tab: no songs found.");
  if (!(data.students.groups || []).length) problems.push("No student names found on any group tab.");

  return problems;
}

function printProblems(problems) {
  if (!problems.length) {
    console.log("prepare-site: checked the spreadsheet, nothing to flag");
    return;
  }
  console.log("prepare-site: " + problems.length + " thing" + (problems.length === 1 ? "" : "s") + " to check in the spreadsheet (the site is published anyway):");
  problems.forEach(function (problem) {
    console.log("  - " + problem);
  });
}

try {
  const root = path.join(__dirname, "..");
  const XLSX = require(path.join(root, "assets", "vendor", "xlsx", "xlsx.full.min.js"));
  const ConcertParser = require(path.join(root, "assets", "js", "parse-workbook.js"));

  // which spreadsheet: the one find-workbook.sh recorded, else the default name
  let workbookName = "concert-data.xlsx";
  try {
    const recorded = fs.readFileSync(path.join(root, "data", "workbook.txt"), "utf8").trim();
    if (/\.xlsx$/i.test(recorded) && !/[\\/]/.test(recorded)) workbookName = recorded;
  } catch (err) {
    // no workbook.txt (for example when checking on your own computer): use the one real spreadsheet
    // in data/ - not the blank starter, an example, or an Excel temp file - else the default
    const found = fs.readdirSync(path.join(root, "data")).filter(function (name) {
      return /\.xlsx$/i.test(name) && !/^~\$|example/i.test(name) && name.toLowerCase() !== "concert-data.xlsx";
    });
    if (found.length) workbookName = found.sort()[0];
  }

  const workbook = XLSX.read(fs.readFileSync(path.join(root, "data", workbookName)), { type: "buffer" });
  const data = ConcertParser.parseWorkbook(XLSX, workbook);
  const info = data.info;

  // 3. reminders about anything that looks like a mistake
  const problems = findProblems(root, data);
  delete data.warnings; // only for the log above, the website doesn't need them
  printProblems(problems);
  if (CHECK_ONLY) process.exit(0);

  // 1. the pre-read data for the website
  fs.writeFileSync(path.join(root, "data", "site-data.json"), JSON.stringify(data));
  console.log("prepare-site: saved data/site-data.json from " + workbookName);

  // 2. the title and description for link previews
  const title = info.websiteTitle || [info.concertTitleLine1, info.concertTitleLine2].filter(Boolean).join(" - ");
  const description = [info.concertDate, info.concertTime, info.concertLocation].filter(Boolean).join(" | ");

  if (!title) {
    console.log("prepare-site: no title in the spreadsheet yet, leaving the page title alone");
  } else {
    const esc = function (text) {
      return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    };

    const indexPath = path.join(root, "index.html");
    let html = fs.readFileSync(indexPath, "utf8");

    html = html.replace(/<title>[\s\S]*?<\/title>/i, "<title>" + esc(title) + "</title>");

    // replace the existing description tag, and any preview tags from an earlier run
    html = html.replace(/\s*<meta[^>]*name="description"[^>]*>/gi, "");
    html = html.replace(/\s*<meta[^>]*property="og:[^"]*"[^>]*>/gi, "");
    html = html.replace(/\s*<meta[^>]*name="twitter:[^"]*"[^>]*>/gi, "");
    const tags = [
      '<meta name="description" content="' + esc(description) + '">',
      '<meta property="og:type" content="website">',
      '<meta property="og:title" content="' + esc(title) + '">',
      '<meta property="og:description" content="' + esc(description) + '">',
    ];

    // the preview picture: the hero photo, as a full web address (Netlify provides the site's address)
    const siteUrl = (process.env.URL || "").replace(/\/+$/, "");
    const heroPath = info.heroImage || "assets/img/hero-bg.jpg";
    const heroFile = projectFile(root, heroPath);
    if (/^https?:\/\//i.test(siteUrl) && heroFile && fs.existsSync(heroFile)) {
      const imageUrl = siteUrl + "/" + heroPath.split("/").map(encodeURIComponent).join("/");
      tags.push('<meta property="og:url" content="' + esc(siteUrl + "/") + '">');
      tags.push('<meta property="og:image" content="' + esc(imageUrl) + '">');
      tags.push('<meta name="twitter:card" content="summary_large_image">');
      console.log("prepare-site: preview picture " + imageUrl);
    } else {
      console.log("prepare-site: no preview picture (no site address from Netlify, or no hero image file)");
    }
    html = html.replace(/<\/head>/i, "  " + tags.join("\n  ") + "\n</head>");

    fs.writeFileSync(indexPath, html);
    console.log('prepare-site: title "' + title + '"' + (description ? ', description "' + description + '"' : ""));
  }
} catch (err) {
  console.log("prepare-site: skipped (" + err.message + ")");
}
process.exit(0);
