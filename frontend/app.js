// ============================================================
// app.js — Core-Trust Banking Portal Frontend Logic
// ============================================================
// Handles all UI rendering, API calls, and state management
// for the single-page banking application.
//
// API calls go to:  http://localhost:5000/api (local Flask backend)
// ============================================================

// ---------------------------------------------------------------------------
// API Configuration
// ---------------------------------------------------------------------------
const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? "http://localhost:5000/api"
    : "/api";

// ---------------------------------------------------------------------------
// Application State
// ---------------------------------------------------------------------------
let currentUser = null;       // The logged-in user's record from DB
let userType    = null;       // 'admin' or 'customer'
let loginMode   = 'customer'; // Active login toggle

// ---------------------------------------------------------------------------
// DOM References
// ---------------------------------------------------------------------------
const loginScreen    = document.getElementById('login-screen');
const mainDashboard  = document.getElementById('main-dashboard');
const navMenu        = document.getElementById('nav-menu');
const dynamicContent = document.getElementById('dynamic-content');
const welcomeMsg     = document.getElementById('user-greeting');
const bottomNav      = document.getElementById('bottom-nav');

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
});

function initEventListeners() {
    // Mode toggle (Customer / Admin)
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            loginMode = e.target.dataset.mode;
        });
    });

    // Login button
    document.getElementById('login-btn').addEventListener('click', handleLogin);

    // Allow Enter key to trigger login
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && loginScreen.classList.contains('active')) {
            handleLogin();
        }
    });
}

// ---------------------------------------------------------------------------
// API Helpers
// ---------------------------------------------------------------------------

/** POST JSON data to an endpoint and return the parsed JSON response. */
async function apiPost(endpoint, data) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return res.json();
}

/** GET data from an endpoint with optional query params. */
async function apiGet(endpoint, params = {}) {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`${API_BASE}${endpoint}?${query}`);
    return res.json();
}

// ---------------------------------------------------------------------------
// Toast Notifications
// ---------------------------------------------------------------------------

/**
 * Display a slide-in toast notification.
 * @param {string} type    - 'success' | 'error'
 * @param {string} title   - Bold title line
 * @param {string} message - Subtitle/detail line
 */
