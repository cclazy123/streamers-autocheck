// ==========================================
// Application State
// ==========================================

let sessionToken = localStorage.getItem('sessionToken');
let isAuthenticated = !!sessionToken;

// ==========================================
// API Helper
// ==========================================

async function api(path, opts = {}) {
  const defaultOpts = {
    headers: { 'Content-Type': 'application/json' }
  };

  // Add session token if authenticated
  if (sessionToken) {
    defaultOpts.headers['X-Session-Token'] = sessionToken;
  }

  const finalOpts = Object.assign(defaultOpts, opts);
  
  try {
    const res = await fetch(path, finalOpts);
    
    // Handle 401 - clear session
    if (res.status === 401) {
      logout();
      return null;
    }

    return await res.json();
  } catch (err) {
    console.error('API Error:', err);
    showStatus('error', 'Network error: ' + err.message, 'loginStatus');
    return null;
  }
}

// ==========================================
// Authentication
// ==========================================

function login(password) {
  return api('/login', {
    method: 'POST',
    body: JSON.stringify({ password })
  });
}

function logout() {
  sessionToken = null;
  localStorage.removeItem('sessionToken');
  isAuthenticated = false;
  showAuthUI();
}

function showAuthUI() {
  document.getElementById('loginForm').style.display = 'block';
  document.getElementById('app').style.display = 'none';
}

function showAppUI() {
  document.getElementById('loginForm').style.display = 'none';
  document.getElementById('app').style.display = 'block';
}

// ==========================================
// UI Helpers
// ==========================================

function showStatus(type, message, elementId = 'accountStatus') {
  const elem = document.getElementById(elementId);
  elem.textContent = message;
  elem.className = `status-message ${type} active`;
  setTimeout(() => {
    elem.classList.remove('active');
  }, 3000);
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleString();
}

function formatRating(ratingSum, ratingCount) {
  if (!ratingCount) return 'N/A';
  const avg = (ratingSum / ratingCount).toFixed(2);
  return `${avg} (${ratingCount})`;
}

// ==========================================
// Account Management
// ==========================================

async function loadAccounts() {
  const countryFilter = document.getElementById('countryFilter').value;
  const query = countryFilter ? `?country=${countryFilter}` : '';
  const accounts = await api(`/accounts${query}`);
  if (!accounts) return;

  const root = document.getElementById('accounts');
  
  if (!accounts || accounts.length === 0) {
    root.innerHTML = '<div class="empty-state">No accounts added yet</div>';
    return;
  }

  root.innerHTML = accounts.map(a => `
    <div class="account">
      <div>
        <strong>${a.username}</strong>
        ${a.country ? `<span style="margin-left: 10px; background: #667eea; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px;">${a.country}</span>` : ''}
        <div style="font-size: 12px; color: #999;">Added ${formatDate(a.created_at)}</div>
      </div>
      <div style="display: flex; gap: 8px;">
        <button onclick="viewScreenshots('${a.username}')" class="secondary" style="padding: 6px 12px; font-size: 14px;">View</button>
        <button onclick="deleteAccount(${a.id})" class="danger" style="padding: 6px 12px; font-size: 14px;">Delete</button>
      </div>
    </div>
  `).join('');
}

async function addAccount() {
  const input = document.getElementById('username');
  const countrySelect = document.getElementById('country');
  const username = input.value.trim();
  const country = countrySelect.value.trim();
  
  if (!username) {
    showStatus('error', 'Please enter a username');
    return;
  }

  if (!country) {
    showStatus('error', 'Please select a country');
    return;
  }

  const result = await api('/accounts', {
    method: 'POST',
    body: JSON.stringify({ username, country })
  });

  if (!result) {
    showStatus('error', 'Failed to add account');
    return;
  }

  if (result.error) {
    showStatus('error', 'Error: ' + result.error);
    return;
  }

  input.value = '';
  countrySelect.value = '';
  showStatus('success', 'Account added successfully');
  loadAccounts();
}

async function deleteAccount(id) {
  if (!confirm('Are you sure you want to delete this account and all its screenshots?')) {
    return;
  }

  const result = await api(`/accounts/${id}`, { method: 'DELETE' });

  if (!result || result.error) {
    showStatus('error', 'Failed to delete account');
    return;
  }

  showStatus('success', 'Account deleted successfully');
  loadAccounts();
  loadScreens();
}

