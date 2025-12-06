const puppeteer = require('puppeteer');
const fs = require('fs');

// Helper function for delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function parseSportsMenu() {
          const browserOptions = {
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled',
                '--disable-features=IsolateOrigins,site-per-process',
                '--flag-switches-begin --disable-site-isolation-trials --flag-switches-end'
            ],
            ignoreDefaultArgs: ['--enable-automation'],
            ignoreHTTPSErrors: false
        };

  const browser = await puppeteer.launch( puppeteer.launch(browserOptions));
 
 
  try {

            page = await browser.newPage();
            
            await page.setViewport({ width: 1920, height: 1080 });
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36');
            
            await page.setExtraHTTPHeaders({
                'Accept-Language': 'ka,en-US;q=0.9,en;q=0.8',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            });

 
            const firstPageUrl = `https://www.oddsportal.com/`;
          
            
            await page.goto(firstPageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

            console.log('Page loaded, waiting for sports menu...');
    
    // Wait for sports menu
    await page.waitForSelector('nav[aria-label="Sports Menu"]', { 
      timeout: 60000 
    });
    
    // Give extra time for content to render
    await delay(6000);
    
    // Parse all sports from ul > li
    const sports = await page.evaluate(() => {
      const menuItems = document.querySelectorAll('nav[aria-label="Sports Menu"] ul li');
      
      return Array.from(menuItems).map(li => {
        const img = li.querySelector('img');
        const sportName = li.querySelector('div[class*="text-white"]');
        const alt = img ? img.alt : null;
        
        return {
          name: sportName ? sportName.textContent.trim() : null,
          icon: img ? img.src : null,
          alt: alt,
          url: alt ? `https://www.oddsportal.com/${alt}/` : null
        };
      }).filter(sport => sport.name);
    });
    
    
    if (sports.length === 0) {
      console.log('No sports found, check selectors');
    } else {
      // Save to JSON file
      fs.writeFileSync('sports.json', JSON.stringify(sports, null, 2));
      console.log(`✓ Successfully saved ${sports.length} sports to sports.json`);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

parseSportsMenu();