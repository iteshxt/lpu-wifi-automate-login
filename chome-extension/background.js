const LOGIN_URL = 'https://internet.lpu.in/24online/webpages/client.jsp';
let CHECK_INTERVAL = 5 * 60 * 1000; 

let loginInProgress = false;
let intervalId = null;

// Obfuscator
const Obfuscator = {
  decode: (str) => {
    try {
      return decodeURIComponent(atob(str));
    } catch {
      return str; // Fallback for plain text stored previously
    }
  }
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'manualLogin') {
        performLogin(true).then(status => {
            sendResponse({ status });
        });
        return true; // Keep message channel open for async response
    } else if (message.action === 'checkStatus') {
        checkConnectionStatus().then(status => sendResponse({ status }));
        return true;
    } else if (message.action === 'updateInterval') {
        const minutes = message.minutes;
        CHECK_INTERVAL = minutes * 60 * 1000;
        
        if (intervalId) {
            clearInterval(intervalId);
        }
        intervalId = setInterval(performLogin, CHECK_INTERVAL);
        
        chrome.storage.local.set({ checkInterval: minutes });
        console.log(`Check interval updated to ${minutes} minutes`);
        sendResponse({ status: 'updated' });
    }
});

async function performLogin(isManual = false) {
    if (loginInProgress) {
        return 'in_progress';
    }
    
    loginInProgress = true;
    
    try {
        const data = await chrome.storage.local.get('credentials');
        if (!data.credentials) {
            loginInProgress = false;
            return 'no_credentials';
        }

        const regno = Obfuscator.decode(data.credentials.regno);
        const password = Obfuscator.decode(data.credentials.password);

        try {
            const response = await fetch(LOGIN_URL, { cache: "no-store", method: 'GET' });
            const html = await response.text();

            if (html.includes('logout.jsp')) {
                console.log('Already logged in');
                loginInProgress = false;
                return 'already_logged_in';
            }
        } catch(e) {
            // Fetch failed, maybe offline or captive portal redirects
        }

        return new Promise((resolve) => {
            chrome.tabs.create({ url: LOGIN_URL, active: false }, async (tab) => {
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        function: loginToWifi,
                        args: [regno, password]
                    });

                    setTimeout(() => {
                        chrome.tabs.get(tab.id, function(tabInfo) {
                            if (!chrome.runtime.lastError) {
                                chrome.tabs.remove(tab.id);
                            }
                            loginInProgress = false;
                            resolve('login_triggered');
                        });
                    }, 2500);
                } catch (error) {
                    console.error('Script execution error:', error);
                    loginInProgress = false;
                    resolve('error');
                }
            });
        });
    } catch (error) {
        console.error('Login error:', error);
        loginInProgress = false;
        return 'error';
    }
}

async function checkConnectionStatus() {
    try {
        const response = await fetch(LOGIN_URL, { cache: "no-store", method: 'GET' });
        const html = await response.text();
        if (html.includes('logout.jsp')) {
            return 'connected';
        }
        return 'disconnected';
    } catch(e) {
        return 'error';
    }
}

function loginToWifi(regno, password) {
    document.querySelector('#agreepolicy')?.click();
    const uname = document.querySelector('input[name="username"]');
    const pwd = document.querySelector('input[name="password"]');
    if (uname) uname.value = regno;
    if (pwd) pwd.value = password;
    document.querySelector('#loginbtn')?.click();
}

async function initializeInterval() {
    try {
        const data = await chrome.storage.local.get('checkInterval');
        if (data.checkInterval) {
            CHECK_INTERVAL = data.checkInterval * 60 * 1000;
        } else {
            chrome.storage.local.set({ checkInterval: 5 });
        }
        
        if (intervalId) clearInterval(intervalId);
        intervalId = setInterval(performLogin, CHECK_INTERVAL);
    } catch (error) {
        intervalId = setInterval(performLogin, CHECK_INTERVAL);
    }
}

// Check when extension is first loaded
performLogin();
initializeInterval();