function showToast(type, title, message) {
    const container = document.getElementById('notification-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';
    toast.innerHTML = `
        <i class="fas ${icon}"></i>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-msg">${message}</div>
        </div>
    `;

    container.appendChild(toast);

    // Auto-remove after 4 seconds
    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

async function handleLogin() {
    const uid = document.getElementById('login-uid').value.trim();
    const pwd = document.getElementById('login-pwd').value;

    if (!uid || !pwd) {
        showToast('error', 'Auth Error', 'Please enter ID and Password');
        return;
    }

    // Disable button during request to prevent double-clicks
    const btn = document.getElementById('login-btn');
    btn.disabled = true;
    btn.textContent = 'SIGNING IN...';

    try {
        const result = await apiPost('/login', { id: uid, password: pwd, mode: loginMode });

        if (!result.success) {
            showToast('error', 'Login Failed', result.message || 'Invalid credentials');
            return;
        }

        currentUser = result.user;
        userType    = loginMode;
        showDashboard();
        showToast('success', 'Welcome!', `Logged in as ${currentUser.name}`);
    } catch (err) {
        console.error(err);
        showToast('error', 'Network Error', 'Cannot reach server. Is it running?');
    } finally {
        btn.disabled = false;
        btn.textContent = 'SIGN IN';
    }
}

// ---------------------------------------------------------------------------
// Dashboard Layout
// ---------------------------------------------------------------------------

function showDashboard() {
    loginScreen.classList.remove('active');
    mainDashboard.classList.add('active');
    welcomeMsg.textContent = `Welcome back, ${currentUser.name.split(' ')[0]}`;
    document.getElementById('sub-greeting').textContent =
        userType === 'admin'
            ? 'System Administration Panel'
            : "Here's your account overview.";

    renderSidebar();
    renderBottomNav();

    if (userType === 'admin') {
        showAdminOverview();
    } else {
        showCustomerDashboard();
    }
}

// ---------------------------------------------------------------------------
// Sidebar Navigation
// ---------------------------------------------------------------------------

function renderSidebar() {
    navMenu.innerHTML = '';

    const adminItems = [
        { icon: 'fa-chart-pie',       text: 'Overview',    cmd: showAdminOverview },
        { icon: 'fa-user-plus',       text: 'New Profile', cmd: showAdminNewProfile },
        { icon: 'fa-search',          text: 'Search',      cmd: showAdminSearch },
        { icon: 'fa-receipt',         text: 'Financials',  cmd: showAdminTrans },
        { icon: 'fa-sign-out-alt',    text: 'Logout',      cmd: logout }
    ];

    const customerItems = [
        { icon: 'fa-home',            text: 'Dashboard',   cmd: showCustomerDashboard },
        { icon: 'fa-piggy-bank',      text: 'Deposit',     cmd: showCustomerDeposit },
        { icon: 'fa-money-bill-wave', text: 'Withdraw',    cmd: showCustomerWithdraw },
        { icon: 'fa-exchange-alt',    text: 'Transfer',    cmd: showCustomerTransfer },
        { icon: 'fa-user-circle',     text: 'Profile',     cmd: showCustomerProfile },
        { icon: 'fa-history',         text: 'History',     cmd: showCustomerHistory },
        { icon: 'fa-sign-out-alt',    text: 'Logout',      cmd: logout }
    ];

    const items = userType === 'admin' ? adminItems : customerItems;

    items.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'nav-item' + (index === 0 ? ' active' : '');
        div.innerHTML = `<i class="fas ${item.icon}"></i><span>${item.text}</span>`;
        div.onclick = () => {
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            div.classList.add('active');
            item.cmd();
        };
        navMenu.appendChild(div);
    });

    // User badge at sidebar bottom
    const sidebar = document.getElementById('sidebar');
    let footer = sidebar.querySelector('.sidebar-footer');
    if (!footer) {
        footer = document.createElement('div');
        footer.className = 'sidebar-footer';
        sidebar.appendChild(footer);
    }
    const initials = currentUser.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    footer.innerHTML = `
        <div class="user-badge">
            <div class="user-badge-avatar">${initials}</div>
            <div class="user-badge-info">
                <div class="user-badge-name">${currentUser.name}</div>
                <div class="user-badge-role">${userType === 'admin' ? 'System Admin' : 'Customer'}</div>
            </div>
        </div>
    `;
}

function renderBottomNav() {
    bottomNav.innerHTML = '';
    const adminItems = [
        { icon: 'fa-chart-pie',    text: 'Overview',  cmd: showAdminOverview },
        { icon: 'fa-user-plus',    text: 'Add',       cmd: showAdminNewProfile },
        { icon: 'fa-search',       text: 'Search',    cmd: showAdminSearch },
        { icon: 'fa-receipt',      text: 'Audit',     cmd: showAdminTrans },
        { icon: 'fa-sign-out-alt', text: 'Logout',    cmd: logout }
    ];
    const customerItems = [
        { icon: 'fa-home',            text: 'Home',     cmd: showCustomerDashboard },
        { icon: 'fa-piggy-bank',      text: 'Deposit',  cmd: showCustomerDeposit },
        { icon: 'fa-money-bill-wave', text: 'Withdraw', cmd: showCustomerWithdraw },
        { icon: 'fa-exchange-alt',    text: 'Transfer', cmd: showCustomerTransfer },
        { icon: 'fa-history',         text: 'History',  cmd: showCustomerHistory },
        { icon: 'fa-sign-out-alt',    text: 'Logout',   cmd: logout }
    ];
    const items = userType === 'admin' ? adminItems : customerItems;
    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'mobile-nav-item';
        div.innerHTML = `<i class="fas ${item.icon}"></i><span>${item.text}</span>`;
        div.onclick = item.cmd;
        bottomNav.appendChild(div);
    });
}

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

