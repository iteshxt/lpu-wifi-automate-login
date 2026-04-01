import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';


// Adjust these variable names to exactly what you have inside your .env file
const regno = "regno@lpu.com";
const password = "password";

if (!regno || !password) {
    console.error("❌ ERROR: Credentials missing! Please ensure you have a .env file with your credentials properly formatted (e.g. USERNAME=... PASSWORD=...)");
    process.exit(1);
}

const LOGIN_URL = 'https://internet.lpu.in/24online/webpages/client.jsp';
const AUTH_URL = 'https://internet.lpu.in/24online/servlet/E24onlineHTTPClient';

async function testHeadless() {
    console.log(`[1] Fetching fresh captive portal page from ${LOGIN_URL}...`);
    try {
        const getRes = await fetch(LOGIN_URL, { cache: "no-store", method: 'GET' });
        const html = await getRes.text();

        console.log(`[2] HTTP ${getRes.status} received. Parsing HTML for hidden CSRF/mac tokens...`);

        if (html.includes('value="Logout"') || html.includes('name="logout"')) {
            console.log("-> ⚠️ SERVER SAYS YOU ARE ALREADY LOGGED IN! (HTML currently contains the Logout button)");
            console.log("-> ⚠️ Typically if this happens inside the extension, we stop right here. For testing, we will proceed to see if the server forcefully drops us if we hit login anyway.");
        }

        const params = new URLSearchParams();
        const inputTagRegex = /<input\s+([^>]+)>/gi;
        let match;
        let tokensExtracted = 0;

        while ((match = inputTagRegex.exec(html)) !== null) {
            const attrs = match[1];
            const nameMatch = attrs.match(/name=["']([^"']+)["']/i);
            const valueMatch = attrs.match(/value=["']([^"']*)["']/i);
            if (nameMatch && valueMatch) {
                params.set(nameMatch[1], valueMatch[1]);
                tokensExtracted++;
            }
        }

        console.log(`[3] Extracted ${tokensExtracted} hidden inputs dynamically.`);

        // Emulate the precise mutation background.js applies
        params.set('mode', '191'); // 191 is login mode
        params.delete('logout');   // Failsafe to strip accidental logout payloads
        params.set('username', regno);
        params.set('password', password);

        // Explicitly force Javascript-computed tokens that the captive portal expects
        params.set('loginotp', 'false');
        params.set('logincaptcha', 'false');
        params.set('registeruserotp', 'false');
        params.set('registercaptcha', 'false');

        console.log(`[4] Final POST payload prepared. Sending the following fields:`, Array.from(params.keys()));
        console.log(`[5] Firing Raw Headless POST Auth Request to ${AUTH_URL}...`);

        const postRes = await fetch(AUTH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
        });

        const postBody = await postRes.text();

        console.log(`\n========================================`);
        console.log(`[6] SERVER RESPONSE: HTTP ${postRes.status}`);
        console.log(`========================================\n`);

        console.log(postBody.substring(0, 1500)); // Print up to the first 1500 chars to the terminal

        console.log(`\n========================================\n`);
        if (postBody.includes('value="Logout"') || postBody.includes('Successfully Logged in')) {
            console.log("✅ The headless POST was SUCCESSFUL! Server explicitly accepted it.");
        } else if (postBody.includes('Invalid') || postBody.includes('Failure') || postBody.includes('Expired')) {
            console.log("❌ The headless POST was REJECTED by the server. We captured a validation rejection.");
        } else {
            console.log("❓ Unknown server response. The raw HTML response is printed above. Please inspect it manually.");
        }

    } catch (e) {
        console.error("FATAL ERROR EXECUTING TEST:", e);
    }
}

testHeadless();
