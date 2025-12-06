import chromium from "chromium";
import puppeteer from "puppeteer-core";

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ----------------------------------------
//  GET SPORTS LIST (same logic as sports.js)
// ----------------------------------------
async function getSportsList(page) {
  await page.goto("https://www.oddsportal.com/", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  await page.waitForSelector('nav[aria-label="Sports Menu"]', { timeout: 60000 });
  await delay(5000);

  const sports = await page.evaluate(() => {
    const menuItems = document.querySelectorAll('nav[aria-label="Sports Menu"] ul li');

    return Array.from(menuItems)
      .map(li => {
        const img = li.querySelector("img");
        const name = li.querySelector('div[class*="text-white"]');
        const alt = img ? img.alt : null;

        return {
          name: name ? name.textContent.trim() : null,
          alt,
          icon: img?.src || null,
          url: alt ? `https://www.oddsportal.com/${alt}/` : null,
        };
      })
      .filter(s => s.name);
  });

  return sports;
}

// ----------------------------------------
//  MAIN HANDLER
// ----------------------------------------
export default async function handler(req, res) {
  try {
    const browser = await puppeteer.launch({
      executablePath: await chromium.executablePath(),
      args: chromium.args,
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36"
    );

    await page.setExtraHTTPHeaders({
      "Accept-Language": "ka,en-US;q=0.9,en;q=0.8",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    });

    // 1) FETCH SPORTS LIST
    const sports = await getSportsList(page);

    let finalOutput = [];

    // ----------------------------------------
    // 2) LOOP ALL SPORTS → GET COUNTRIES & LEAGUES
    // ----------------------------------------
    for (const sport of sports) {
      if (!sport.url) continue;

      console.log("Parsing:", sport.name);

      await page.goto(sport.url, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });

      await page.waitForSelector("main", { timeout: 30000 });
      await delay(3000);

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
              url,
              flag: img.src,
            });
          } else {
            // LEAGUES GROUP
            const ul = row.querySelector("ul");
            if (!ul) return;

            const items = Array.from(ul.querySelectorAll("li a")).map(a => ({
              name: a.textContent.trim(),
              alt: a.getAttribute("href").split("/").filter(Boolean).pop(),
              url: a.href.startsWith("http")
                ? a.href
                : "https://www.oddsportal.com" + a.getAttribute("href"),
            }));

            if (items.length) leagues.push(items);
          }
        });

        return { countries, leagues };
      }, sport);

      // ------------------------------------
      // 3) MATCH LEAGUES TO COUNTRIES
      // ------------------------------------
      const result = [];

      countries.forEach(country => {
        const relatedLeagues = [];

        leagues.forEach(list => {
          list.forEach(l => {
            if (l.url.startsWith(country.url)) {
              relatedLeagues.push(l);
            }
          });
        });

        if (relatedLeagues.length > 0) {
          result.push({
            sport: country.sport,
            country: country.name,
            url: country.url,
            flag: country.flag,
            leagues: relatedLeagues,
          });
        }
      });

      finalOutput.push(...result);
    }

    await browser.close();

    return res.status(200).json({
      success: true,
      total_countries: finalOutput.length,
      data: finalOutput,
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