async function logout() {
    const confirmed = await showModal({
        title: 'Sign Out',
        message: 'Are you sure you want to end your secure session?',
        icon: 'fa-sign-out-alt',
        confirmText: 'SIGN OUT',
        cancelText: 'STAY'
    });
    if (confirmed) location.reload();
}

// ---------------------------------------------------------------------------
// Reusable UI Components
// ---------------------------------------------------------------------------

function createStatCard(title, value, icon, sub = '') {
    return `
        <div class="stat-card glass">
            <div class="stat-card-icon">
                <i class="fas ${icon}"></i>
            </div>
            <h3>${title}</h3>
            <p>${value}</p>
            ${sub ? `<div class="stat-sub">${sub}</div>` : ''}
        </div>
    `;
}

function parseAmount(amountStr) {
    if (!amountStr) return 0;
    let str = String(amountStr).trim().toUpperCase();
    let multiplier = 1;
    if (str.endsWith('K')) {
        multiplier = 1000;
        str = str.slice(0, -1);
    } else if (str.endsWith('M')) {
        multiplier = 1000000;
        str = str.slice(0, -1);
    } else if (str.endsWith('B')) {
        multiplier = 1000000000;
        str = str.slice(0, -1);
    }
    const val = parseFloat(str) * multiplier;
    return isNaN(val) ? 0 : val;
}

function formatAbbreviation(amountStr) {
    if (!amountStr && amountStr !== 0) return '';
    let str = String(amountStr).trim().toUpperCase();
    if (str.endsWith('K') || str.endsWith('M') || str.endsWith('B')) return str;
    let val = parseFloat(str);
    if (isNaN(val)) return str;

    if (val >= 1000000000 && val % 1000000000 === 0) return (val / 1000000000) + 'B';
    if (val >= 1000000 && val % 1000000 === 0) return (val / 1000000) + 'M';
    if (val >= 1000 && val % 1000 === 0) return (val / 1000) + 'K';
    
    if (val >= 1000000000) return +(val / 1000000000).toFixed(2) + 'B';
    if (val >= 1000000) return +(val / 1000000).toFixed(2) + 'M';
    if (val >= 1000) return +(val / 1000).toFixed(2) + 'K';
    
    return str;
}

function formatCurrency(amount) {
    const val = parseAmount(amount);
    if (val === 0) return 'UGX 0';
    return `UGX ${formatAbbreviation(val)}`;
}

// ---------------------------------------------------------------------------
// ADMIN VIEWS
// ---------------------------------------------------------------------------

function showAdminOverview() {
    dynamicContent.innerHTML = `
        <div class="stats-grid">
            ${createStatCard('System Status', 'Healthy', 'fa-shield-halved', '✓ All services online')}
            ${createStatCard('Database', 'Connected', 'fa-database', 'Supabase active')}
            ${createStatCard('API Server', 'Running', 'fa-server', 'Port 5000 · Flask')}
        </div>

        <div class="content-card glass">
            <h2><i class="fas fa-bolt"></i> Recent Activity</h2>
            <div class="table-header">
                <div>Event</div><div>System</div><div>Status</div><div>Time</div>
            </div>
            <div class="table-row">
                <div>Supabase Sync</div>
                <div>Core DB</div>
                <div class="tx-badge credit">Active</div>
                <div style="color:var(--text-muted)">Just now</div>
            </div>
            <div class="table-row">
                <div>API Health</div>
                <div>Flask</div>
                <div class="tx-badge credit">OK</div>
                <div style="color:var(--text-muted)">Live</div>
            </div>
        </div>
    `;
}

// ── New Customer Profile Form ──────────────────────────────

