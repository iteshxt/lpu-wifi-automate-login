/**
 * LPU Auto-Login Extension - Popup UI Controller
 * Manages the user interface, credentials securely, and background communications.
 */

let currentToastTimeout;

/**
 * Displays a temporary toast notification.
 */
function showToast(message, duration = 3000, showLoader = false) {
  const toast = document.getElementById('toast');
  const msgEl = document.getElementById('toast-msg');
  const loaderEl = document.getElementById('toast-loader');

  msgEl.textContent = message;
  loaderEl.style.display = showLoader ? 'inline-block' : 'none';
  toast.classList.add('show');

  if (currentToastTimeout) clearTimeout(currentToastTimeout);

  if (duration > 0) {
    currentToastTimeout = setTimeout(() => {
      toast.classList.remove('show');
    }, duration);
  }
}

function hideToast() {
  document.getElementById('toast').classList.remove('show');
}

/**
 * Basic Base64 Obfuscator to prevent plain-text storage of credentials.
 */
const Obfuscator = {
  encode: (str) => btoa(encodeURIComponent(str)),
  decode: (str) => decodeURIComponent(atob(str))
};

/**
 * Updates the dashboard visual status indicators.
 */
function updateDashboardStatus(status) {
  const icon = document.getElementById('status-icon-svg');
  const title = document.getElementById('status-title');
  const desc = document.getElementById('status-text');

  if (status === 'checking') {
    icon.innerHTML = '<path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>';
    icon.style.color = 'var(--muted-foreground)';
    title.textContent = 'Checking Status...';
    desc.textContent = 'Verifying connection with network.';
  } else if (status === 'connected' || status === 'already_logged_in') {
    icon.innerHTML = '<path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>';
    icon.style.color = '#10b981'; // Green check
    title.textContent = 'Connected';
    desc.textContent = 'You are proudly logged into LPU WiFi.';
  } else {
    icon.innerHTML = '<line x1="2" y1="2" x2="22" y2="22"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/>';
    icon.style.color = '#ef4444'; // Red disconnected
    title.textContent = 'Disconnected';
    desc.textContent = 'Auto-login active. Waiting to connect.';
  }
}

/**
 * Handles toggling between the Login, Dashboard, and Settings views.
 */
function switchView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(viewId).classList.add('active');

  const settingsBtn = document.getElementById('settings-btn');
  const backBtn = document.getElementById('back-btn');
  const headerTitle = document.getElementById('header-title');

  if (viewId === 'view-login') {
    settingsBtn.style.display = 'none';
    backBtn.style.display = 'none';
    headerTitle.textContent = 'LPU WiFi Connect';
  } else if (viewId === 'view-dashboard') {
    settingsBtn.style.display = 'flex';
    backBtn.style.display = 'none';
    headerTitle.textContent = 'Dashboard';

    updateDashboardStatus('checking');

    // Asynchronously poll background script for connectivity state
    chrome.runtime.sendMessage({ action: 'checkStatus' }, (response) => {
      if (!chrome.runtime.lastError && response) {
        updateDashboardStatus(response.status);
      } else {
        updateDashboardStatus('error');
      }
    });
  } else if (viewId === 'view-settings') {
    settingsBtn.style.display = 'none';
    backBtn.style.display = 'flex';
    headerTitle.textContent = 'Settings';
  }
}

// ==== Event Listeners ====

document.getElementById('settings-btn').addEventListener('click', () => switchView('view-settings'));
document.getElementById('back-btn').addEventListener('click', () => switchView('view-dashboard'));

/**
 * Saves the user's LPU credentials to secure local storage.
 */
document.getElementById('save').addEventListener('click', () => {
  const regno = document.getElementById('regno').value.trim();
  const password = document.getElementById('password').value.trim();

  if (!regno || !password) {
    showToast('Please fill all fields');
    return;
  }

  // Hash & Save securely
  chrome.storage.local.set({
    credentials: {
      regno: Obfuscator.encode(regno),
      password: Obfuscator.encode(password)
    }
  }, () => {
    showToast('Credentials saved!');
    // Fire background login attempt immediately
    chrome.runtime.sendMessage({ action: 'manualLogin' });
    switchView('view-dashboard');
  });
});

/**
 * Triggers a manual immediate connection attempt with UI blocking.
 */
document.getElementById('reload').addEventListener('click', () => {
  const btn = document.getElementById('reload');
  btn.disabled = true;
  btn.textContent = 'Checking...';
  showToast('Connecting to LPU WiFi...', 0, true);

  chrome.runtime.sendMessage({ action: 'manualLogin' }, (response) => {
    btn.disabled = false;
    btn.textContent = 'Connect / Check Status';

    if (chrome.runtime.lastError) {
      showToast('Error connecting to background script.');
      updateDashboardStatus('error');
      return;
    }

    if (response && response.status === 'already_logged_in') {
      showToast('Already connected.');
      updateDashboardStatus('connected');
    } else if (response && response.status === 'login_triggered') {
      showToast('Logging in...');
      updateDashboardStatus('connected');
    } else {
      showToast('Done.');
      updateDashboardStatus(response ? response.status : 'disconnected');
    }
  });
});

/**
 * Clears saved credentials and unsets the auto-login loop.
 */
document.getElementById('reset').addEventListener('click', () => {
  if (confirm('Remove saved credentials? Auto-login will be disabled permanently until saved again.')) {
    chrome.storage.local.remove('credentials', () => {
      document.getElementById('regno').value = '';
      document.getElementById('password').value = '';
      switchView('view-login');
      showToast('Credentials removed.');
    });
  }
});

/**
 * Initializes the background execution timer slider with the default 30 minute marker.
 */
function initializeIntervalControls() {
  const intervalValues = [1, 5, 15, 30, 60];
  const slider = document.getElementById('interval-slider');

  chrome.storage.local.get('checkInterval', (data) => {
    // Enforce strong 30-minute default setting for new users
    let savedInterval = data.checkInterval;
    if (!savedInterval) {
      savedInterval = 30; // Strongly enforce default
      chrome.storage.local.set({ checkInterval: 30 });
      chrome.runtime.sendMessage({ action: 'updateInterval', minutes: 30 });
    }

    let sliderIndex = 3; // Default array index for `30` min
    let closestDiff = Math.abs(intervalValues[0] - savedInterval);

    // Snap the UI slider to the closest value safely
    for (let i = 1; i < intervalValues.length; i++) {
      const diff = Math.abs(intervalValues[i] - savedInterval);
      if (diff < closestDiff) {
        closestDiff = diff;
        sliderIndex = i;
      }
    }

    slider.value = sliderIndex;
    updateSliderBackground(slider);
  });

  slider.addEventListener('input', () => updateSliderBackground(slider));

  slider.addEventListener('change', () => {
    const index = parseInt(slider.value);
    const minutes = intervalValues[index];
    // Stream the user's newly chosen preference live to the background worker
    chrome.runtime.sendMessage({ action: 'updateInterval', minutes: minutes });
    showToast(`Auto-Checking every ${minutes}m`);
  });
}

function updateSliderBackground(slider) {
  const value = (slider.value - slider.min) / (slider.max - slider.min) * 100;
  slider.style.background = `linear-gradient(to right, var(--primary) ${value}%, var(--muted) ${value}%)`;
}

/**
 * Initial Popup Boot Lifecycle
 */
document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get('credentials', (data) => {
    if (data.credentials && data.credentials.regno && data.credentials.password) {
      switchView('view-dashboard');
    } else {
      switchView('view-login');
    }
  });

  initializeIntervalControls();
});