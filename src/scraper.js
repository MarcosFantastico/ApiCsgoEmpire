const puppeteer = require("puppeteer");

/**
 * Acessa uma URL e retorna o HTML renderizado
 * @param {string} url
 * @returns {Promise<string|null>} HTML da página ou null em caso de erro
 */
async function getHtmlFromUrl(url) {
  const browser = await puppeteer.launch({
    headless: false, // Para debug visual. Mude para 'new' ou true em produção.
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', // Garante o Chrome real
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled" // Diminui chance de bloqueio
    ]
  });

  const page = await browser.newPage();

  // Define user-agent e viewport
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
  );
  await page.setViewport({ width: 1280, height: 800 });

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    // Aguarda pelo seletor principal da página (ajuste se precisar de algum específico)
    await page.waitForSelector("body", { timeout: 10000 });

    const html = await page.content();
    return html;
  } catch (error) {
    console.error(`❌ Erro ao carregar URL: ${url}`, error.message);
    return null;
  } finally {
    await browser.close();
  }
}

module.exports = { getHtmlFromUrl };
