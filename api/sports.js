import chromium from "chromium";
import puppeteer from "puppeteer-core";

const delay = (ms) => new Promise(res => setTimeout(res, ms));

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
      "Accept-Encoding": "gzip, deflate, br",
      Connection: "keep-alive",
      "Upgrade-Insecure-Requests": "1",
    });

    await page.goto("https://www.oddsportal.com/", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    await page.waitForSelector('nav[aria-label="Sports Menu"]', {
      timeout: 60000,
    });

    await delay(6000);

    const sports = await page.evaluate(() => {
      const items = document.querySelectorAll(
        'nav[aria-label="Sports Menu"] ul li'
      );
      return Array.from(items)
        .map((li) => {
          const img = li.querySelector("img");
          const name = li.querySelector('div[class*="text-white"]');
          const alt = img ? img.alt : null;

          return {
            name: name ? name.textContent.trim() : null,
            icon: img ? img.src : null,
            alt: alt,
            url: alt ? `https://www.oddsportal.com/${alt}/` : null,
          };
        })
        .filter((s) => s.name);
    });

    await browser.close();

    return res.status(200).json({
      success: true,
      count: sports.length,
      sports,
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
