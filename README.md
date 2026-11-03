# Concert program

The whole website comes from one spreadsheet in the `data` folder. You never need to edit `index.html`. The spreadsheet explains itself: it opens on a **Start Here** tab, and every other tab has instructions at the top.

- **The spreadsheet in `data/`** is the one you send to people to fill out, and the one the website reads. Name it after the concert and the repo (for example `27-spring-band.xlsx`). A blank starter, `concert-data.xlsx`, comes with the template.
- **`examples/EXAMPLE-concert-data.xlsx`** is the same spreadsheet already filled in with made-up data, so people can see what a finished one looks like. The website ignores it.

## Add a new concert

One-time: on the `concert_program_template` repo on GitHub, open Settings and tick **Template repository**.

1. **Make the repo.** On the template repo, click **Use this template**, then **Create a new repository**. Name it for the concert, like `27-spring-band`.
2. **Make and share the spreadsheet.** In OneDrive, copy the blank spreadsheet and name it after the repo: `27-spring-band.xlsx`. Share it and have people fill it out.
3. **Upload the finished spreadsheet.** On GitHub, open the new repo and go to the `data` folder. Click **Add file**, then **Upload files**, drop in `27-spring-band.xlsx`, and commit. You can delete the blank `concert-data.xlsx` there (open it and click the trash icon), but you don't have to; the site uses your file.
4. **Photos (optional).** For a custom background photo, upload it into `assets/img` named exactly `hero-bg.jpg` (it replaces the default; around 2000 pixels wide is plenty). For director bio photos, upload each one into `assets/img/directors` using the same file name you typed on the Bios tab.
5. **Publish it on Netlify (first time only).** In Netlify choose **Add new site**, then **Import an existing project**, then **GitHub**, and pick the repo. The build settings come from `netlify.toml`, so leave them as they are and click **Deploy**. Under Site configuration you can change the site name, which sets the address (for example `27-spring-band.netlify.app`). Button names may be worded a little differently as Netlify updates its pages.
6. **Check the live page** before sharing the link. Make sure it shows your concert and not a blank page. In Netlify, the deploy log should say `find-workbook: using data/27-spring-band.xlsx`.

## View it on your computer (Live Server)

Use this to preview a project before you publish. It needs the project on your computer (for example, cloned with GitHub Desktop) and the **Live Server** extension in VS Code.

**One-time:** in VS Code, open the Extensions panel (the square icon on the left), search for **Live Server**, and click Install.

**Each time:**
1. In VS Code, choose **File > Open Folder** and open the project folder (the one that contains `index.html`).
2. Right-click `index.html` in the file list and choose **Open with Live Server**, or click **Go Live** in the blue bar at the bottom right. Your browser opens the site (usually at `http://127.0.0.1:5500`). The preview finds your spreadsheet in `data/` by itself, using the same rules as publishing (see "Which spreadsheet the site uses" below).
3. After you change and save the spreadsheet, **refresh the browser** (Cmd+R). Live Server often doesn't notice changes saved from Excel, so refresh yourself.
4. To stop it, click **Port: 5500** in the bottom bar.

If the page still shows the placeholder title, make sure `data/` contains just one real spreadsheet. If it still does, run `sh scripts/find-workbook.sh` once in the VS Code terminal (**Terminal > New Terminal**). It tells the preview which file to use.

## Update a concert that's already published

Upload the new spreadsheet to the `data` folder on GitHub again (Add file, then Upload files, then commit). Netlify republishes by itself in about a minute. Use **exactly the same file name** as the one already there, or you'll end up with two spreadsheets and the site may keep showing the old one.

## Bring an older concert up to date with the template

When the template gets new features, copy them into a concert project that was made earlier. From the **template** folder (not the concert project), run:

```bash
sh tools/update-concert.sh ~/Documents/GitHub/26-city-jazz
```