function showAdminNewProfile() {
    dynamicContent.innerHTML = `
        <div class="content-card glass">
            <h2><i class="fas fa-user-plus"></i> Onboard New Customer</h2>
            <div class="form-grid">
                <div class="field-group">
                    <label>Account ID</label>
                    <input type="text" id="new-id" placeholder="e.g. 1001">
                </div>
                <div class="field-group">
                    <label>Full Name</label>
                    <input type="text" id="new-name" placeholder="Jane Doe">
                </div>
                <div class="field-group">
                    <label>Address</label>
                    <input type="text" id="new-addr" placeholder="123 Main Street">
                </div>
                <div class="field-group">
                    <label>Phone</label>
                    <input type="text" id="new-phone" placeholder="0712 345 678">
                </div>
                <div class="field-group">
                    <label>Initial Password</label>
                    <input type="password" id="new-pwd" placeholder="Set a secure password">
                </div>
                <div class="field-group">
                    <label>Opening Balance (UGX)</label>
                    <input type="number" id="new-bal" placeholder="0.00" min="0">
                </div>
            </div>
            <div class="action-row">
                <button onclick="handleCreateCustomer()" class="btn btn-primary">
                    <i class="fas fa-check" style="margin-right:8px"></i>AUTHORIZE &amp; CREATE
                </button>
                <button onclick="showAdminOverview()" class="btn btn-ghost">Cancel</button>
            </div>
        </div>
    `;
}

async function handleCreateCustomer() {
    const data = {
        id:       document.getElementById('new-id').value.trim(),
        name:     document.getElementById('new-name').value.trim(),
        address:  document.getElementById('new-addr').value.trim(),
        phone:    document.getElementById('new-phone').value.trim(),
        password: document.getElementById('new-pwd').value,
        balance:  document.getElementById('new-bal').value
    };

    const result = await apiPost('/admin/create-customer', data);
    if (!result.success) {
        showToast('error', 'Creation Failed', result.message);
    } else {
        showToast('success', 'Account Created', `Customer ${data.name} has been onboarded.`);
        showAdminNewProfile(); // Reset form
    }
}

// ── Customer Search & Profile Card ───────────────────────

function showAdminSearch() {
    dynamicContent.innerHTML = `
        <div class="content-card glass">
            <h2><i class="fas fa-search"></i> Customer Intelligence</h2>
            <div class="search-bar">
                <input type="text" id="search-id" placeholder="Enter Customer Account ID to search...">
                <button onclick="handleSearch()">
                    <i class="fas fa-search" style="margin-right:8px"></i>SEARCH
                </button>
            </div>
            <div id="search-results"></div>
        </div>
    `;
    // Allow Enter key in search
    document.getElementById('search-id').addEventListener('keydown', e => {
        if (e.key === 'Enter') handleSearch();
    });
}