// ==========================================
// Screenshots
// ==========================================

async function viewScreenshots(username) {
  const params = new URLSearchParams({ username });
  await loadScreens(params.toString());
}

async function loadScreens(params = '') {
  const query = params ? `?${params}` : '';
  const items = await api(`/screenshots${query}`);
  
  if (!items) return;

  const root = document.getElementById('screens');

  if (!items || items.length === 0) {
    root.innerHTML = '<div class="empty-state">No screenshots available</div>';
    return;
  }

  root.innerHTML = '<div class="screenshots-grid">' + 
    items.map(s => `
      <div class="screenshot-card">
        <img class="screenshot-image" src="${s.public_url}" onclick="previewImage('${s.public_url}')" alt="${s.username}" />
        <div class="screenshot-info">
          <div class="screenshot-username">@${s.username}</div>
          <div class="screenshot-time">${formatDate(s.captured_at)}</div>
          
          <div class="screenshot-rating">
            <div class="rating-score">${formatRating(s.rating_sum, s.rating_count)}</div>
            <div class="rating-count">Ratings</div>
          </div>

          <div class="rating-buttons">
            ${[1, 2, 3, 4, 5].map(i => 
              `<button onclick="rateScreenshot(${s.id}, ${i})">${i}★</button>`
            ).join('')}
          </div>

          <div class="screenshot-actions">
            <button class="secondary" onclick="previewImage('${s.public_url}')" style="flex: 1;">Preview</button>
            <button class="danger" onclick="deleteScreenshot(${s.id})" style="flex: 1;">Delete</button>
          </div>
        </div>
      </div>
    `).join('') + '</div>';
}

async function rateScreenshot(id, rating) {
  const result = await api(`/screenshots/${id}/rate`, {
    method: 'POST',
    body: JSON.stringify({ rating })
  });

  if (!result || result.error) {
    showStatus('error', 'Failed to save rating');
    return;
  }

  showStatus('success', `Rated: ${rating}★`);
  loadScreens();
}

async function deleteScreenshot(id) {
  if (!confirm('Delete this screenshot?')) {
    return;
  }

  const result = await api(`/screenshots/${id}`, { method: 'DELETE' });

  if (!result || result.error) {
    showStatus('error', 'Failed to delete screenshot');
    return;
  }

  showStatus('success', 'Screenshot deleted');
  loadScreens();
}

function previewImage(url) {
  const modal = document.getElementById('imageModal');
  const img = document.getElementById('modalImage');
  img.src = url;
  modal.classList.add('active');
}

// ==========================================
// Event Listeners
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  // Login
  document.getElementById('loginBtn').addEventListener('click', async () => {
    const password = document.getElementById('password').value;
    if (!password) {
      showStatus('error', 'Please enter password', 'loginStatus');
      return;
    }

    const result = await login(password);
    if (!result) {
      showStatus('error', 'Login failed', 'loginStatus');
      return;
    }

    if (result.error) {
      showStatus('error', 'Invalid password', 'loginStatus');
      return;
    }

    sessionToken = result.session_token;
    localStorage.setItem('sessionToken', sessionToken);
    isAuthenticated = true;
    document.getElementById('password').value = '';
    showAppUI();
    loadAccounts();
    loadScreens();
  });

  // Logout
  document.getElementById('logoutBtn').addEventListener('click', () => {
    api('/logout', { method: 'POST' }).finally(() => {
      logout();
    });
  });

  // Add account
  document.getElementById('addBtn').addEventListener('click', addAccount);
  document.getElementById('username').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addAccount();
  });

  // Country filter
  document.getElementById('countryFilter').addEventListener('change', () => {
    loadAccounts();
  });

  // Modal close
  document.getElementById('modalClose').addEventListener('click', () => {
    document.getElementById('imageModal').classList.remove('active');
  });

  document.getElementById('imageModal').addEventListener('click', (e) => {
    if (e.target.id === 'imageModal') {
      document.getElementById('imageModal').classList.remove('active');
    }
  });

  // Initialize UI
  if (isAuthenticated) {
    showAppUI();
    loadAccounts();
    loadScreens();
  } else {
    showAuthUI();
  }
});
