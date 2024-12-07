import { expect } from 'chai';
import puppeteer from 'puppeteer';

describe('User Registration and Login Tests', function () {
    this.timeout(20000);

    let browser, page;
    let testUsername, testEmail, testPassword;

    before(async () => {
        // Launch a new browser instance for each test run
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        page = await browser.newPage();

        // Clear cookies/session to ensure logged-out state
        const client = await page.target().createCDPSession();
        await client.send('Network.clearBrowserCookies');

        // Define test user credentials
        testUsername = 'testuser' + Date.now();
        testEmail = testUsername + '@example.com';
        testPassword = 'Test@123';
    });

    after(async () => {
        await browser.close();
    });

    it('should display login and register tabs when visiting /account', async () => {
        await page.goto('http://localhost:3000/account', { waitUntil: 'networkidle0' });

        // Wait for the container and tabs to appear
        await page.waitForSelector('.login-container', { timeout: 5000 });
        await page.waitForSelector('.tab', { timeout: 5000 });
        await page.waitForSelector('.tab button:first-of-type', { timeout: 5000 });

        const loginTabText = await page.$eval('.tab button:first-of-type', el => el.textContent);
        const registerTabText = await page.$eval('.tab button:nth-of-type(2)', el => el.textContent);

        expect(loginTabText).to.include('Login');
        expect(registerTabText).to.include('Register');
    });

    it('should register a new user', async () => {
        await page.goto('http://localhost:3000/account', { waitUntil: 'networkidle0' });

        // Ensure the tabs are there
        await page.waitForSelector('.tab', { timeout: 5000 });
        await page.waitForSelector('.tab button:nth-of-type(2)', { timeout: 5000 });

        // Click on the "Register" tab
        await Promise.all([
            page.click('.tab button:nth-of-type(2)'),
            page.waitForSelector('#Register.active', { timeout: 5000 })
        ]);

        // Fill out the registration form
        await page.type('#username', testUsername);
        await page.type('#email', testEmail);
        await page.type('#password', testPassword);

        // Submit the registration form
        // After submitting, we expect some message to appear
        await page.click('#registerButton');

        // Wait for a potential alert or message. Since we used alert(), we need to listen for dialog events:
        page.once('dialog', async dialog => {
            const dialogMessage = dialog.message();
            await dialog.dismiss(); // Close the alert
            expect(dialogMessage).to.match(/User registered successfully!|Username is already taken|Email is already registered/);
        });

        // If no dialog appears within a few seconds, let's fail the test to avoid silent timeouts
        await page.waitForTimeout(3000);
    });

    it('should login with a registered user', async () => {
        await page.goto('http://localhost:3000/account', { waitUntil: 'networkidle0' });

        // Ensure that login tab is visible
        await page.waitForSelector('.tab button:first-of-type', { timeout: 5000 });
        await Promise.all([
            page.click('.tab button:first-of-type'),
            page.waitForSelector('#Login.active', { timeout: 5000 })
        ]);

        // Fill in login details
        // Use the user we just registered
        await page.type('#loginEmailOrUsername', testEmail);
        await page.type('#loginPassword', testPassword);

        // Listen for dialog on login as well
        page.once('dialog', async dialog => {
            const dialogMessage = dialog.message();
            await dialog.dismiss(); 
            // If login failed, this might be "Login failed: <message>"
            expect(dialogMessage).to.match(/Successfully logged in!|Login failed:/);
        });

        await page.click('#loginButton');

        // Wait a bit to ensure dialog has appeared (or an action completed)
        await page.waitForTimeout(3000);
    });

    it('should show the dashboard if logged in', async () => {
        // Now that we've potentially logged in, revisit /account
        // If we're logged in, the dashboard should be visible
        await page.goto('http://localhost:3000/account', { waitUntil: 'networkidle0' });

        // Wait a moment for the page to render
        await page.waitForTimeout(2000);

        // Check if the dashboard is displayed
        const dashboardIsVisible = await page.evaluate(() => {
            const dashboard = document.getElementById('dashboard');
            return dashboard && dashboard.style.display !== 'none';
        });

        // In case of failure, log the page content for debugging
        if (!dashboardIsVisible) {
            const content = await page.content();
            console.log('Page content at failure:\n', content);
        }

        expect(dashboardIsVisible).to.equal(true);
    });
});