async function handleSearch() {
    const id = document.getElementById('search-id').value.trim();
    if (!id) { showToast('error', 'Empty Search', 'Please enter a Customer ID'); return; }

    const results = document.getElementById('search-results');
    results.innerHTML = '<div class="empty-state"><i class="fas fa-circle-notch fa-spin"></i><p>Searching records...</p></div>';

    const result = await apiGet('/admin/search', { id });
    if (result.success) {
        const d = result.customer;
        const balance = parseFloat(d.balance || 0);
        const initials = d.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
        showToast('success', 'Record Found', `Profile retrieved for ${d.name}`);
        results.innerHTML = `
            <div class="customer-result-card glass-layered">
                <div class="customer-result-header">
                    <div class="customer-avatar">${initials}</div>
                    <div class="customer-result-info">
                        <div class="customer-result-name">${d.name}</div>
                        <div class="customer-result-id">Account ID: ${d.id}</div>
                    </div>
                </div>
                <div class="customer-result-body glass-panel">
                    <div class="info-chip">
                        <div class="info-chip-label"><i class="fas fa-wallet"></i> Balance</div>
                        <div class="info-chip-value balance">${formatCurrency(balance)}</div>
                    </div>
                    <div class="info-chip">
                        <div class="info-chip-label"><i class="fas fa-map-marker-alt"></i> Address</div>
                        <div class="info-chip-value">${d.address || 'N/A'}</div>
                    </div>
                    <div class="info-chip">
                        <div class="info-chip-label"><i class="fas fa-phone"></i> Phone</div>
                        <div class="info-chip-value">${d.phone || 'N/A'}</div>
                    </div>
                </div>
            </div>
        `;
    } else {
        showToast('error', 'Not Found', result.message || 'No record found');
        results.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-user-slash"></i>
                <p>No customer found with ID <strong>${id}</strong>.</p>
            </div>
        `;
    }
}

// ── Financial Audit ────────────────────────────────────────

function showAdminTrans() {
    dynamicContent.innerHTML = `
        <div class="content-card glass">
            <h2><i class="fas fa-receipt"></i> Financial Auditing</h2>
            <div class="search-bar">
                <input type="text" id="audit-id" placeholder="Enter Customer ID to audit...">
                <button onclick="handleAudit()">
                    <i class="fas fa-search" style="margin-right:8px"></i>AUDIT
                </button>
            </div>
            <div id="audit-results"></div>
        </div>
    `;
    document.getElementById('audit-id').addEventListener('keydown', e => {
        if (e.key === 'Enter') handleAudit();
    });
}

async function handleAudit() {
    const id = document.getElementById('audit-id').value.trim();
    if (!id) { showToast('error', 'Empty ID', 'Please enter a Customer ID'); return; }

    const results = document.getElementById('audit-results');
    results.innerHTML = '<div class="empty-state"><i class="fas fa-circle-notch fa-spin"></i><p>Auditing account...</p></div>';

    const result = await apiGet('/admin/audit', { id });
    if (result.success) {
        showToast('success', 'Audit Complete', `${result.history.length} transactions retrieved`);
        const rows = result.history.length
            ? result.history.map(t => {
                const isCredit = t.type.toLowerCase().includes('deposit') || t.type.toLowerCase().includes('from');
                return `
                    <div class="table-row">
                        <div>
                            <span class="tx-badge ${isCredit ? 'credit' : 'debit'}">
                                <i class="fas ${isCredit ? 'fa-arrow-down' : 'fa-arrow-up'}"></i>
                                ${t.type}
                            </span>
                        </div>
                        <div class="tx-amount ${isCredit ? 'positive' : 'negative'}">
                            ${isCredit ? '+' : '-'}${formatCurrency(Math.abs(t.amount))}
                        </div>
                        <div style="color:var(--text-muted);font-size:0.82rem">${t.id.slice(0,8)}…</div>
                        <div style="color:var(--text-muted);font-size:0.85rem">${t.created_at.slice(0,10)}</div>
                    </div>
                `;
            }).join('')
            : '<div class="empty-state"><i class="fas fa-inbox"></i><p>No transactions found.</p></div>';

        results.innerHTML = `
            <div style="margin-top:1.5rem">
                <div class="balance-hero" style="padding:2rem; margin-bottom:1.5rem;">
                    <div class="balance-hero-label">Current Balance</div>
                    <div class="balance-hero-amount"><span>UGX </span>${formatAbbreviation(result.balance || 0)}</div>
                </div>
                <h2 style="margin-bottom:1rem"><i class="fas fa-history"></i> Transaction Log</h2>
                <div class="table-header">
                    <div>Type</div><div>Amount</div><div>Reference</div><div>Date</div>
                </div>
                ${rows}
            </div>
        `;
    } else {
        showToast('error', 'Audit Failed', result.message || 'Record not found');
        results.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-file-slash"></i>
                <p>${result.message || 'Audit error. Please try again.'}</p>
            </div>
        `;
    }
}

// ---------------------------------------------------------------------------
// CUSTOMER VIEWS
// ---------------------------------------------------------------------------

