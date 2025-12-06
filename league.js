const puppeteer = require('puppeteer');
const fs = require('fs');

// Helper function for delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function parseLeaguesFromSports() {
    if (!fs.existsSync('sports.json')) {
        console.error('Error: sports.json not found.');
        return;
    }

    const sportsData = JSON.parse(fs.readFileSync('sports.json', 'utf-8'));
    console.log(`Found ${sportsData.length} sports\n`);

    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox', '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled',
            '--disable-features=IsolateOrigins,site-per-process',
            '--flag-switches-begin --disable-site-isolation-trials --flag-switches-end'
        ],
        ignoreDefaultArgs: ['--enable-automation']
    });

    const finalOutput = [];

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });

        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36'
        );

        await page.setExtraHTTPHeaders({
            'Accept-Language': 'ka,en-US;q=0.9,en;q=0.8',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        });

        // ---------------------------
        //  LOOP ALL SPORTS
        // ---------------------------
        for (const sport of sportsData) {

            console.log(`\nParsing: ${sport.name}`);
            console.log(`URL: ${sport.url}`);

            await page.goto(sport.url, {
                waitUntil: 'networkidle0',
                timeout: 90000
            });

            await page.waitForSelector("main", { timeout: 30000 });
            await delay(3000);

            console.log("Page loaded. Extracting...");

            // ---------------------------
            //  EXTRACT COUNTRIES & LEAGUES
            // ---------------------------
            const { countries, leagues } = await page.evaluate((sport) => {
                const rows = document.querySelectorAll("main div.flex");
                const countries = [];
                const leagues = [];

                rows.forEach(row => {
                    const link = row.querySelector("a");
                    if (!link) return;

                    const img = row.querySelector("img");
                    const url = link.href.startsWith("http")
                        ? link.href
                        : "https://www.oddsportal.com" + link.getAttribute("href");

                    if (img) {
                        // COUNTRY
                        countries.push({
                            sport: sport.alt,
                            name: link.textContent.trim(),
                            url: url,
                            flag: img.getAttribute("src"),
                        });
                    } else {
                        // LEAGUE GROUP
                        const ul = row.querySelector("ul");
                        if (!ul) return;

                        const items = Array.from(ul.querySelectorAll("li a")).map(a => ({
                            name: a.textContent.trim(),
                            alt : a.getAttribute("href").split('/').filter(Boolean).pop(),
                            url: a.href.startsWith("http")
                                ? a.href
                                : "https://www.oddsportal.com" + a.getAttribute("href")
                        }));

                        if (items.length > 0) leagues.push(items);
                    }
                });

                return { countries, leagues };
            }, sport);

        fs.writeFileSync("countries.json", JSON.stringify(countries, null, 2));
        console.log("\n✓ All sports processed → leagues.json saved");
            // ---------------------------
            //  MATCH LEAGUES → COUNTRIES
            // ---------------------------
            const result = [];

            countries.forEach(country => {
                const relatedLeagues = [];

                leagues.forEach(list => {
                    list.forEach(league => {
                        if (league.url.startsWith(country.url)) {
                            relatedLeagues.push(league);
                        }
                    });
                });

                if (relatedLeagues.length === 0) return;

                result.push({
                    sport: country.sport,
                    country: country.name,
                    url: country.url,
                    flag: country.flag,
                    leagues: relatedLeagues
                });
            });

            // ---------------------------
            //  REMOVE DUPLICATES
            // ---------------------------
            const unique = new Map();

            result.forEach(entry => {
                const key = `${entry.sport}|${entry.country}|${entry.url}`;

                if (!unique.has(key)) {
                    unique.set(key, {
                        ...entry,
                        leagues: [...entry.leagues]
                    });
                } else {
                    const existing = unique.get(key);

                    entry.leagues.forEach(l => {
                        if (!existing.leagues.find(x => x.url === l.url)) {
                            existing.leagues.push(l);
                        }
                    });
                }
            });

            const cleaned = Array.from(unique.values());

            console.log(`→ ${cleaned.length} countries with leagues extracted`);

            finalOutput.push(...cleaned);
        }

        // ---------------------------
        //  SAVE RESULT
        // ---------------------------
        fs.writeFileSync("leagues.json", JSON.stringify(finalOutput, null, 2));
        console.log("\n✓ All sports processed → leagues.json saved");

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await delay(3000);
        await browser.close();
    }
}

parseLeaguesFromSports();
