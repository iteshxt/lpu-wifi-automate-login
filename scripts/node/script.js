const puppeteer = require('puppeteer');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

const username = process.env.REGNO;
const password = process.env.PASSWORD;
const url = 'https://internet.lpu.in/24online/webpages/client.jsp';

async function login() {
  const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: chromePath
  });

  const page = await browser.newPage();

  await page.goto(url);

  try {
    await page.click('#agreepolicy');
  } catch (error) {
    console.log("\n------------------\nAlready logged In!\n------------------\n");
    await browser.close();
    return;
  }

  await page.waitForSelector('#loginbtn', { visible: true });

  await page.type('input[name="username"]', username);
  await page.type('input[name="password"]', password);

  await page.click('#loginbtn');

  console.log("\n------------------\nLogin Successful!\n------------------\n");

  // Wait for 2 seconds before closing
  await new Promise(resolve => setTimeout(resolve, 2000));
  await browser.close();
}

login().catch(error => {
  console.error('An error occurred:', error);
});