async function showCustomerDashboard() {
    const result = await apiGet('/customer/balance', { id: currentUser.id });
    currentUser.balance = result.balance;

    const formattedBalance = formatCurrency(currentUser.balance);

    dynamicContent.innerHTML = `
        <div class="balance-hero">
            <div class="balance-hero-label">Available Balance</div>
            <div class="balance-hero-amount">
                <span>UGX </span>${formatAbbreviation(currentUser.balance || 0)}
            </div>
            <div class="balance-hero-sub">Account ID: ${currentUser.id} &nbsp;·&nbsp; Core-Trust Banking</div>
            <div class="quick-actions">
                <button class="quick-action-btn" onclick="showCustomerDeposit()">
                    <i class="fas fa-piggy-bank"></i><span>Deposit</span>
                </button>
                <button class="quick-action-btn" onclick="showCustomerWithdraw()">
                    <i class="fas fa-money-bill-wave"></i><span>Withdraw</span>
                </button>
                <button class="quick-action-btn" onclick="showCustomerTransfer()">
                    <i class="fas fa-exchange-alt"></i><span>Transfer</span>
                </button>
                <button class="quick-action-btn" onclick="showCustomerHistory()">
                    <i class="fas fa-history"></i><span>History</span>
                </button>
            </div>
        </div>

        <div class="content-card glass">
            <h2><i class="fas fa-user-circle"></i> Account Details</h2>
            <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:14px">
                <div class="info-chip">
                    <div class="info-chip-label">Name</div>
                    <div class="info-chip-value">${currentUser.name}</div>
                </div>
                <div class="info-chip">
                    <div class="info-chip-label">Account ID</div>
                    <div class="info-chip-value">${currentUser.id}</div>
                </div>
                <div class="info-chip">
                    <div class="info-chip-label">Balance</div>
                    <div class="info-chip-value balance">${formattedBalance}</div>
                </div>
            </div>
        </div>
    `;
}

// ── Deposit ────────────────────────────────────────────────

function showCustomerDeposit() {
    dynamicContent.innerHTML = `
        <div class="content-card glass" style="max-width:520px; margin:0 auto">
            <h2><i class="fas fa-piggy-bank"></i> Deposit Funds</h2>
            <p style="color:var(--text-secondary); margin-bottom:1rem">Enter the amount you'd like to add to your account.</p>
            <div class="amount-input-wrap">
                <span class="amount-currency">UGX </span>
                <input type="number" id="dep-amt" class="amount-input" placeholder="0.00" min="0">
            </div>
            <button onclick="handleDeposit()" class="btn btn-primary" style="width:100%; padding:16px; font-size:1rem">
                <i class="fas fa-check" style="margin-right:8px"></i>CONFIRM DEPOSIT
            </button>
        </div>
    `;
}

async function handleDeposit() {
    const amt = document.getElementById('dep-amt').value;
    const result = await apiPost('/customer/deposit', { id: currentUser.id, amount: amt });
    if (result.success) {
        showToast('success', 'Deposit Successful', result.message);
        showCustomerDashboard();
    } else {
        showToast('error', 'Deposit Failed', result.message);
    }
}

// ── Withdraw ───────────────────────────────────────────────

function showCustomerWithdraw() {
    dynamicContent.innerHTML = `
        <div class="content-card glass" style="max-width:520px; margin:0 auto">
            <h2><i class="fas fa-money-bill-wave"></i> Withdraw Funds</h2>
            <p style="color:var(--text-secondary); margin-bottom:1rem">Current balance: <strong>${formatCurrency(currentUser.balance)}</strong></p>
            <div class="amount-input-wrap">
                <span class="amount-currency">UGX </span>
                <input type="number" id="with-amt" class="amount-input" placeholder="0.00" min="0">
            </div>
            <button onclick="handleWithdraw()" class="btn btn-primary" style="width:100%; padding:16px; font-size:1rem">
                <i class="fas fa-check" style="margin-right:8px"></i>CONFIRM WITHDRAWAL
            </button>
        </div>
    `;
}

