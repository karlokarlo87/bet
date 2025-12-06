const puppeteer = require('puppeteer');
const fs = require('fs');

// Helper function for delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function parseInPlayMatchesBySport() {
  // Read the sports JSON file
  const sportsData = JSON.parse(fs.readFileSync('live-sports.json', 'utf8'));
  
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
  const allSportsMatches = [];

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

    // Loop through each sport
    for (const sport of sportsData.sports) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Processing: ${sport.name}`);
      console.log(`URL: ${sport.url}`);
      console.log('='.repeat(60));
      
      try {
        await page.goto(sport.url, { 
          waitUntil: 'networkidle0',
          timeout: 60000 
        });
        
        console.log('Page loaded, waiting for content...');
        
        // Wait for match rows
        await page.waitForSelector('.eventRow', { timeout: 10000 }).catch(() => {
          console.log('No matches found for this sport');
        });
        
        await delay(3000);
        
        console.log('Parsing matches...\n');
        
        // Extract match data
        const matches = await page.evaluate(() => {
          const matchRows = document.querySelectorAll('.eventRow');
          const matches = [];
          let currentLeague = null;
          
          matchRows.forEach(row => {
            // Check for league header
            const leagueHeader = row.querySelector('[data-testid="sport-country-league-item"]');
            if (leagueHeader) {
              const sportElement = leagueHeader.querySelector('[data-testid="header-sport-item"]');
              const countryElement = leagueHeader.querySelector('[data-testid="header-country-item"]');
              const leagueElement = leagueHeader.querySelector('[data-testid="header-tournament-item"]');
              
              currentLeague = {
                sport: sportElement ? sportElement.textContent.trim() : '',
                country: countryElement ? countryElement.textContent.trim() : '',
                countryFlag: countryElement ? countryElement.querySelector('img')?.getAttribute('src') : null,
                league: leagueElement ? leagueElement.textContent.trim() : ''
              };
            }
            
            // Check for game row
            const gameRow = row.querySelector('[data-testid="game-row"]');
            if (!gameRow || !currentLeague) return;
            
            try {
              // Extract match time
              const timeElement = gameRow.querySelector('[data-testid="time-item"] p');
              const matchTime = timeElement ? timeElement.textContent.trim() : '';
              
              // Determine match status
              let matchStatus = 'LIVE';
              if (matchTime === 'HT') {
                matchStatus = 'HALF TIME';
              } else if (matchTime === 'FT') {
                matchStatus = 'FINISHED';
              } else if (matchTime.includes('Q')) {
                matchStatus = 'LIVE';
              } else if (matchTime.includes("'")) {
                matchStatus = 'LIVE';
              }
              
              // Extract teams and scores
              const participants = gameRow.querySelector('[data-testid="event-participants"]');
              if (!participants) return;
              
              const teamElements = participants.querySelectorAll('a[title]');
              if (teamElements.length < 2) return;
              
              const homeTeamElement = teamElements[0];
              const awayTeamElement = teamElements[1];
              
              const homeTeam = homeTeamElement.getAttribute('title');
              const awayTeam = awayTeamElement.getAttribute('title');
              
              const homeTeamLogo = homeTeamElement.querySelector('img')?.getAttribute('src') || null;
              const awayTeamLogo = awayTeamElement.querySelector('img')?.getAttribute('src') || null;
              
              // Extract scores (looking for font-bold text-red-dark elements)
              const scoreElements = participants.querySelectorAll('.text-red-dark.font-bold');
              let homeScore = null;
              let awayScore = null;
              
              if (scoreElements.length >= 2) {
                // Scores are typically in the order: home, away (in the hidden section for larger screens)
                const hiddenScores = Array.from(scoreElements).filter(el => 
                  el.classList.contains('min-mt:!flex') && el.classList.contains('hidden')
                );
                
                if (hiddenScores.length >= 2) {
                  homeScore = hiddenScores[0].textContent.trim();
                  awayScore = hiddenScores[2] ? hiddenScores[2].textContent.trim() : hiddenScores[1].textContent.trim();
                } else {
                  // Fallback to visible scores
                  const visibleScores = Array.from(scoreElements).filter(el => 
                    el.classList.contains('min-mt:!hidden')
                  );
                  if (visibleScores.length >= 2) {
                    homeScore = visibleScores[0].textContent.trim();
                    awayScore = visibleScores[1].textContent.trim();
                  }
                }
              }
              
              // Extract odds - DYNAMICALLY detect 2-way or 3-way odds
              const parentRow = gameRow.closest('.eventRow');
              const oddContainers = parentRow.querySelectorAll('[data-testid="odd-container-default"] .font-bold');
              
              let odds = {};
              
              // Check how many odds columns are present
              if (oddContainers.length >= 3) {
                // 3-way odds (1-X-2): home, draw, away
                const homeOdds = oddContainers[0].textContent.trim();
                const drawOdds = oddContainers[1].textContent.trim();
                const awayOdds = oddContainers[2].textContent.trim();
                
                odds = {
                  home: homeOdds !== '-' ? homeOdds : null,
                  draw: drawOdds !== '-' ? drawOdds : null,
                  away: awayOdds !== '-' ? awayOdds : null
                };
              } else if (oddContainers.length >= 2) {
                // 2-way odds (1-2): home, away
                const homeOdds = oddContainers[0].textContent.trim();
                const awayOdds = oddContainers[1].textContent.trim();
                
                odds = {
                  home: homeOdds !== '-' ? homeOdds : null,
                  away: awayOdds !== '-' ? awayOdds : null
                };
              }
              
              // Extract bookmakers count
              const bookiesElement = parentRow.querySelector('[data-testid="bookies-amount-item"] .text-black-main');
              const bookmakers = bookiesElement ? bookiesElement.textContent.trim() : null;
              
              // Extract match URL
              const matchLink = gameRow.closest('a');
              const matchUrl = matchLink ? 'https://www.oddsportal.com' + matchLink.getAttribute('href') : null;
              
              matches.push({
                ...currentLeague,
                matchTime,
                matchStatus,
                homeTeam,
                homeTeamLogo,
                homeScore,
                awayTeam,
                awayTeamLogo,
                awayScore,
                odds,
                bookmakers,
                url: matchUrl
              });
              
            } catch (error) {
              console.log('Error parsing match:', error.message);
            }
          });
          
          return matches;
        });
        
        console.log(`✓ Found ${matches.length} live matches for ${sport.name}\n`);
        
        if (matches.length > 0) {
          // Display first 3 matches as sample
          console.log('Sample matches:');
          matches.slice(0, 3).forEach((match, index) => {
            console.log(`${index + 1}. ${match.homeTeam} vs ${match.awayTeam}`);
            console.log(`   Score: ${match.homeScore || '?'} - ${match.awayScore || '?'}`);
            console.log(`   Time: ${match.matchTime} (${match.matchStatus})`);
            console.log(`   League: ${match.country} - ${match.league}`);
            
            // Display odds based on whether it's 2-way or 3-way
            if (match.odds.draw !== undefined) {
              console.log(`   Odds: ${match.odds.home || 'N/A'} / ${match.odds.draw || 'N/A'} / ${match.odds.away || 'N/A'} (3-way)`);
            } else {
              console.log(`   Odds: ${match.odds.home || 'N/A'} / ${match.odds.away || 'N/A'} (2-way)`);
            }
            console.log('');
          });
          
          allSportsMatches.push({
            sport: sport.name,
            sportIcon: sport.icon,
            totalMatches: matches.length,
            matches: matches
          });
        }
        
        // Delay between requests to avoid rate limiting
        await delay(2000);
        
      } catch (error) {
        console.error(`Error processing ${sport.name}:`, error.message);
      }
    }
    
    // Save all results
    if (allSportsMatches.length > 0) {
      const output = {
        timestamp: new Date().toISOString(),
        totalSports: allSportsMatches.length,
        totalMatches: allSportsMatches.reduce((sum, sport) => sum + sport.totalMatches, 0),
        sports: allSportsMatches
      };
      
      fs.writeFileSync('inplay.json', JSON.stringify(output, null, 2));
      console.log('\n' + '='.repeat(60));
      console.log('✓ Saved all matches to inplay-all-sports-matches.json');
      console.log(`Total: ${output.totalSports} sports with ${output.totalMatches} live matches`);
      console.log('='.repeat(60));
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    console.log('\nBrowser will stay open for 10 seconds...');
    await delay(10000);
    await browser.close();
  }
}

parseInPlayMatchesBySport();