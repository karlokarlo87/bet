import chromium from "chromium";
import puppeteer from "puppeteer-core";

const delay = (ms) => new Promise(res => setTimeout(res, ms));

export default async function handler(req, res) {
  const leagueUrl =
    req.query.url ||
    "https://www.oddsportal.com/football/england/premier-league/";

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
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      Connection: "keep-alive",
    });

    console.log("Navigating:", leagueUrl);

    await page.goto(leagueUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    await page.waitForSelector("main", { timeout: 30000 });
    await delay(4000);

    // Extract league Info + matches
    const leagueData = await page.evaluate(() => {
      const matches = [];
      let currentDate = null;

      const breadcrumb = document.querySelector(
        '[data-testid="sport-country-league-item"]'
      );

      let sport = null,
        country = null,
        league = null;

      if (breadcrumb) {
        sport = breadcrumb
          .querySelector('[data-testid="header-sport-item"]')
          ?.textContent.trim();
        country = breadcrumb
          .querySelector('[data-testid="header-country-item"] p')
          ?.textContent.trim();
        league = breadcrumb
          .querySelector('[data-testid="header-tournament-item"]')
          ?.textContent.trim();
      }

      const rows = document.querySelectorAll(".eventRow");

      rows.forEach((row) => {
        const dateHeader = row.querySelector(
          '[data-testid="secondary-header"] [data-testid="date-header"]'
        );
        if (dateHeader) currentDate = dateHeader.textContent.trim();

        const gameRow = row.querySelector('[data-testid="game-row"]');
        if (!gameRow) return;

        const matchLink = gameRow.closest("a");
        const matchUrl = matchLink
          ? matchLink.getAttribute("href")
          : null;

        const timeElement = gameRow.querySelector(
          '[data-testid="time-item"] p'
        );
        const time = timeElement ? timeElement.textContent.trim() : null;

        const participants = gameRow.querySelector(
          '[data-testid="event-participants"]'
        );
        const teamLinks = participants
          ? participants.querySelectorAll("a[title]")
          : [];

        let home = null,
          away = null,
          homeLogo = null,
          awayLogo = null;

        if (teamLinks.length >= 2) {
          home = teamLinks[0].getAttribute("title");
          away = teamLinks[1].getAttribute("title");

          homeLogo = teamLinks[0].querySelector("img")?.src || null;
          awayLogo = teamLinks[1].querySelector("img")?.src || null;
        }

        const oddCells = row.querySelectorAll(
          '[data-testid="odd-container-default"] p'
        );

        let odds = { home: null, draw: null, away: null };

        if (oddCells.length >= 3) {
          odds.home = oddCells[0].textContent.trim();
          odds.draw = oddCells[1].textContent.trim();
          odds.away = oddCells[2].textContent.trim();
        }

        const bookies = row.querySelector(
          '[data-testid="bookies-amount-item"] div'
        )?.textContent.trim();

        if (home && away) {
          matches.push({
            date: currentDate,
            time,
            homeTeam: home,
            homeTeamLogo: homeLogo,
            awayTeam: away,
            awayTeamLogo: awayLogo,
            odds,
            bookmakers: bookies,
            url: matchUrl
              ? matchUrl.startsWith("http")
                ? matchUrl
                : "https://www.oddsportal.com" + matchUrl
              : null,
          });
        }
      });

      return {
        sport,
        country,
        league,
        totalMatches: matches.length,
        matches,
      };
    });

    await browser.close();

    return res.status(200).json({
      success: true,
      leagueUrl,
      ...leagueData,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