async function handleWithdraw() {
    const amt = document.getElementById('with-amt').value;
    if (!amt || isNaN(amt) || parseFloat(amt) <= 0) {
        showToast('error', 'Invalid Amount', 'Please enter a positive number');
        return;
    }

    const confirmed = await showModal({
        title: 'Confirm Withdrawal',
        message: `Withdraw <strong>${formatCurrency(amt)}</strong> from your account?`,
        icon: 'fa-money-bill-wave',
        confirmText: 'WITHDRAW',
        cancelText: 'CANCEL'
    });
    if (!confirmed) return;

    const result = await apiPost('/customer/withdraw', { id: currentUser.id, amount: amt });
    if (result.success) {
        showToast('success', 'Withdrawal Complete', result.message);
        showCustomerDashboard();
    } else {
        showToast('error', 'Withdrawal Failed', result.message);
    }
}

// ── Transfer ───────────────────────────────────────────────

function showCustomerTransfer() {
    dynamicContent.innerHTML = `
        <div class="content-card glass" style="max-width:520px; margin:0 auto">
            <h2><i class="fas fa-exchange-alt"></i> Fund Transfer</h2>
            <p style="color:var(--text-secondary); margin-bottom:1.5rem">Send money to another Core-Trust account instantly.</p>
            <div class="field-group">
                <label>Recipient Account ID</label>
                <input type="text" id="trans-to" placeholder="Enter recipient's account ID">
            </div>
            <div class="field-group">
                <label>Amount</label>
                <div class="amount-input-wrap" style="margin:0">
                    <span class="amount-currency">UGX </span>
                    <input type="number" id="trans-amt" class="amount-input" placeholder="0.00" min="0">
                </div>
            </div>
            <div class="action-row" style="margin-top:1.5rem">
                <button onclick="handleTransfer()" class="btn btn-primary" style="flex:1; padding:16px">
                    <i class="fas fa-paper-plane" style="margin-right:8px"></i>SEND FUNDS
                </button>
                <button onclick="showCustomerDashboard()" class="btn btn-ghost">Cancel</button>
            </div>
        </div>
    `;
}

async function handleTransfer() {
    const toId = document.getElementById('trans-to').value.trim();
    const amt  = document.getElementById('trans-amt').value;

    if (!toId || !amt) {
        showToast('error', 'Incomplete', 'Please fill all fields');
        return;
    }

    const confirmed = await showModal({
        title: 'Confirm Transfer',
        message: `Transfer <strong>${formatCurrency(amt)}</strong> to account <strong>${toId}</strong>?`,
        icon: 'fa-exchange-alt',
        confirmText: 'EXECUTE',
        cancelText: 'REVIEW'
    });
    if (!confirmed) return;

    const result = await apiPost('/customer/transfer', { from_id: currentUser.id, to_id: toId, amount: amt });
    if (result.success) {
        showToast('success', 'Transfer Complete', result.message);
        showCustomerDashboard();
    } else {
        showToast('error', 'Transfer Failed', result.message);
    }
}

// ── Transaction History ────────────────────────────────────

async function showCustomerHistory() {
    dynamicContent.innerHTML = '<div class="empty-state"><i class="fas fa-circle-notch fa-spin"></i><p>Loading history...</p></div>';

    const result = await apiGet('/customer/history', { id: currentUser.id });
    const history = result.history || [];

    const rows = history.length
        ? history.map(t => {
            const isCredit = t.type.toLowerCase().includes('deposit') || t.type.toLowerCase().includes('from');
            return `
                <div class="table-row">
                    <div>
                        <span class="tx-badge ${isCredit ? 'credit' : 'debit'}">
                            <i class="fas ${isCredit ? 'fa-arrow-down' : 'fa-arrow-up'}"></i>
                            ${t.type}
                        </span>
                    </div>
                    <div class="tx-amount ${isCredit ? 'positive' : 'negative'}">
                        ${isCredit ? '+' : '-'}${formatCurrency(Math.abs(t.amount))}
                    </div>
                    <div style="color:var(--text-muted);font-size:0.82rem">${t.id.slice(0,8)}…</div>
                    <div style="color:var(--text-muted);font-size:0.85rem">${t.created_at.slice(0,10)}</div>
                </div>
            `;
        }).join('')
        : '<div class="empty-state"><i class="fas fa-inbox"></i><p>No transactions found.</p></div>';

    dynamicContent.innerHTML = `
        <div class="content-card glass">
            <h2><i class="fas fa-history"></i> Transaction History</h2>
            ${history.length ? `
            <div class="table-header">
                <div>Type</div><div>Amount</div><div>Reference</div><div>Date</div>
            </div>` : ''}
            ${rows}
        </div>
    `;
}

