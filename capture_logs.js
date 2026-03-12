const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  try {
    await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 10000));

    // Close launch cover by text
    await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
        const launchBtn = buttons.find(b => b.innerText.includes('開始今日數據決策'));
        if (launchBtn) launchBtn.click();
    });
    await new Promise(r => setTimeout(r, 2000));

    // Switch to appointments
    await page.evaluate(() => {
        if (window.switchPage) window.switchPage('appointments');
    });
    await new Promise(r => setTimeout(r, 3000));

    // Screenshot the chart card
    const chartCard = await page.$('#appointments .card');
    if (chartCard) {
        await chartCard.screenshot({ path: 'chart_final.png' });
        console.log("Screenshot saved to chart_final.png");
    } else {
        console.log("Chart card not found");
    }

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await browser.close();
  }
})();
