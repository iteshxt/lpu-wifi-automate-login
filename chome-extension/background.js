/**
 * LPU Auto-Login Extension - Background Service Worker
 * Orchestrates silent background auth, connectivity checks, and interval management.
 */

const LOGIN_URL = 'https://internet.lpu.in/24online/webpages/client.jsp';
const AUTH_URL = 'https://internet.lpu.in/24online/servlet/E24onlineHTTPClient';
let CHECK_INTERVAL = 1; // Default fallback, overwritten by initializeInterval()

let loginInProgress = false;

/**
 * Simple utility to decode stored credentials.
 */
const Obfuscator = {
    decode: (str) => {
        try {
            return decodeURIComponent(atob(str));
        } catch {
            return str; // Fallback for plain text
        }
    }
};

/**
 * Listen for messages from the popup UI.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'manualLogin') {
        performLogin(true).then(status => sendResponse({ status }));
        return true; 
    } else if (message.action === 'checkStatus') {
        checkConnectionStatus().then(status => sendResponse({ status }));
        return true;
    } else if (message.action === 'updateInterval') {
        const minutes = parseInt(message.minutes);
        CHECK_INTERVAL = minutes;
        
        chrome.storage.local.set({ checkInterval: minutes });
        chrome.alarms.create('checkConnection', { periodInMinutes: minutes });
        
        sendResponse({ status: 'updated' });
    }
});

/**
 * Trigger background checks based on the configured alarm interval.
 */
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'checkConnection') {
        performLogin();
    }
});

/**
 * Core Authentication Routine
 * Evaluates connectivity and forces a captive portal login sequence if required.
 * Note: LOGIN_URL is mandatory to scrape the dynamic anti-CSRF tokens LPU generates.
 */
async function performLogin(isManual = false) {
    if (loginInProgress) return 'in_progress';
    loginInProgress = true;

    if (isManual) {
        chrome.alarms.get('checkConnection', (alarm) => {
            if (!alarm) initializeInterval();
        });
    }

    try {
        // 1. Retrieve & Decode Credentials
        const data = await chrome.storage.local.get('credentials');
        if (!data.credentials || !data.credentials.regno || !data.credentials.password) {
            loginInProgress = false;
            return 'no_credentials';
        }

        const regno = Obfuscator.decode(data.credentials.regno);
        const password = Obfuscator.decode(data.credentials.password);

        // 2. Pre-flight Connectivity Check (bypasses portal entirely if already online)
        try {
            const response = await fetch('http://clients3.google.com/generate_204', {
                cache: "no-store",
                method: 'GET',
                signal: AbortSignal.timeout(1000)
            });
            if (response.status === 204) {
                loginInProgress = false;
                return 'already_logged_in';
            }
        } catch (e) {
             // 204 failed, we are trapped behind the captive portal
        }

        console.log("Sending Request...");

        // 3. Fetch Portal HTML (Crucial step to extract dynamically generated variables)
        const getRes = await fetch(LOGIN_URL, { cache: "no-store", method: 'GET' });
        const html = await getRes.text();

        // Failsafe check
        if (html.includes('value="Logout"') || html.includes('name="logout"')) {
            console.log("Already Connected");
            loginInProgress = false;
            return 'already_logged_in';
        }

        // 4. Scrape all required hidden inputs injected by the network appliance
        const params = new URLSearchParams();
        const inputTagRegex = /<input\s+([^>]+)>/gi;
        let match;

        while ((match = inputTagRegex.exec(html)) !== null) {
            const attrs = match[1];
            const nameMatch = attrs.match(/name=["']([^"']+)["']/i);
            const valueMatch = attrs.match(/value=["']([^"']*)["']/i);
            if (nameMatch && valueMatch) {
                params.set(nameMatch[1], valueMatch[1]);
            }
        }

        // 5. Append Credentials & Bypasses
        const formattedRegno = regno.includes('@lpu.com') ? regno : `${regno}@lpu.com`;
        
        params.set('mode', '191');
        params.delete('logout');
        params.set('username', formattedRegno);
        params.set('password', password);
        params.set('loginotp', 'false');
        params.set('logincaptcha', 'false');
        params.set('registeruserotp', 'false');
        params.set('registercaptcha', 'false');

        // 6. Submit Authentication Payload
        const postRes = await fetch(AUTH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
        });

        const postBody = await postRes.text();

        // 7. Validate Response
        let finalStatus = 'error';
        if (postBody.includes('value="Logout"') || postBody.includes('Successfully Logged in')) {
            console.log("Connected");
            finalStatus = 'login_triggered';
        } else if (postBody.includes('Invalid') || postBody.includes('Failure') || postBody.includes('Expired')) {
            console.log("Login Failed");
            finalStatus = 'login_failed';
        } else {
            console.log("Status Unknown");
            finalStatus = 'login_unknown';
        }

        loginInProgress = false;
        return finalStatus;

    } catch (error) {
        console.error('Login Error:', error);
        loginInProgress = false;
        return 'error';
    }
}

/**
 * Quick ping to determine actual internet connectivity strictly for the UI popup.
 */
async function checkConnectionStatus() {
    try {
        const response = await fetch('http://clients3.google.com/generate_204', {
            cache: "no-store",
            method: 'GET',
            signal: AbortSignal.timeout(1000)
        });
        return response.status === 204 ? 'connected' : 'disconnected';
    } catch {
        return 'disconnected';
    }
}

/**
 * Retrieves the user's preferred polling interval and schedules the alarm.
 */
async function initializeInterval() {
    try {
        const data = await chrome.storage.local.get('checkInterval');
        CHECK_INTERVAL = data.checkInterval ? parseInt(data.checkInterval) : 1;

        if (!data.checkInterval) {
            chrome.storage.local.set({ checkInterval: CHECK_INTERVAL });
        }

        chrome.alarms.create('checkConnection', { periodInMinutes: CHECK_INTERVAL });
    } catch {
        chrome.alarms.create('checkConnection', { periodInMinutes: 1 });
    }
}

/**
 * Bootstrapping Listeners
 */
chrome.runtime.onStartup.addListener(() => {
    performLogin();
    initializeInterval();
});

chrome.runtime.onInstalled.addListener(() => {
    performLogin();
    initializeInterval();
});