// ── My Profile ─────────────────────────────────────────────

function showCustomerProfile() {
    dynamicContent.innerHTML = `
        <div class="content-card glass" style="max-width:580px; margin:0 auto">
            <h2><i class="fas fa-user-circle"></i> My Profile</h2>
            <div class="form-grid">
                <div class="field-group">
                    <label>Full Name</label>
                    <input type="text" id="prof-name" value="${currentUser.name || ''}">
                </div>
                <div class="field-group">
                    <label>Account ID</label>
                    <input type="text" value="${currentUser.id}" disabled style="opacity:0.5;cursor:not-allowed">
                </div>
                <div class="field-group">
                    <label>Address</label>
                    <input type="text" id="prof-addr" value="${currentUser.address || ''}">
                </div>
                <div class="field-group">
                    <label>Phone</label>
                    <input type="text" id="prof-phone" value="${currentUser.phone || ''}">
                </div>
            </div>
            <div class="field-group">
                <label>New Password <span style="color:var(--text-muted); text-transform:none; font-weight:400">(leave blank to keep current)</span></label>
                <input type="password" id="prof-pwd" placeholder="Enter new password...">
            </div>
            <div class="action-row">
                <button onclick="handleProfileUpdate()" class="btn btn-primary">
                    <i class="fas fa-save" style="margin-right:8px"></i>SAVE CHANGES
                </button>
                <button onclick="showCustomerDashboard()" class="btn btn-ghost">Cancel</button>
            </div>
        </div>
    `;
}

async function handleProfileUpdate() {
    const data = {
        id:       currentUser.id,
        name:     document.getElementById('prof-name').value,
        address:  document.getElementById('prof-addr').value,
        phone:    document.getElementById('prof-phone').value,
        password: document.getElementById('prof-pwd').value
    };

    const result = await apiPost('/customer/profile', data);
    if (result.success) {
        showToast('success', 'Profile Updated', result.message);
        currentUser.name    = data.name;
        currentUser.address = data.address;
        currentUser.phone   = data.phone;
        document.getElementById('user-greeting').textContent = `Welcome back, ${currentUser.name.split(' ')[0]}`;
        showCustomerDashboard();
    } else {
        showToast('error', 'Update Failed', result.message);
    }
}

// ---------------------------------------------------------------------------
// Modal Utility
// ---------------------------------------------------------------------------

/**
 * Display a centred confirmation modal.
 * Returns a Promise<boolean> — true if confirmed, false if cancelled.
 */
function showModal({ title, message, icon = 'fa-question-circle', confirmText = 'CONFIRM', cancelText = 'CANCEL' }) {
    return new Promise((resolve) => {
        const container = document.getElementById('modal-container');
        const overlay   = document.createElement('div');
        overlay.className = 'modal-overlay';

        overlay.innerHTML = `
            <div class="modal-card">
                <div class="modal-header">
                    <i class="fas ${icon}"></i>
                    <div class="modal-title">${title}</div>
                </div>
                <div class="modal-body">${message}</div>
                <div class="modal-actions">
                    <button class="modal-btn modal-btn-cancel">${cancelText}</button>
                    <button class="modal-btn modal-btn-confirm">${confirmText}</button>
                </div>
            </div>
        `;

        container.appendChild(overlay);
        setTimeout(() => overlay.classList.add('active'), 10);

        const close = (result) => {
            overlay.classList.remove('active');
            setTimeout(() => { container.removeChild(overlay); resolve(result); }, 300);
        };

        overlay.querySelector('.modal-btn-confirm').onclick = () => close(true);
        overlay.querySelector('.modal-btn-cancel').onclick  = () => close(false);
        overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });
    });
}
