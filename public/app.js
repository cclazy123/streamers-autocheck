/* eslint-env browser */
// ==========================================
// Application State
// ==========================================

let sessionToken = localStorage.getItem('sessionToken');
let userRole = localStorage.getItem('userRole'); // 'admin' or 'guest'
let isAuthenticated = !!sessionToken;
let currentUsername = null; // Store current filter state

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

async function login(password, isGuest = false) {
  const payload = isGuest ? { isGuest: true } : { password };
  return api('/login', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

function logout() {
  sessionToken = null;
  userRole = null;
  currentUsername = null; // Clear filter
  localStorage.removeItem('sessionToken');
  localStorage.removeItem('userRole');
  isAuthenticated = false;
  showAuthUI();
}

function showAuthUI() {
  document.getElementById('loginForm').style.display = 'block';
  document.getElementById('app').style.display = 'none';
}

function showAppUI() {
  const loginForm = document.getElementById('loginForm');
  const app = document.getElementById('app');
  
  if (loginForm) loginForm.style.display = 'none';
  if (app) app.style.display = 'block';
  
  // UI adjustments based on role
  const userStatus = document.getElementById('userStatus');
  const addBtn = document.getElementById('addBtn');
  const bulkDelBtn = document.getElementById('bulkDeleteBtn');
  const adminPanelBtn = document.getElementById('adminPanelBtn');
  // Account input fields
  const usernameInput = document.getElementById('username');
  const countrySelect = document.getElementById('country');

  if (userStatus) {
    if (userRole === 'guest') {
      userStatus.textContent = 'Guest View (Read Only)';
      userStatus.style.color = '#666';
    } else {
      userStatus.textContent = 'Admin Mode';
      userStatus.style.color = '#667eea';
    }
  }

  // Hide/Show Admin features
  const isAdmin = userRole === 'admin';
  
  if (addBtn) addBtn.style.display = isAdmin ? 'inline-block' : 'none';
  if (bulkDelBtn && !isAdmin) bulkDelBtn.style.display = 'none'; // Only hide for guest, admin shows on selection
  if (usernameInput) usernameInput.style.display = isAdmin ? 'inline-block' : 'none';
  if (countrySelect) countrySelect.parentElement.querySelector('#country') ? (document.getElementById('country').style.display = isAdmin ? 'inline-block' : 'none') : null;

  if (adminPanelBtn) {
    if (!isAdmin) {
      adminPanelBtn.style.display = 'block';
      adminPanelBtn.textContent = 'Login as Admin';
      adminPanelBtn.onclick = logout;
    } else {
      adminPanelBtn.style.display = 'none';
    }
  }
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
    <div class="account" data-username="${a.username}" onclick="viewScreenshots('${a.username}')" style="cursor: pointer; position: relative;">
      <div style="flex: 1;">
        <strong>${a.username}</strong>
        ${a.country ? `<span style="margin-left: 10px; background: #667eea; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px;">${a.country}</span>` : ''}
        <div style="font-size: 12px; color: #999;">Added ${formatDate(a.created_at)}</div>
      </div>
      <div style="display: flex; gap: 8px;">
        <button onclick="event.stopPropagation(); viewScreenshots('${a.username}')" class="secondary" style="padding: 6px 12px; font-size: 14px;">View</button>
        ${userRole === 'admin' ? `<button onclick="event.stopPropagation(); deleteAccount(${a.id})" class="danger" style="padding: 6px 12px; font-size: 14px;">Delete</button>` : ''}
      </div>
    </div>
  `).join('');
}

async function addAccount() {
  const input = document.getElementById('username');
  const countrySelect = document.getElementById('country');
  
  if (!input || !countrySelect) return;

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
  // Prevent guests from deleting
  if (userRole !== 'admin') {
    alert('Guest users cannot delete accounts.');
    return;
  }

  if (!confirm('Are you sure you want to delete this account and all its screenshots?')) {
    return;
  }

  // Ensure ID is passed correctly
  const result = await api(`/accounts/${id}`, { method: 'DELETE' });

  if (!result || result.error) {
    showStatus('error', 'Failed to delete account: ' + (result?.error || 'Unknown error'));
    return;
  }

  showStatus('success', 'Account deleted successfully');
  // Refresh UI
  await loadAccounts();
  // Clear screenshots view if the deleted account was selected
  const screensDiv = document.getElementById('screens');
  if (screensDiv) screensDiv.innerHTML = '';
}

// ==========================================
// Batch Operations
// ==========================================

let selectedScreenshots = new Set();

function toggleSelection(id) {
  if (selectedScreenshots.has(id)) {
    selectedScreenshots.delete(id);
  } else {
    selectedScreenshots.add(id);
  }
  updateBatchUI();
}

function updateBatchUI() {
  const btn = document.getElementById('bulkDeleteBtn');
  if (!btn) return;
  
  // Guest cannot bulk delete
  if (userRole !== 'admin') {
    btn.style.display = 'none';
    return;
  }
  
  if (selectedScreenshots.size > 0) {
    btn.style.display = 'block';
    btn.textContent = `Delete Selected (${selectedScreenshots.size})`;
  } else {
    btn.style.display = 'none';
  }

  // Update card styles
  document.querySelectorAll('.screenshot-card').forEach(card => {
    const id = parseInt(card.dataset.id);
    const checkbox = card.querySelector('.checkbox');
    if (selectedScreenshots.has(id)) {
      card.classList.add('selected');
      if (checkbox) checkbox.checked = true;
    } else {
      card.classList.remove('selected');
      if (checkbox) checkbox.checked = false;
    }
  });
}

async function deleteSelected() {
  if (selectedScreenshots.size === 0) return;
  
  if (!confirm(`Are you sure you want to delete ${selectedScreenshots.size} screenshots? This cannot be undone.`)) {
    return;
  }

  const result = await api('/screenshots/batch-delete', {
    method: 'POST',
    body: JSON.stringify({ ids: Array.from(selectedScreenshots) })
  });

  if (!result || result.error) {
    showStatus('error', 'Failed to delete screenshots: ' + (result?.error || 'Unknown error'));
    return;
  }

  showStatus('success', `Deleted ${result.deletedCount} screenshots`);
  selectedScreenshots.clear();
  updateBatchUI();
  loadScreens();
}

// ==========================================
// Screenshots
// ==========================================

async function viewScreenshots(username) {
  // Update global state
  currentUsername = username;
  
  // Highlight active account in the list
  document.querySelectorAll('.account').forEach(el => {
    if (el.dataset.username === username) {
      el.classList.add('active');
      el.style.borderLeft = '4px solid #667eea';
      el.style.backgroundColor = '#eef2ff';
    } else {
      el.classList.remove('active');
      el.style.borderLeft = 'none';
      el.style.backgroundColor = '#f8f9fa';
    }
  });

  await loadScreens();
}

async function loadScreens(params = '') {
  // Construct query parameters
  const p = new URLSearchParams(params);
  
  // 1. Add Username filter (if selected)
  if (currentUsername) {
    p.set('username', currentUsername);
  }

  // 2. Add Date filters (if set in UI)
  const startEl = document.getElementById('startDate');
  const endEl = document.getElementById('endDate');
  
  if (startEl && startEl.value) p.set('startDate', startEl.value);
  if (endEl && endEl.value) p.set('endDate', endEl.value);

  const query = p.toString() ? `?${p.toString()}` : '';
  
  // Show loading state
  const root = document.getElementById('screens');
  if (root) root.innerHTML = '<div class="loading"><div class="spinner"></div>Loading...</div>';

  const items = await api(`/screenshots${query}`);
  
  if (!items) return;

  if (!items || items.length === 0) {
    root.innerHTML = `<div class="empty-state">No screenshots available ${currentUsername ? 'for @' + currentUsername : ''} in this range</div>`;
    return;
  }

    root.innerHTML = '<div class="screenshots-grid">' + 
    items.map(s => `
      <div class="screenshot-card" data-id="${s.id}" onclick="if(!event.target.closest('button') && !event.target.closest('img')) toggleSelection(${s.id})">
        <div style="position: absolute; top: 10px; left: 10px; z-index: 10;">
          <input type="checkbox" class="checkbox" ${selectedScreenshots.has(s.id) ? 'checked' : ''} onclick="event.stopPropagation(); toggleSelection(${s.id})" style="transform: scale(1.5); cursor: pointer;">
        </div>
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
            ${userRole === 'admin' ? `<button class="danger" onclick="deleteScreenshot(${s.id})" style="flex: 1;">Delete</button>` : ''}
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
  // Prevent guests from deleting
  if (userRole !== 'admin') {
    alert('Guest users cannot delete screenshots.');
    return;
  }

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

// Export functions for HTML onclick attributes
window.viewScreenshots = viewScreenshots;
window.deleteAccount = deleteAccount;
window.rateScreenshot = rateScreenshot;
window.deleteScreenshot = deleteScreenshot;
window.previewImage = previewImage;
window.toggleSelection = toggleSelection;

// ==========================================
// Event Listeners
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    // Login
  const loginBtn = document.getElementById('loginBtn');
  if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
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
      userRole = result.role; // 'admin' or 'guest'
      localStorage.setItem('sessionToken', sessionToken);
      localStorage.setItem('userRole', userRole);
      isAuthenticated = true;
      document.getElementById('password').value = '';
      showAppUI();
      loadAccounts();
      loadScreens();
    });
  }

    // Guest Login
  const guestBtn = document.getElementById('guestLoginBtn');
  if (guestBtn) {
    guestBtn.addEventListener('click', async () => {
      console.log('Guest login clicked');
      const result = await login(null, true); // isGuest = true
      console.log('Guest login result:', result);
      
      if (result && result.success) {
        sessionToken = result.session_token;
        userRole = result.role;
        localStorage.setItem('sessionToken', sessionToken);
        localStorage.setItem('userRole', userRole);
        isAuthenticated = true;
        showAppUI();
        loadAccounts();
        loadScreens();
      } else {
        showStatus('error', 'Guest login failed: ' + (result?.error || 'Unknown error'), 'loginStatus');
      }
    });
  }

    // Logout
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      api('/logout', { method: 'POST' }).finally(() => {
        logout();
      });
    });
  }

    // Add account
  const addBtn = document.getElementById('addBtn');
  const userInp = document.getElementById('username');
  
  if (addBtn) {
    addBtn.addEventListener('click', addAccount);
  }
  
  if (userInp) {
    userInp.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') addAccount();
    });
  }

  // Country filter
  const countryFilter = document.getElementById('countryFilter');
  if (countryFilter) {
    countryFilter.addEventListener('change', () => {
      loadAccounts();
    });
  }

    // Batch Delete
  const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
  if (bulkDeleteBtn) {
    bulkDeleteBtn.addEventListener('click', deleteSelected);
  }

    // Date filters
  const applyBtn = document.getElementById('applyFilterBtn');
  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      loadScreens();
    });
  }

    const clearBtn = document.getElementById('clearFilterBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      const startEl = document.getElementById('startDate');
      const endEl = document.getElementById('endDate');
      if (startEl) startEl.value = '';
      if (endEl) endEl.value = '';
      
      // Reset username selection too if desired, or keep it
      // currentUsername = null; 
      // document.querySelectorAll('.account').forEach(el => {
      //   el.classList.remove('active');
      //   el.style.backgroundColor = '#f8f9fa';
      // });

      loadScreens();
    });
  }

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