Replace the path with the concert project's folder. Add `--dry-run` at the end to only list what would change. The script copies the website's code (the page, styles, scripts and libraries) and leaves the concert's spreadsheet, photos and README alone. Then commit and push the concert project as usual.

New features that add boxes to the spreadsheet (like Movements) need the new spreadsheet columns too. Copy those into the concert's spreadsheet yourself, or compare it with `data/concert-data.xlsx` in the template.

## Good to know

- **Which spreadsheet the site uses:** each time the site is published, Netlify looks in `data/` and uses the one spreadsheet that isn't the blank starter (`concert-data.xlsx`), an example (a name containing "example"), or an Excel temp file (a name starting with `~$`). Keep just one real spreadsheet in `data/`. If the step fails, the site falls back to `concert-data.xlsx`.
- **Netlify Drop** (drag-and-drop) skips that step, so it loads `data/concert-data.xlsx`.
- **Instruction rows** in the spreadsheet start with the ► mark. The website skips any row that starts that way.
- **Link previews:** when you text or post the link, the title and description in the preview come from the spreadsheet (Big Title, Date, Time, Location). Netlify writes them into the page each time it publishes (`scripts/prepare-site.js`), along with the hero photo as the preview picture. A hero photo under about 600 KB shows up in previews most reliably. The page's own title, which you see in the browser tab, is set by the website itself. Phones remember previews, so after changing a title, an already-sent link may keep its old preview for a while; adding something like `?v=2` to the end of the link makes the phone treat it as new.
- **Fast loading:** each time it publishes, Netlify also reads the spreadsheet once and saves the result as `data/site-data.json` (`scripts/prepare-site.js`). Visitors then download that tiny file instead of the spreadsheet and the large spreadsheet-reading library. If that file isn't there (a local preview, or Netlify Drop), the page reads the spreadsheet itself, so it still works, just a little slower.
- **Directors under a group's name (joint concerts):** the "Directors of this Group (optional)" column of the Program tab. Type a group's directors once, on the same row as the group name, and a "Directors: ..." line appears under that group's name on the website. The label says "Director:" when there's just one name.
- **Optional extras in the spreadsheet:** a **Livestream Link** box on the Concert Info tab adds a "LIVE STREAM" button at the top of the page, and a **Bios** tab adds a button per director that opens a pop-up with their photo and bio. Leave them empty and neither appears.
- **Movements (parts of a longer piece):** the optional "Movements (optional)" column of the Program tab. Type each movement on its own line in the song's row (Alt+Enter on Windows, Option+Return on Mac); the website numbers them 1, 2, 3 under the song title.
- **Student search:** a search box above the student groups lets visitors find a name. It works together with the group buttons and ignores capital letters and accents.
- **Spreadsheet checks:** when Netlify publishes, `scripts/prepare-site.js` also looks for things that look like mistakes (a livestream link that doesn't start with `https://`, a bio photo that isn't in `assets/img/directors/`, a color it doesn't understand, a song with no group name, an empty Date...). They're listed in the deploy log under "things to check in the spreadsheet". The site is published either way. To run the same check on your own computer, from the project folder: `node scripts/prepare-site.js --check` (it changes nothing).
- **Hidden from search engines:** the page has a `noindex` tag, and `netlify.toml` sends a matching header, so the site and the spreadsheet file stay out of Google. People with the link can still open it. To make a site searchable, delete the robots line in `index.html` and the `[[headers]]` block in `netlify.toml`.
- **Printing:** the top bar has a **Print** button. It prints plain black text on white, with every group shown and no buttons or photo, as four sections that each start on a new page (the program and the students are packed into columns to save paper): (1) title, concert info and directors, (2) the program, (3) the students, (4) the thank-yous and closing message. Long programs or student lists continue onto extra pages within their section.
- **Top-left header:** by default it shows the year from the Date plus Big Title Line 2 (for example `2026 City Jazz Concert`), with the concert name in the primary color. Typing your own "Top-Left Header Text" in the spreadsheet replaces it.
