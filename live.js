const puppeteer = require('puppeteer');
const fs = require('fs');

// Helper function for delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function parseInPlaySports() {
  const inPlayUrl = 'https://www.oddsportal.com/inplay-odds/';
  
  const browserOptions = {
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process'
    ],
    ignoreDefaultArgs: ['--enable-automation'],
    ignoreHTTPSErrors: false
  };

  const browser = await puppeteer.launch(browserOptions);

  try {
    const page = await browser.newPage();
    
    page.on('console', msg => {
      const text = msg.text();
      if (!text.includes('Failed to load') && !text.includes('CORS') && !text.includes('Zone')) {
        console.log('PAGE:', text);
      }
    });
    
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36');
    
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'ka,en-US;q=0.9,en;q=0.8',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    });

    console.log(`\nNavigating to: ${inPlayUrl}\n`);
    
    await page.goto(inPlayUrl, { 
      waitUntil: 'networkidle0',
      timeout: 60000 
    });
    
    console.log('Page loaded, waiting for content...');
    
    await page.waitForSelector('[data-testid="sport-tabs-nav-menu"]', { timeout: 30000 });
    console.log('✓ Sport tabs found');
    
    await delay(3000);
    
    console.log('Parsing sport tabs...\n');
    
    // Extract all sport tabs
    const sportsData = await page.evaluate(() => {
      const sports = [];
      
      // Get visible sport tabs
      const visibleTabs = document.querySelectorAll('[data-testid="sport-tabs-nav-menu"] > a[href*="/inplay-odds/live-now/"]');
      
      visibleTabs.forEach(tab => {
        const href = tab.getAttribute('href');
        const sportNameElement = tab.querySelector('[data-testid="sport-tab-name"]');
        const sportIconElement = tab.querySelector('[data-testid="sport-tab-icon"] img');
        
        if (href && sportNameElement) {
          const sportName = sportNameElement.textContent.trim();
          const sportIcon = sportIconElement ? sportIconElement.getAttribute('src') : null;
          const url = href.startsWith('http') ? href : 'https://www.oddsportal.com' + href;
          
          sports.push({
            name: sportName,
            url: url,
            icon: sportIcon
          });
        }
      });
      
      // Get hidden sport tabs (in "More" dropdown)
      const hiddenTabs = document.querySelectorAll('[data-testid="sport-tabs-nav-hidden-menu"] > a[href*="/inplay-odds/live-now/"]');
      
      hiddenTabs.forEach(tab => {
        const href = tab.getAttribute('href');
        const sportNameElement = tab.querySelector('[data-testid="sport-tab-name"]');
        const sportIconElement = tab.querySelector('[data-testid="sport-tab-icon"] img');
        
        if (href && sportNameElement) {
          const sportName = sportNameElement.textContent.trim();
          const sportIcon = sportIconElement ? sportIconElement.getAttribute('src') : null;
          const url = href.startsWith('http') ? href : 'https://www.oddsportal.com' + href;
          
          sports.push({
            name: sportName,
            url: url,
            icon: sportIcon
          });
        }
      });
      
      console.log(`Found ${sports.length} sports in navigation`);
      
      return sports;
    });
    
    console.log(`✓ Extracted ${sportsData.length} sports\n`);
    
    if (sportsData.length > 0) {
      console.log('Sports found:');
      sportsData.forEach((sport, index) => {
        console.log(`${index + 1}. ${sport.name}`);
        console.log(`   URL: ${sport.url}`);
        console.log(`   Icon: ${sport.icon || 'N/A'}`);
        console.log('');
      });
      
      // Save to file
      const output = {
        totalSports: sportsData.length,
        sports: sportsData
      };
      
      fs.writeFileSync('live-sports.json', JSON.stringify(output, null, 2));
      console.log('✓ Saved to inplay-sports.json');
    } else {
      console.log('⚠ No sports found');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    console.log('\nBrowser will stay open for 15 seconds...');
    await delay(15000);
    await browser.close();
  }
}

parseInPlaySports();