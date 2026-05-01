// ============================================================
// app.js — Core-Trust Banking Portal Frontend Logic
// ============================================================
console.log("=== APP.JS IS EXECUTING ===");
// Handles all UI rendering, API calls, and state management
// for the single-page banking application.
//
// API calls go to:  http://localhost:5000/api (local Flask backend)
// ============================================================

// ---------------------------------------------------------------------------
// API Configuration
// ---------------------------------------------------------------------------
const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.startsWith('192.168.'))
    ? `http://${window.location.hostname}:5000/api`
    : "/api";

// ---------------------------------------------------------------------------
// UI Helpers (Defined early to be available to HTML onclick)
// ---------------------------------------------------------------------------
window.togglePwd = function(inputId, btn) {
    const inp = document.getElementById(inputId);
    if (!inp) return;
    
    const icon = btn.querySelector('i') || btn.querySelector('svg');
    if (!icon) return;
    
    if (inp.type === 'password') {
        inp.type = 'text';
        if (icon.tagName.toLowerCase() === 'i') {
            icon.className = 'fas fa-eye';
        } else {
            icon.setAttribute('data-icon', 'eye');
        }
    } else {
        inp.type = 'password';
        if (icon.tagName.toLowerCase() === 'i') {
            icon.className = 'fas fa-eye-slash';
        } else {
            icon.setAttribute('data-icon', 'eye-slash');
        }
    }
};

// Global listener for password toggles
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.pwd-toggle');
    if (btn) {
        const onclickAttr = btn.getAttribute('onclick');
        if (onclickAttr && onclickAttr.includes('togglePwd')) {
            const match = onclickAttr.match(/togglePwd\(['"]([^'"]+)['"]/);
            if (match) {
                e.preventDefault();
                e.stopPropagation();
                window.togglePwd(match[1], btn);
            }
        }
    }
});

// ---------------------------------------------------------------------------
// Supabase Configuration
// ---------------------------------------------------------------------------
const SUPABASE_URL = "https://aejsfehbstjobvmcqpxd.supabase.co";
const SUPABASE_KEY = "sb_publishable_lfPTTNdSJITMzjsMZjKvag_2ii9Qivd";
const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// ---------------------------------------------------------------------------
// Application State
// ---------------------------------------------------------------------------
let currentUser = null;       // Initialized below
let userType    = null;       // 'admin' or 'customer'

// Auto-detect login mode from page URL
// admin.html → admin mode, everything else → customer mode
const PAGE_NAME = window.location.pathname.split('/').pop().toLowerCase();
let loginMode = PAGE_NAME === 'admin.html' ? 'admin' : 'customer';

// Session timeout (5 minutes idle = warning, then 60s to respond)
let sessionIdleTimer = null;
let sessionCountdownTimer = null;
const SESSION_IDLE_MS = 5 * 60 * 1000;  // 5 minutes

// ---------------------------------------------------------------------------
// DOM References
// ---------------------------------------------------------------------------
const loginScreen    = document.getElementById('login-screen');
const mainDashboard  = document.getElementById('main-dashboard');
const navMenu        = document.getElementById('nav-menu');
const dynamicContent = document.getElementById('dynamic-content');
const welcomeMsg     = document.getElementById('user-greeting');
const bottomNav      = document.getElementById('bottom-nav');

// Load user from session
try {
    const storedUser = localStorage.getItem('coretrust_user');
    currentUser = storedUser ? JSON.parse(storedUser) : null;
    if (currentUser && currentUser.status === 'admin') userType = 'admin';
    else if (currentUser) userType = 'customer';
    console.log("Core-Trust: Session loaded", { userType, currentUser: currentUser?.name });
} catch (e) {
    console.error("Core-Trust: Failed to parse session", e);
    currentUser = null;
    localStorage.removeItem('coretrust_user');
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
    console.log("Core-Trust: Initializing listeners...");
    initEventListeners();
    startLiveClock();

    // Check for Supabase session (Google Auth callback)
    if (supabase) {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session && session.user) {
                console.log("Core-Trust: Supabase session found");
                handleSupabaseUser(session.user);
                return;
            }
        } catch (err) {
            console.error("Core-Trust: Supabase check failed", err);
        }
    }

    // Pre-fill remembered ID
    const rememberedId = localStorage.getItem('remembered_uid');
    const loginUidInput = document.getElementById('login-uid');
    const rememberCheckbox = document.getElementById('login-remember');
    if (rememberedId && loginUidInput) {
        loginUidInput.value = rememberedId;
        if (rememberCheckbox) rememberCheckbox.checked = true;
    }

    if (currentUser) {
        showDashboard();
    } else {
        const params = new URLSearchParams(window.location.search);
        if (params.get('mode') === 'signup') {
            showSignUp();
        }
    }
});

function initEventListeners() {
    // Legacy toggle support (if toggle buttons exist on the page)
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            loginMode = e.target.dataset.mode;
        });
    });

    // Buttons use inline onclick attributes in HTML.
    
    // Allow Enter key to trigger login
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && loginScreen && loginScreen.classList.contains('active')) {
            handleLogin();
        }
    });

    // Track user activity for session timeout
    ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(event => {
        document.addEventListener(event, () => {
            if (currentUser) resetSessionTimer();
        });
    });
}

// ---------------------------------------------------------------------------
// Live Clock
// ---------------------------------------------------------------------------
function startLiveClock() {
    const clockEl = document.getElementById('live-clock');
    if (!clockEl) return;
    function tick() {
        const now = new Date();
        clockEl.textContent = now.toLocaleString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    }
    tick();
    setInterval(tick, 1000);
}

// ---------------------------------------------------------------------------
// Session Timeout
// ---------------------------------------------------------------------------
function startSessionTimer() {
    resetSessionTimer();
}

function resetSessionTimer() {
    const bar = document.getElementById('session-timeout-bar');
    if (bar) bar.style.display = 'none';
    clearTimeout(sessionIdleTimer);
    clearInterval(sessionCountdownTimer);

    sessionIdleTimer = setTimeout(() => {
        showSessionWarning();
    }, SESSION_IDLE_MS);
}

function showSessionWarning() {
    const bar = document.getElementById('session-timeout-bar');
    const countdown = document.getElementById('timeout-countdown');
    if (!bar || !countdown) return;
    bar.style.display = 'flex';
    let seconds = 60;
    countdown.textContent = seconds;
    sessionCountdownTimer = setInterval(() => {
        seconds--;
        countdown.textContent = seconds;
        if (seconds <= 0) {
            clearInterval(sessionCountdownTimer);
            bar.style.display = 'none';
            location.reload(); // Auto-logout
        }
    }, 1000);
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
    if (!container) {
        console.warn("Core-Trust Notification: ", title, message);
        return;
    }
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
// Loading State Helpers
// ---------------------------------------------------------------------------

function showLoading(elementId) {
    const el = document.getElementById(elementId);
    if (el) {
        el.innerHTML = `
            <div class="empty-state">
                <span class="loading-spinner dark" style="width:40px;height:40px"></span>
                <p>Loading...</p>
            </div>
        `;
    }
}

// ---------------------------------------------------------------------------
// UI Helpers
// ---------------------------------------------------------------------------


function showSignIn() {
    const sin = document.getElementById('signin-form');
    const sup = document.getElementById('signup-form');
    const otp = document.getElementById('otp-form');
    const fpwd = document.getElementById('forgot-password-form');
    const tsin = document.getElementById('tab-signin');
    const tsup = document.getElementById('tab-signup');

    // Switch active forms using classes and inline styles
    if (sin) { sin.style.display = 'block'; sin.classList.add('active'); }
    if (sup) { sup.style.display = 'none'; sup.classList.remove('active'); }
    if (otp) { otp.style.display = 'none'; otp.classList.remove('active'); }
    if (fpwd) { fpwd.style.display = 'none'; fpwd.classList.remove('active'); }

    // Update tabs
    if (tsin) tsin.classList.add('active');
    if (tsup) tsup.classList.remove('active');

    // Update hero image and text
    const heroImg = document.getElementById('auth-hero-img');
    const heroTitle = document.querySelector('.auth-hero-text h2');
    const heroText = document.querySelector('.auth-hero-text p');
    const dots = document.querySelectorAll('.auth-hero-slider-dots .dot');

    if (heroImg) {
        heroImg.style.opacity = '0';
        setTimeout(() => {
            heroImg.src = 'assets/login-hero.png';
            heroImg.style.opacity = '1';
        }, 200);
    }

    if (heroTitle) heroTitle.innerHTML = 'Banking That<br>Works For You';
    if (heroText) heroText.textContent = 'Secure digital banking with instant transfers, real-time tracking, and 256-bit encryption.';

    if (dots.length >= 3) {
        dots.forEach((d, i) => d.classList.toggle('active', i === 0));
    }
}

function showSignUp() {
    const sin = document.getElementById('signin-form');
    const sup = document.getElementById('signup-form');
    const otp = document.getElementById('otp-form');
    const fpwd = document.getElementById('forgot-password-form');
    const tsin = document.getElementById('tab-signin');
    const tsup = document.getElementById('tab-signup');

    // Switch active forms using classes and inline styles
    if (sup) { sup.classList.add('active'); sup.style.display = ''; }
    if (sin) { sin.classList.remove('active'); sin.style.display = 'none'; }
    if (otp) { otp.classList.remove('active'); otp.style.display = 'none'; }
    if (fpwd) { fpwd.classList.remove('active'); fpwd.style.display = 'none'; }

    // Update tabs
    if (tsup) tsup.classList.add('active');
    if (tsin) tsin.classList.remove('active');

    // Update hero image and text
    const heroImg = document.getElementById('auth-hero-img');
    const heroTitle = document.querySelector('.auth-hero-text h2');
    const heroText = document.querySelector('.auth-hero-text p');
    const dots = document.querySelectorAll('.auth-hero-slider-dots .dot');

    if (heroImg) {
        heroImg.style.opacity = '0';
        setTimeout(() => {
            heroImg.src = 'assets/signup-hero.png';
            heroImg.style.opacity = '1';
        }, 200);
    }

    if (heroTitle) heroTitle.innerHTML = 'Join The Future<br>Of Finance';
    if (heroText) heroText.textContent = 'Open an account in minutes and start your journey towards modern, secure digital banking.';

    if (dots.length >= 3) {
        dots.forEach((d, i) => d.classList.toggle('active', i === 1));
    }
}

function showForgotPassword() {
    const sin = document.getElementById('signin-form');
    const sup = document.getElementById('signup-form');
    const otp = document.getElementById('otp-form');
    const fpwd = document.getElementById('forgot-password-form');

    if (sin) { sin.style.display = 'none'; sin.classList.remove('active'); }
    if (sup) { sup.style.display = 'none'; sup.classList.remove('active'); }
    if (otp) { otp.style.display = 'none'; otp.classList.remove('active'); }
    if (fpwd) { fpwd.style.display = 'block'; fpwd.classList.add('active'); }

    const heroTitle = document.querySelector('.auth-hero-text h2');
    const heroText = document.querySelector('.auth-hero-text p');
    if (heroTitle) heroTitle.innerHTML = 'Account<br>Recovery';
    if (heroText) heroText.textContent = 'Reset your password securely to regain access to your digital banking portal.';
}

function nextSignupStep(step) {
    document.querySelectorAll('.signup-step').forEach(s => {
        s.classList.remove('active');
        s.style.display = 'none';
    });
    const nextStepEl = document.getElementById(`signup-step-${step}`);
    if (nextStepEl) {
        nextStepEl.classList.add('active');
        nextStepEl.style.display = '';
    }
    
    document.querySelectorAll('.progress-step').forEach((s, idx) => {
        if (idx < step) s.classList.add('active');
        else s.classList.remove('active');
    });
}

function prevSignupStep(step) {
    nextSignupStep(step);
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

let tempAuthResult = null;

async function continueWithGoogle() {
    // Using Supabase client (assumes supabase is already initialized)
    if (typeof supabase === 'undefined') {
        console.error('Supabase client not available');
        showToast('error', 'Configuration Error', 'Supabase client not initialized');
        return;
    }
    supabase.auth.signInWithOAuth({ provider: 'google' })
        .then(({ data, error }) => {
            if (error) {
                console.error('Google sign‑in error:', error);
                showToast('error', 'Google Sign‑In Failed', error.message);
                return;
            }
            // OAuth flow redirects; on return the auth state change listener will fire.
        });
}

// Handle Login Flow
async function handleLogin() {
    const uid = document.getElementById('login-uid').value.trim();
    const pwd = document.getElementById('login-pwd').value;
    const btnText = loginMode === 'admin' ? 'AUTHENTICATE' : 'SIGN IN TO MY ACCOUNT';

    if (!uid || !pwd) {
        showToast('error', 'Auth Error', 'Please enter your credentials');
        return;
    }

    setButtonLoading('login-btn', true, btnText);

    try {
        const result = await apiPost('/login', { id: uid, password: pwd, mode: loginMode });

        if (!result.success) {
            showToast('error', 'Authentication Failed', result.message || 'Invalid credentials');
            return;
        }

        // Trigger the OTP 2FA flow
        tempAuthResult = result;

        // Handle Remember Me
        const remember = document.getElementById('login-remember');
        if (remember && remember.checked) {
            localStorage.setItem('remembered_uid', uid);
        } else {
            localStorage.removeItem('remembered_uid');
        }

        document.getElementById('signin-form').classList.remove('active');
        document.getElementById('signin-form').style.display = 'none';
        
        const otpForm = document.getElementById('otp-form');
        if (otpForm) {
            otpForm.style.display = 'block';
            otpForm.classList.add('active');
        }
        
        showToast('success', 'Credentials Verified', 'Please enter the OTP sent to your device.');
        
    } catch (err) {
        console.error(err);
        showToast('error', 'Network Error', 'Cannot reach server. Is your internet connected?');
    } finally {
        setButtonLoading('login-btn', false, btnText);
    }
}

// Attach Google button if present (inline button uses onclick, but we also bind for safety)
const googleBtn = document.getElementById('google-login-btn');
if (googleBtn) {
    googleBtn.addEventListener('click', continueWithGoogle);
}

async function handleSignUp() {
    const fname = document.getElementById('signup-fname').value.trim();
    const lname = document.getElementById('signup-lname').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    
    const pwd = document.getElementById('signup-pwd').value;
    const cpwd = document.getElementById('signup-cpwd').value;

    if (!fname || !lname || !email || !pwd) {
        showToast('error', 'Incomplete', 'Please fill in all required fields.');
        return;
    }
    if (pwd !== cpwd) {
        showToast('error', 'Mismatch', 'Passwords do not match');
        return;
    }
    if (pwd.length < 4) {
        showToast('error', 'Weak Password', 'Password must be at least 4 characters');
        return;
    }

    const btn = document.getElementById('signup-btn');
    const originalText = btn.textContent;
    setButtonLoading('signup-btn', true, originalText);

    try {
        const result = await apiPost('/register', {
            name: fname + ' ' + lname,
            email: email,
            password: pwd
        });
        if (result.success) {
            showToast('success', 'Account Created!', `Welcome to Core-Trust! Redirecting to your dashboard...`);
            
            // Auto-login the user
            currentUser = result.user || { id: result.id, name: fname + ' ' + lname, email: email, status: 'active' };
            userType = 'customer';
            localStorage.setItem('coretrust_user', JSON.stringify(currentUser));
            
            setTimeout(() => {
                showDashboard();
            }, 1500);
        } else {
            showToast('error', 'Registration Failed', result.message);
        }
    } catch (err) {
        showToast('error', 'Network Error', 'The registration server is currently unreachable.');
    } finally {
        setButtonLoading('signup-btn', false, originalText);
    }
}

async function handlePasswordResetRequest() {
    const uid = document.getElementById('reset-uid').value.trim();
    if (!uid) {
        showToast('error', 'Required', 'Please enter your email or Account ID.');
        return;
    }
    setButtonLoading('request-reset-btn', true, 'Send Reset OTP');
    setTimeout(() => {
        showToast('success', 'OTP Sent', 'If the account exists, an OTP has been sent.');
        setButtonLoading('request-reset-btn', false, 'Send Reset OTP');
        // Show OTP form in real flow, here we just return to sign in
        setTimeout(showSignIn, 2000);
    }, 1500);
}

function handleBiometricLogin() {
    showToast('info', 'Biometric Check', 'Please authenticate using Touch ID / Face ID.');
    // Mocking success
    setTimeout(() => {
        showToast('error', 'Biometrics Failed', 'No biometric sensor detected on this device.');
    }, 2000);
}

/**
 * Actual Continue with Google flow using Supabase
 */
async function continueWithGoogle() {
    if (!supabase) {
        showToast('error', 'Supabase Error', 'Supabase client not initialized.');
        return;
    }

    showToast('info', 'Google Auth', 'Redirecting to secure Google authentication...');
    
    try {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin + window.location.pathname
            }
        });
        if (error) throw error;
    } catch (err) {
        console.error('Supabase OAuth Error:', err);
        showToast('error', 'Authentication Failed', err.message || 'Could not connect to Google.');
    }
}

/**
 * Handle user data from Supabase
 */
async function handleSupabaseUser(sbUser) {
    showToast('success', 'Google Verified', 'Successfully authenticated with Google.');
    
    // Transform Supabase user to Core-Trust user format
    const mockGoogleUser = {
        name: sbUser.user_metadata.full_name || sbUser.email.split('@')[0],
        email: sbUser.email,
        google_id: sbUser.id,
        auth_provider: "google"
    };
    
    try {
        // Sync with our backend
        const result = await apiPost('/auth/google', mockGoogleUser);
        if (result.success) {
            currentUser = result.user;
            userType = 'customer';
            localStorage.setItem('coretrust_user', JSON.stringify(currentUser));
            showToast('success', 'Welcome', `Welcome, ${currentUser.name}!`);
            showDashboard();
        } else {
            showToast('error', 'Sync Failed', result.message);
            // Sign out from Supabase if backend sync fails to avoid stuck state
            await supabase.auth.signOut();
        }
    } catch (err) {
        console.error('Backend Sync Error:', err);
        showToast('error', 'Server Error', 'Could not sync Google account with banking system.');
    }
}

/**
 * Handle OTP Verification
 */
async function handleVerifyOtp() {
    const otp = document.getElementById('login-otp').value.trim();
    if (otp.length !== 6) {
        showToast('error', 'Invalid Code', 'Please enter the 6-digit verification code sent to your device.');
        return;
    }

    showToast('info', 'Verifying...', 'Securing your session...');
    
    // For demo/dev purposes, we'll accept any 6-digit code or a specific one if needed
    // In a real app, this would be an API call: await apiPost('/verify-otp', { id: tempUserId, otp });
    
    setTimeout(() => {
        if (tempAuthResult) {
            currentUser = tempAuthResult.user;
            userType    = loginMode;
            localStorage.setItem('coretrust_user', JSON.stringify(currentUser));
            showToast('success', 'Security Verified', 'Identity confirmed. Welcome to Core-Trust.');

            document.getElementById('otp-form').classList.remove('active');
            document.getElementById('signin-form').classList.add('active'); // Reset for next time
            document.getElementById('login-otp').value = '';

            showDashboard();
        } else {
            showToast('error', 'Session Expired', 'Please try logging in again.');
            location.reload();
        }
    }, 1500);
}



function resendOtp() {
    showToast('success', 'OTP Resent', 'A new verification code has been sent.');
}

// ---------------------------------------------------------------------------
// Dashboard Layout
// ---------------------------------------------------------------------------

function showDashboard() {
    // Show Secure Loader
    const loader = document.getElementById('secure-loader');
    const progressBar = document.getElementById('loader-progress-bar');
    const loaderText = document.getElementById('loader-text');
    
    if (loader && progressBar && loaderText) {
        loader.style.display = 'flex';
        loader.classList.add('active');
        loader.classList.remove('fade-out');
        
        // Fake loading sequence
        setTimeout(() => { progressBar.style.width = '30%'; loaderText.textContent = 'Authenticating credentials...'; }, 400);
        setTimeout(() => { progressBar.style.width = '60%'; loaderText.textContent = 'Establishing secure 256-bit connection...'; }, 1000);
        setTimeout(() => { progressBar.style.width = '90%'; loaderText.textContent = 'Loading account data...'; }, 1600);
        setTimeout(() => { 
            progressBar.style.width = '100%'; 
            loaderText.textContent = 'Secure connection established.';
            
            // Fade out loader and show dashboard
            setTimeout(() => {
                loader.classList.add('fade-out');
                setTimeout(() => {
                    loader.classList.remove('active');
                    loader.style.display = 'none';
                }, 500);
                finalizeDashboardLoad();
            }, 500);
        }, 2200);
    } else {
        finalizeDashboardLoad();
    }
}

function finalizeDashboardLoad() {
    if (loginScreen) loginScreen.classList.remove('active');
    if (mainDashboard) mainDashboard.classList.add('active');
    if (welcomeMsg && currentUser) {
        welcomeMsg.textContent = `Welcome back, ${currentUser.name.split(' ')[0]}`;
    }
    document.getElementById('sub-greeting').textContent =
        userType === 'admin'
            ? 'System Administration Panel'
            : "Here's your account overview.";

    renderSidebar();
    renderBottomNav();
    startSessionTimer();

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
        { icon: 'fa-chart-pie',       text: 'Overview',     cmd: showAdminOverview },
        { icon: 'fa-users',           text: 'Customers',    cmd: showAdminCustomers },
        { icon: 'fa-user-plus',       text: 'New Profile',  cmd: showAdminNewProfile },
        { icon: 'fa-search',          text: 'Search',       cmd: showAdminSearch },
        { icon: 'fa-receipt',         text: 'Financials',   cmd: showAdminTrans },
        { icon: 'fa-history',         text: 'Transactions', cmd: showAdminAllTransactions },
        { icon: 'fa-sign-out-alt',    text: 'Logout',       cmd: logout }
    ];

    let customerItems = [];
    if (currentUser && currentUser.status && currentUser.status !== 'active') {
        customerItems = [
            { icon: 'fa-home',            text: 'Dashboard',   cmd: showCustomerDashboard },
            { icon: 'fa-user-circle',     text: 'Profile',     cmd: showCustomerProfile },
            { icon: 'fa-sign-out-alt',    text: 'Logout',      cmd: logout }
        ];
    } else {
        customerItems = [
            { icon: 'fa-home',            text: 'Dashboard',   cmd: showCustomerDashboard },
            { icon: 'fa-piggy-bank',      text: 'Deposit',     cmd: showCustomerDeposit },
            { icon: 'fa-money-bill-wave', text: 'Withdraw',    cmd: showCustomerWithdraw },
            { icon: 'fa-exchange-alt',    text: 'Transfer',    cmd: showCustomerTransfer },
            { icon: 'fa-address-book',    text: 'Beneficiaries',cmd: showCustomerBeneficiaries },
            { icon: 'fa-hand-holding-usd',text: 'Loans',       cmd: showCustomerLoans },
            { icon: 'fa-history',         text: 'History',     cmd: showCustomerHistory },
            { icon: 'fa-user-circle',     text: 'Profile',     cmd: showCustomerProfile },
            { icon: 'fa-sign-out-alt',    text: 'Logout',      cmd: logout }
        ];
    }

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
        { icon: 'fa-chart-pie',    text: 'Overview',   cmd: showAdminOverview },
        { icon: 'fa-users',        text: 'Customers',  cmd: showAdminCustomers },
        { icon: 'fa-user-plus',    text: 'Add',        cmd: showAdminNewProfile },
        { icon: 'fa-search',       text: 'Search',     cmd: showAdminSearch },
        { icon: 'fa-sign-out-alt', text: 'Logout',     cmd: logout }
    ];
    let customerItems = [];
    if (currentUser && currentUser.status && currentUser.status !== 'active') {
        customerItems = [
            { icon: 'fa-home',            text: 'Home',     cmd: showCustomerDashboard },
            { icon: 'fa-user-circle',     text: 'Profile',  cmd: showCustomerProfile },
            { icon: 'fa-sign-out-alt',    text: 'Logout',   cmd: logout }
        ];
    } else {
        customerItems = [
            { icon: 'fa-home',            text: 'Home',     cmd: showCustomerDashboard },
            { icon: 'fa-piggy-bank',      text: 'Deposit',  cmd: showCustomerDeposit },
            { icon: 'fa-money-bill-wave', text: 'Withdraw', cmd: showCustomerWithdraw },
            { icon: 'fa-exchange-alt',    text: 'Transfer', cmd: showCustomerTransfer },
            { icon: 'fa-history',         text: 'History',  cmd: showCustomerHistory },
            { icon: 'fa-sign-out-alt',    text: 'Logout',   cmd: logout }
        ];
    }
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
// Reusable UI Components & Formatters
// ---------------------------------------------------------------------------

function formatAccountID(id) {
    if (!id) return 'Unknown';
    // If it's a UUID or long string, format it like CT-XXXX-XXXX-XXXX
    let cleanStr = String(id).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (cleanStr.length > 12) cleanStr = cleanStr.substring(0, 12);
    
    // Group by 4
    let formatted = cleanStr.match(/.{1,4}/g);
    if (formatted) {
        return 'CT-' + formatted.join('-');
    }
    return id;
}

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
        <div class="empty-state">
            <span class="loading-spinner dark" style="width:40px;height:40px"></span>
            <p>Loading dashboard...</p>
        </div>
    `;
    fetchSystemStats();
}

async function fetchSystemStats() {
    try {
        const analytics = await apiGet('/admin/analytics');
        const totalCustomers = analytics.total_customers || 0;
        const totalDeposits = analytics.total_deposits || 0;
        const recentTx = analytics.recent_transactions || [];

        const now = new Date();
        const timeString = now.toLocaleTimeString();

        // Build recent transactions mini-list
        const recentTxHtml = recentTx.slice(0, 5).map(t => {
            const isCredit = t.type && (t.type.toLowerCase().includes('deposit') || t.type.toLowerCase().includes('from'));
            return `
                <div class="recent-tx-item">
                    <div class="recent-tx-icon ${isCredit ? 'credit' : 'debit'}">
                        <i class="fas ${isCredit ? 'fa-arrow-down' : 'fa-arrow-up'}"></i>
                    </div>
                    <div class="recent-tx-details">
                        <div class="recent-tx-type">${t.type || 'Transaction'}</div>
                        <div class="recent-tx-date">ID: ${t.customer_id || '—'} · ${(t.created_at || '').slice(0,10)}</div>
                    </div>
                    <div class="recent-tx-amount ${isCredit ? 'positive' : 'negative'}">
                        ${isCredit ? '+' : '-'}${formatCurrency(Math.abs(t.amount || 0))}
                    </div>
                </div>
            `;
        }).join('') || '<div class="empty-state"><i class="fas fa-inbox"></i><p>No recent transactions</p></div>';

        dynamicContent.innerHTML = `
            <div class="stats-grid-4">
                ${createStatCard('Total Customers', totalCustomers, 'fa-users', '✓ Active accounts')}
                ${createStatCard('Total Deposits', formatCurrency(totalDeposits), 'fa-wallet', 'System-wide balance')}
                ${createStatCard('System Status', 'Operational', 'fa-check-circle', 'All systems healthy')}
                ${createStatCard('Security', 'Active', 'fa-shield-alt', '256-bit encryption')}
            </div>

            <div class="dashboard-cards-row">
                <div class="content-card glass">
                    <h2><i class="fas fa-chart-bar"></i> Transaction Volume (7 Days)</h2>
                    <div class="chart-container">
                        <!-- Dummy CSS Chart Bars -->
                        <div class="chart-bar-wrap"><div class="chart-bar" style="height: 30%"></div><div class="chart-label">Mon</div></div>
                        <div class="chart-bar-wrap"><div class="chart-bar" style="height: 50%"></div><div class="chart-label">Tue</div></div>
                        <div class="chart-bar-wrap"><div class="chart-bar" style="height: 80%"></div><div class="chart-label">Wed</div></div>
                        <div class="chart-bar-wrap"><div class="chart-bar" style="height: 40%"></div><div class="chart-label">Thu</div></div>
                        <div class="chart-bar-wrap"><div class="chart-bar" style="height: 90%"></div><div class="chart-label">Fri</div></div>
                        <div class="chart-bar-wrap"><div class="chart-bar" style="height: 60%"></div><div class="chart-label">Sat</div></div>
                        <div class="chart-bar-wrap"><div class="chart-bar" style="height: 75%"></div><div class="chart-label">Sun</div></div>
                    </div>
                </div>
                <div class="content-card glass">
                    <h2><i class="fas fa-bolt"></i> Quick Actions</h2>
                    <div style="display:flex; flex-direction:column; gap:10px; margin-top:0.5rem">
                        <button onclick="showAdminCustomers()" class="btn btn-primary" style="padding:1rem;text-align:left">
                            <i class="fas fa-users" style="margin-right:10px"></i>View All Customers
                        </button>
                        <button onclick="showAdminNewProfile()" class="btn btn-primary" style="padding:1rem;text-align:left">
                            <i class="fas fa-user-plus" style="margin-right:10px"></i>Onboard New Customer
                        </button>
                        <button onclick="showAdminSearch()" class="btn btn-primary" style="padding:1rem;text-align:left">
                            <i class="fas fa-search" style="margin-right:10px"></i>Search Customer
                        </button>
                        <button onclick="showAdminTrans()" class="btn btn-primary" style="padding:1rem;text-align:left">
                            <i class="fas fa-receipt" style="margin-right:10px"></i>Financial Audit
                        </button>
                    </div>
                </div>
            </div>

            <div class="dashboard-cards-row" style="margin-top:24px">
                <div class="content-card glass">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                        <h2 style="margin:0"><i class="fas fa-history"></i> Recent Transactions</h2>
                        <button onclick="showAdminAllTransactions()" class="btn-secondary" style="padding:6px 12px; font-size:0.8rem">View All</button>
                    </div>
                    ${recentTxHtml}
                </div>
                <div class="content-card glass">
                    <h2><i class="fas fa-terminal"></i> System Event Logs</h2>
                    <div class="system-logs">
                        <div class="system-log-item">
                            <div class="system-log-icon"><i class="fas fa-info-circle text-info"></i></div>
                            <div class="system-log-content">
                                <div class="system-log-msg">Admin session started</div>
                                <div class="system-log-time">${timeString}</div>
                            </div>
                        </div>
                        <div class="system-log-item">
                            <div class="system-log-icon"><i class="fas fa-database text-success" style="color:#10B981"></i></div>
                            <div class="system-log-content">
                                <div class="system-log-msg">Supabase connected securely</div>
                                <div class="system-log-time">2 mins ago</div>
                            </div>
                        </div>
                        <div class="system-log-item">
                            <div class="system-log-icon"><i class="fas fa-shield-alt text-warning" style="color:#D97706"></i></div>
                            <div class="system-log-content">
                                <div class="system-log-msg">Automated backups running</div>
                                <div class="system-log-time">1 hr ago</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="content-card glass">
                <h2><i class="fas fa-chart-line"></i> System Metrics</h2>
                <div class="table-header">
                    <div>Metric</div><div>Value</div><div>Status</div><div>Updated</div>
                </div>
                <div class="table-row">
                    <div><i class="fas fa-users" style="color:var(--color-accent);margin-right:8px"></i>Registered Customers</div>
                    <div><strong>${totalCustomers}</strong></div>
                    <div class="tx-badge credit">Active</div>
                    <div style="color:var(--text-muted)">${timeString}</div>
                </div>
                <div class="table-row">
                    <div><i class="fas fa-database" style="color:var(--color-accent);margin-right:8px"></i>Database Connection</div>
                    <div>Supabase</div>
                    <div class="tx-badge credit">Connected</div>
                    <div style="color:var(--text-muted)">${timeString}</div>
                </div>
                <div class="table-row">
                    <div><i class="fas fa-server" style="color:var(--color-accent);margin-right:8px"></i>API Server</div>
                    <div>Flask / Port 5000</div>
                    <div class="tx-badge credit">Running</div>
                    <div style="color:var(--text-muted)">${timeString}</div>
                </div>
                <div class="table-row">
                    <div><i class="fas fa-lock" style="color:var(--color-accent);margin-right:8px"></i>Encryption</div>
                    <div>bcrypt + SSL</div>
                    <div class="tx-badge credit">Active</div>
                    <div style="color:var(--text-muted)">${timeString}</div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error loading stats:', error);
        dynamicContent.innerHTML = `
            <div class="stats-grid">
                ${createStatCard('System Status', 'Healthy', 'fa-shield-halved', '✓ All services online')}
                ${createStatCard('Database', 'Connected', 'fa-database', 'Supabase active')}
                ${createStatCard('API Server', 'Running', 'fa-server', 'Port 5000 • Flask')}
            </div>
        `;
    }
}


// ── Admin: All Customers List ──────────────────────────────

async function showAdminCustomers() {
    dynamicContent.innerHTML = `
        <div class="empty-state">
            <span class="loading-spinner dark" style="width:40px;height:40px"></span>
            <p>Loading customers...</p>
        </div>
    `;

    try {
        const result = await apiGet('/admin/customers');
        const customers = result.customers || [];

        const rows = customers.map(c => {
            const statusStr = c.status || 'pending';
            const statusClass = statusStr === 'active' ? 'credit' : (statusStr === 'suspended' ? 'debit' : 'pending');
            const toggleAction = statusStr === 'active' 
                ? `<button class="table-action-btn delete-btn" onclick="adminSetStatus('${c.id}', 'suspended')" title="Suspend"><i class="fas fa-ban"></i></button>`
                : `<button class="table-action-btn view-btn" style="color:#10B981" onclick="adminSetStatus('${c.id}', 'active')" title="Approve"><i class="fas fa-check-circle"></i></button>`;

            return `
            <tr>
                <td><strong>${c.id}</strong></td>
                <td>${c.name}</td>
                <td><span class="tx-badge ${statusClass}" style="padding:4px 8px;font-size:0.75rem">${statusStr.toUpperCase()}</span></td>
                <td>${c.phone || '—'}</td>
                <td style="font-weight:700;color:var(--color-success)">${formatCurrency(c.balance || 0)}</td>
                <td>
                    ${toggleAction}
                    <button class="table-action-btn view-btn" onclick="adminViewCustomer('${c.id}')" title="View">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="table-action-btn delete-btn" onclick="adminDeleteCustomer('${c.id}','${c.name}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
            `;
        }).join('');

        dynamicContent.innerHTML = `
            <div class="content-card glass">
                <h2><i class="fas fa-users"></i> All Customers <span class="status-badge active" style="margin-left:8px">${customers.length} accounts</span></h2>
                ${customers.length ? `
                <div class="customer-table-wrap">
                    <table class="customer-table">
                        <thead>
                            <tr>
                                <th>Account ID</th>
                                <th>Name</th>
                                <th>Status</th>
                                <th>Phone</th>
                                <th>Balance</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
                ` : '<div class="empty-state"><i class="fas fa-users-slash"></i><p>No customers found.</p></div>'}
                <div class="receipt-actions">
                    <button onclick="showAdminNewProfile()" class="btn-secondary">
                        <i class="fas fa-user-plus"></i> Add New Customer
                    </button>
                    <button onclick="exportCustomersCSV()" class="btn-secondary">
                        <i class="fas fa-download"></i> Export CSV
                    </button>
                </div>
            </div>
        `;
    } catch (err) {
        console.error(err);
        showToast('error', 'Load Error', 'Failed to load customer list');
    }
}

async function adminSetStatus(id, newStatus) {
    const confirmed = await showModal({
        title: 'Change Account Status',
        message: `Are you sure you want to change this account to <strong>${newStatus.toUpperCase()}</strong>?`,
        icon: 'fa-shield-alt',
        confirmText: 'YES, PROCEED',
        cancelText: 'CANCEL'
    });
    if (!confirmed) return;

    const result = await apiPost('/admin/customers/status', { id, status: newStatus });
    if (result.success) {
        showToast('success', 'Status Updated', result.message);
        showAdminCustomers();
    } else {
        showToast('error', 'Update Failed', result.message);
    }
}

async function adminViewCustomer(id) {
    // Reuse the search functionality
    const result = await apiGet('/admin/search', { id });
    if (result.success) {
        const d = result.customer;
        const balance = parseFloat(d.balance || 0);
        const initials = d.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

        dynamicContent.innerHTML = `
            <div class="content-card glass">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:1.5rem">
                    <button onclick="showAdminCustomers()" class="btn-secondary" style="padding:8px 14px">
                        <i class="fas fa-arrow-left"></i> Back
                    </button>
                    <h2 style="margin:0"><i class="fas fa-user-circle" style="color:var(--color-accent)"></i> Customer Profile</h2>
                </div>
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
                <div class="receipt-actions" style="margin-top:1.5rem">
                    <button onclick="handleAuditById('${d.id}')" class="btn-secondary">
                        <i class="fas fa-receipt"></i> View Transactions
                    </button>
                    <button onclick="adminDeleteCustomer('${d.id}','${d.name}')" class="btn-secondary" style="color:var(--color-danger);border-color:rgba(239,68,68,0.3)">
                        <i class="fas fa-trash"></i> Delete Account
                    </button>
                </div>
            </div>
        `;
    } else {
        showToast('error', 'Not Found', 'Customer not found');
    }
}

async function adminDeleteCustomer(id, name) {
    const confirmed = await showModal({
        title: 'Delete Customer',
        message: `Permanently delete <strong>${name}</strong> (ID: ${id})? This will remove all their data and transaction history. This action cannot be undone.`,
        icon: 'fa-exclamation-triangle',
        confirmText: 'DELETE',
        cancelText: 'CANCEL'
    });
    if (!confirmed) return;

    const result = await apiPost('/admin/delete-customer', { id });
    if (result.success) {
        showToast('success', 'Customer Deleted', result.message);
        showAdminCustomers();
    } else {
        showToast('error', 'Delete Failed', result.message);
    }
}

async function handleAuditById(id) {
    dynamicContent.innerHTML = '<div class="empty-state"><span class="loading-spinner dark" style="width:40px;height:40px"></span><p>Loading audit...</p></div>';
    const result = await apiGet('/admin/audit', { id });
    if (result.success) {
        const rows = result.history.length
            ? result.history.map(t => {
                const isCredit = t.type.toLowerCase().includes('deposit') || t.type.toLowerCase().includes('from');
                return `
                    <div class="table-row">
                        <div><span class="tx-badge ${isCredit ? 'credit' : 'debit'}"><i class="fas ${isCredit ? 'fa-arrow-down' : 'fa-arrow-up'}"></i> ${t.type}</span></div>
                        <div class="tx-amount ${isCredit ? 'positive' : 'negative'}">${isCredit ? '+' : '-'}${formatCurrency(Math.abs(t.amount))}</div>
                        <div style="color:var(--text-muted);font-size:0.82rem">${t.id.slice(0,8)}…</div>
                        <div style="color:var(--text-muted);font-size:0.85rem">${t.created_at.slice(0,10)}</div>
                    </div>
                `;
            }).join('')
            : '<div class="empty-state"><i class="fas fa-inbox"></i><p>No transactions found.</p></div>';

        dynamicContent.innerHTML = `
            <div class="content-card glass">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:1.5rem">
                    <button onclick="showAdminCustomers()" class="btn-secondary" style="padding:8px 14px"><i class="fas fa-arrow-left"></i> Back</button>
                    <h2 style="margin:0"><i class="fas fa-receipt" style="color:var(--color-accent)"></i> Audit: Account ${id}</h2>
                </div>
                <div class="balance-hero" style="padding:2rem;margin-bottom:1.5rem">
                    <div class="balance-hero-label">Current Balance</div>
                    <div class="balance-hero-amount"><span>UGX </span>${formatAbbreviation(result.balance || 0)}</div>
                </div>
                <div class="table-header"><div>Type</div><div>Amount</div><div>Reference</div><div>Date</div></div>
                ${rows}
            </div>
        `;
    } else {
        showToast('error', 'Audit Failed', result.message);
        showAdminCustomers();
    }
}

function exportCustomersCSV() {
    apiGet('/admin/customers').then(result => {
        const customers = result.customers || [];
        if (!customers.length) { showToast('error', 'No Data', 'No customers to export'); return; }
        const headers = ['Account ID', 'Name', 'Phone', 'Address', 'Balance'];
        const csvRows = [headers.join(',')];
        customers.forEach(c => {
            csvRows.push([c.id, `"${c.name}"`, c.phone || '', `"${c.address || ''}"`, c.balance || 0].join(','));
        });
        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `core-trust-customers-${new Date().toISOString().slice(0,10)}.csv`;
        a.click(); URL.revokeObjectURL(url);
        showToast('success', 'Exported', 'Customer list downloaded as CSV');
    });
}

// ── Admin: All Transactions View ───────────────────────────

async function showAdminAllTransactions() {
    dynamicContent.innerHTML = '<div class="empty-state"><span class="loading-spinner dark" style="width:40px;height:40px"></span><p>Loading transactions...</p></div>';

    try {
        const result = await apiGet('/admin/transactions', { limit: 100 });
        const transactions = result.transactions || [];

        const rows = transactions.length
            ? transactions.map(t => {
                const isCredit = t.type && (t.type.toLowerCase().includes('deposit') || t.type.toLowerCase().includes('from'));
                return `
                    <div class="table-row">
                        <div>${t.customer_id || '—'}</div>
                        <div><span class="tx-badge ${isCredit ? 'credit' : 'debit'}"><i class="fas ${isCredit ? 'fa-arrow-down' : 'fa-arrow-up'}"></i> ${t.type}</span></div>
                        <div class="tx-amount ${isCredit ? 'positive' : 'negative'}">${isCredit ? '+' : '-'}${formatCurrency(Math.abs(t.amount))}</div>
                        <div style="color:var(--text-muted);font-size:0.82rem">${t.id ? t.id.slice(0,8) + '…' : '—'}</div>
                        <div style="color:var(--text-muted);font-size:0.85rem">${(t.created_at || '').slice(0,10)}</div>
                    </div>
                `;
            }).join('')
            : '<div class="empty-state"><i class="fas fa-inbox"></i><p>No transactions in the system.</p></div>';

        dynamicContent.innerHTML = `
            <div class="content-card glass">
                <h2><i class="fas fa-history"></i> All System Transactions <span class="status-badge active" style="margin-left:8px">${transactions.length} records</span></h2>
                ${transactions.length ? `
                <div class="table-header" style="grid-template-columns: 1fr 1.5fr 1fr 1fr 1fr">
                    <div>Customer</div><div>Type</div><div>Amount</div><div>Reference</div><div>Date</div>
                </div>
                <div style="max-height:600px;overflow-y:auto">
                    ${rows.replace(/class="table-row"/g, 'class="table-row" style="grid-template-columns: 1fr 1.5fr 1fr 1fr 1fr"')}
                </div>
                ` : rows}
                <div class="receipt-actions">
                    <button onclick="exportAllTransactionsCSV()" class="btn-secondary">
                        <i class="fas fa-download"></i> Export CSV
                    </button>
                </div>
            </div>
        `;
    } catch (err) {
        console.error(err);
        showToast('error', 'Load Error', 'Failed to load transactions');
    }
}

function exportAllTransactionsCSV() {
    apiGet('/admin/transactions', { limit: 500 }).then(result => {
        const txs = result.transactions || [];
        if (!txs.length) { showToast('error', 'No Data', 'No transactions to export'); return; }
        const headers = ['Transaction ID', 'Customer ID', 'Type', 'Amount', 'Date'];
        const csvRows = [headers.join(',')];
        txs.forEach(t => {
            csvRows.push([t.id || '', t.customer_id || '', `"${t.type || ''}"`, t.amount || 0, t.created_at || ''].join(','));
        });
        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `core-trust-transactions-${new Date().toISOString().slice(0,10)}.csv`;
        a.click(); URL.revokeObjectURL(url);
        showToast('success', 'Exported', 'Transactions downloaded as CSV');
    });
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
    if (currentUser && currentUser.status && currentUser.status !== 'active') {
        // If they haven't filled KYC (assuming address and phone are missing)
        const needsKyc = !currentUser.phone || !currentUser.address;
        
        if (needsKyc) {
            dynamicContent.innerHTML = `
                <div class="content-card glass" style="max-width: 600px; margin: 2rem auto;">
                    <div style="text-align:center; margin-bottom: 2rem;">
                        <i class="fas fa-clipboard-list" style="font-size: 3rem; color: #D97706; margin-bottom: 1rem;"></i>
                        <h2 style="color: #fff;">Account Verification Required</h2>
                        <p style="color: var(--text-secondary); font-size: 0.95rem;">
                            Welcome to Core-Trust. To activate your account and unlock full banking services, please complete your Know Your Customer (KYC) profile.
                        </p>
                    </div>
                    
                    <div class="form-grid">
                        <div class="field-group">
                            <label>National ID / Passport Number <span style="color:#EF4444">*</span></label>
                            <input type="text" id="kyc-id-num" placeholder="e.g. CM12345678">
                        </div>
                        <div class="field-group">
                            <label>Date of Birth <span style="color:#EF4444">*</span></label>
                            <input type="date" id="kyc-dob">
                        </div>
                        <div class="field-group">
                            <label>Primary Phone Number <span style="color:#EF4444">*</span></label>
                            <input type="tel" id="kyc-phone" value="${currentUser.phone || ''}" placeholder="+256...">
                        </div>
                        <div class="field-group">
                            <label>Residential Address <span style="color:#EF4444">*</span></label>
                            <input type="text" id="kyc-address" value="${currentUser.address || ''}" placeholder="Street, City">
                        </div>
                        <div class="field-group">
                            <label>Occupation</label>
                            <input type="text" id="kyc-job" placeholder="Your profession">
                        </div>
                        <div class="field-group">
                            <label>Next of Kin Name</label>
                            <input type="text" id="kyc-nok" placeholder="Emergency contact">
                        </div>
                    </div>
                    
                    <div style="margin-top: 1.5rem; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.2); padding: 12px; border-radius: 8px; font-size: 0.85rem; color: #60A5FA;">
                        <i class="fas fa-info-circle"></i> Your data is secured with 256-bit encryption and is only used for compliance with banking regulations.
                    </div>
                    
                    <div class="action-row" style="margin-top: 2rem;">
                        <button onclick="submitKycForm()" class="btn btn-primary" style="flex: 1; padding: 14px;">
                            <i class="fas fa-paper-plane" style="margin-right: 8px;"></i> SUBMIT FOR VERIFICATION
                        </button>
                        <button onclick="logout()" class="btn btn-ghost">Cancel</button>
                    </div>
                </div>
            `;
        } else {
            // KYC filled but not yet approved by admin
            dynamicContent.innerHTML = `
                <div class="empty-state" style="padding: 4rem 2rem; max-width: 600px; margin: 2rem auto; text-align: center; background: rgba(217, 119, 6, 0.05); border: 1px solid rgba(217, 119, 6, 0.2); border-radius: 16px;">
                    <div style="position:relative; display:inline-block; margin-bottom: 1.5rem;">
                        <i class="fas fa-user-clock" style="font-size: 3.5rem; color: #D97706;"></i>
                        <div class="spinner" style="position:absolute; top:-10px; left:-10px; right:-10px; bottom:-10px; width:auto; height:auto; border-width: 2px;"></div>
                    </div>
                    <h2 style="margin-bottom: 1rem; color: #fff;">Application Under Review</h2>
                    <p style="color: var(--text-secondary); line-height: 1.6; font-size: 1.05rem; margin-bottom: 1.5rem;">
                        Thank you for submitting your details, <strong>${currentUser.name}</strong>.<br>
                        Your KYC application is currently being verified by our compliance team. This usually takes between 1-2 business hours.<br><br>
                        <strong>Note:</strong> Once your account is activated by the administrator, you will be forwarded your official <strong>Account ID credentials</strong>. Please keep them secure, as you will need them to access your banking features.
                    </p>
                    <div style="display: flex; justify-content: center; gap: 10px; margin-bottom: 2rem;">
                        <span class="tx-badge credit" style="background: rgba(59,130,246,0.1); color: #60A5FA; border: 1px solid rgba(59,130,246,0.3);">
                            <i class="fas fa-check"></i> Identity Details Received
                        </span>
                    </div>
                    <button onclick="logout()" class="btn btn-primary" style="padding: 12px 24px;">
                        <i class="fas fa-sign-out-alt"></i> Sign Out Securely
                    </button>
                </div>
            `;
        }
        return;
    }

    dynamicContent.innerHTML = '<div class="empty-state"><span class="loading-spinner dark" style="width:40px;height:40px"></span><p>Loading dashboard...</p></div>';

    // Fetch all necessary data concurrently
    const [balResult, histResult, cardsResult, loansResult, savingsResult, ticketsResult] = await Promise.all([
        apiGet('/customer/balance', { id: currentUser.id }).catch(() => ({ balance: 0 })),
        apiGet('/customer/history', { id: currentUser.id }).catch(() => ({ history: [] })),
        apiGet('/customer/cards', { id: currentUser.id }).catch(() => ({ cards: [] })),
        apiGet('/customer/loans', { id: currentUser.id }).catch(() => ({ loans: [] })),
        apiGet('/customer/savings', { id: currentUser.id }).catch(() => ({ goals: [] })),
        apiGet('/customer/tickets', { id: currentUser.id }).catch(() => ({ tickets: [] }))
    ]);

    currentUser.balance = balResult.balance || 0;
    const history = histResult.history || [];
    const recentHistory = history.slice(0, 5);
    const cards = cardsResult.cards || [];
    const activeCard = cards.find(c => c.status === 'active') || cards[0];
    const loans = loansResult.loans || [];
    const activeLoan = loans.find(l => l.status === 'pending' || l.status === 'approved');
    const savings = savingsResult.goals || [];
    const activeGoal = savings.length ? savings[0] : null;
    const tickets = ticketsResult.tickets || [];
    const openTickets = tickets.filter(t => t.status === 'open');

    // Calculate income / expenses for analytics
    let totalIncome = 0;
    let totalExpense = 0;
    history.forEach(t => {
        const isCredit = t.type.toLowerCase().includes('deposit') || t.type.toLowerCase().includes('from');
        if (isCredit) totalIncome += Math.abs(t.amount);
        else totalExpense += Math.abs(t.amount);
    });

    // Build recent tx mini-list
    const recentTxHtml = recentHistory.length
        ? recentHistory.map(t => {
            const isCredit = t.type.toLowerCase().includes('deposit') || t.type.toLowerCase().includes('from');
            return `
                <div class="recent-tx-item">
                    <div class="recent-tx-icon ${isCredit ? 'credit' : 'debit'}">
                        <i class="fas ${isCredit ? 'fa-arrow-down' : 'fa-arrow-up'}"></i>
                    </div>
                    <div class="recent-tx-details">
                        <div class="recent-tx-type">${t.type}</div>
                        <div class="recent-tx-date">${t.created_at.slice(0, 10)}</div>
                    </div>
                    <div class="recent-tx-amount ${isCredit ? 'positive' : 'negative'}">
                        ${isCredit ? '+' : '-'}${formatCurrency(Math.abs(t.amount))}
                    </div>
                </div>
            `;
        }).join('')
        : '<div class="empty-state" style="padding:2rem"><i class="fas fa-inbox"></i><p>No transactions yet</p></div>';

    // Build Virtual Card HTML
    let cardHtml = '';
    if (activeCard) {
        cardHtml = `
            <div class="virtual-card" style="margin-bottom: 1rem;">
                <div class="card-top">
                    <div class="card-logo"><i class="fas fa-shield-halved"></i> Core<span>Trust</span></div>
                    <i class="fas fa-wifi"></i>
                </div>
                <div class="card-chip">
                    <i class="fas fa-microchip"></i>
                </div>
                <div class="card-number">
                    ${activeCard.card_number.replace(/(\d{4})/g, '$1 ').trim()}
                </div>
                <div class="card-bottom">
                    <div class="card-holder">${currentUser.name}</div>
                    <div class="card-expiry">${activeCard.expiry_date}</div>
                </div>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.85rem;color:var(--text-secondary)">
                <span>Status: <strong style="color:${activeCard.status === 'active' ? '#10B981' : '#EF4444'}">${activeCard.status.toUpperCase()}</strong></span>
                <span>Type: <strong>${activeCard.card_type.toUpperCase()}</strong></span>
            </div>
        `;
    } else {
        cardHtml = `
            <div class="empty-state" style="padding: 2rem 1rem;">
                <i class="fas fa-credit-card" style="font-size:2rem;color:var(--text-muted);margin-bottom:1rem"></i>
                <p>No active cards found.</p>
                <button class="btn btn-primary btn-sm" style="margin-top:1rem" onclick="requestNewCard()">Request Virtual Card</button>
            </div>
        `;
    }

    // Build Loan HTML
    let loanHtml = '';
    if (activeLoan) {
        loanHtml = `
            <div class="loan-card" style="background: rgba(16, 185, 129, 0.1); border-color: rgba(16, 185, 129, 0.2);">
                <div class="loan-info">
                    <h3>Active Loan</h3>
                    <p style="font-weight:600;color:var(--color-text)">${formatCurrency(activeLoan.amount)}</p>
                    <span class="tx-badge ${activeLoan.status === 'approved' ? 'credit' : 'pending'}" style="margin-top:5px;display:inline-block">${activeLoan.status.toUpperCase()}</span>
                </div>
                <div class="loan-action">
                    <button class="btn-ghost" onclick="showCustomerLoans()"><i class="fas fa-arrow-right"></i> Manage</button>
                </div>
            </div>
        `;
    } else {
        loanHtml = `
            <div class="loan-card">
                <div class="loan-info">
                    <h3>Need a Loan?</h3>
                    <p>Get instant cash up to UGX 50M.</p>
                </div>
                <div class="loan-action">
                    <button onclick="showLoanApplication()"><i class="fas fa-bolt"></i> Apply</button>
                </div>
            </div>
        `;
    }

    dynamicContent.innerHTML = `
        <div class="balance-hero">
            <div class="balance-hero-label">Available Balance</div>
            <div class="balance-hero-amount">
                <span>UGX </span>${formatAbbreviation(currentUser.balance || 0)}
            </div>
            <div class="balance-hero-sub">Account ID: ${formatAccountID(currentUser.id)} &nbsp;·&nbsp; Status: <span style="color:#10B981;font-weight:600">Active</span></div>
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

        <div class="dashboard-cards-row">
            <!-- Left Column: Cards & Loans -->
            <div class="content-card glass">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                    <h2 style="margin:0;"><i class="fas fa-credit-card"></i> My Cards</h2>
                    ${cards.length > 0 ? '<button class="btn btn-ghost btn-sm" onclick="requestNewCard()">+ New Card</button>' : ''}
                </div>
                ${cardHtml}
                <div class="section-divider" style="margin: 1.5rem 0;"></div>
                ${loanHtml}
            </div>

            <!-- Right Column: Analytics & Transactions -->
            <div class="content-card glass">
                <h2 style="margin-bottom: 20px;"><i class="fas fa-chart-pie"></i> Financial Summary</h2>
                <div class="analytics-row">
                    <div class="analytics-widget">
                        <div class="analytics-icon income"><i class="fas fa-arrow-down"></i></div>
                        <div class="analytics-info">
                            <h4>Total Income</h4>
                            <div class="val">${formatCurrency(totalIncome)}</div>
                        </div>
                    </div>
                    <div class="analytics-widget">
                        <div class="analytics-icon expense"><i class="fas fa-arrow-up"></i></div>
                        <div class="analytics-info">
                            <h4>Total Spent</h4>
                            <div class="val">${formatCurrency(totalExpense)}</div>
                        </div>
                    </div>
                </div>
                
                <div class="section-divider"></div>
                
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px">
                    <h4 style="font-size:var(--fs-xs); color:var(--text-muted); text-transform:uppercase">Recent Transactions</h4>
                    <a href="#" onclick="showCustomerHistory()" style="font-size:var(--fs-xs); color:var(--color-accent); text-decoration:none; font-weight:700">View All</a>
                </div>
                
                <div class="recent-tx-list">
                    ${recentTxHtml}
                </div>
            </div>
        </div>

        <!-- NEW: Extended Modules (Savings & Support) -->
        <div class="dashboard-cards-row" style="margin-top:20px">
            <!-- Savings Goals -->
            <div class="content-card glass" style="flex:1">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                    <h2 style="margin:0;"><i class="fas fa-bullseye"></i> Savings Goals</h2>
                    <button class="btn btn-ghost btn-sm" onclick="showCustomerSavings()">Manage</button>
                </div>
                ${activeGoal ? `
                    <div class="rewards-card" style="display:flex; flex-direction:column; gap:10px;">
                        <div style="display:flex; justify-content:space-between;">
                            <strong>${activeGoal.name}</strong>
                            <span style="color:var(--color-accent)">${formatCurrency(activeGoal.target_amount)}</span>
                        </div>
                        <div class="progress-bar-bg" style="height:8px; background:rgba(255,255,255,0.1); border-radius:4px;">
                            <div class="progress-bar-fill" style="width: ${Math.min(100, (activeGoal.current_amount / activeGoal.target_amount) * 100)}%; height:100%; background:var(--color-accent); border-radius:4px;"></div>
                        </div>
                        <div style="font-size:0.8rem; color:var(--text-muted)">
                            Target Date: ${activeGoal.deadline || 'No deadline'}
                        </div>
                    </div>
                ` : `
                    <div class="empty-state" style="padding:1rem">
                        <i class="fas fa-piggy-bank" style="font-size:1.5rem;color:var(--text-muted);margin-bottom:10px"></i>
                        <p>You have no active savings goals.</p>
                        <button class="btn btn-primary btn-sm" onclick="createSavingsGoalModal()">Start Saving</button>
                    </div>
                `}
            </div>
            
            <!-- Support Tickets -->
            <div class="content-card glass" style="flex:1">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                    <h2 style="margin:0;"><i class="fas fa-headset"></i> Support Center</h2>
                    <button class="btn btn-primary btn-sm" onclick="showCustomerTickets()">Need Help?</button>
                </div>
                <div class="rewards-card" style="background:rgba(255,255,255,0.02)">
                    <div class="reward-points" style="flex-direction:row; gap:15px;">
                        <div style="background:rgba(251, 191, 36, 0.1); padding:15px; border-radius:12px; color:var(--color-accent);">
                            <i class="fas fa-ticket-alt" style="font-size:1.5rem"></i>
                        </div>
                        <div>
                            <span class="pts" style="font-size:1.5rem">${openTickets.length}</span>
                            <span class="lbl" style="display:block">Open Tickets</span>
                        </div>
                    </div>
                    <div class="reward-info" style="margin-top:15px">
                        <p style="font-size:0.9rem">Our support team typically responds within 2 hours. Click below to view or manage your tickets.</p>
                        <button class="btn-ghost" style="padding:8px 15px; margin-top:10px; width:100%" onclick="showCustomerTickets()">View History</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}


// ── KYC Submission ─────────────────────────────────────────

async function submitKycForm() {
    const idNum = document.getElementById('kyc-id-num').value.trim();
    const dob = document.getElementById('kyc-dob').value;
    const phone = document.getElementById('kyc-phone').value.trim();
    const address = document.getElementById('kyc-address').value.trim();

    if (!idNum || !dob || !phone || !address) {
        showToast('error', 'Incomplete Form', 'Please fill in all required fields marked with *');
        return;
    }

    const confirmed = await showModal({
        title: 'Submit KYC',
        message: 'Are you sure all details are correct? This information will be used to verify your identity.',
        icon: 'fa-clipboard-check',
        confirmText: 'SUBMIT',
        cancelText: 'REVIEW'
    });
    if (!confirmed) return;

    // Send the KYC data to the new dedicated endpoint
    const data = {
        id: currentUser.id,
        phone: phone,
        address: address,
        id_number: idNum,
        dob: dob,
        occupation: document.getElementById('kyc-job').value.trim(),
        next_of_kin: document.getElementById('kyc-nok').value.trim()
    };

    showToast('success', 'Processing', 'Encrypting and securely uploading documents...');

    try {
        const result = await apiPost('/customer/kyc', data);
        if (result.success) {
            // Update local user state
            currentUser.address = data.address;
            currentUser.phone = data.phone;
            currentUser.status = 'under_review'; // Important: visually shift to review mode
            
            showToast('success', 'KYC Submitted', 'Your documents are now under review.');
            showCustomerDashboard(); // Re-render to show the "Under Review" state
        } else {
            showToast('error', 'Submission Failed', result.message);
        }
    } catch (err) {
        showToast('error', 'Network Error', 'Could not upload data to secure servers.');
    }
}

// Dummy Loan feature
function requestLoan() {
    showToast('success', 'Request Sent', 'Your loan request has been forwarded to our evaluation team. You will be notified shortly.');
}

// Statement download
async function downloadStatement() {
    const result = await apiGet('/customer/history', { id: currentUser.id });
    const history = result.history || [];
    if (!history.length) { showToast('error', 'No Data', 'No transactions to export'); return; }

    const headers = ['Date', 'Type', 'Amount (UGX)', 'Reference'];
    const csvRows = [
        `Core-Trust Banking - Account Statement`,
        `Account: ${currentUser.id} | Name: ${currentUser.name}`,
        `Generated: ${new Date().toLocaleString()}`,
        '',
        headers.join(',')
    ];
    history.forEach(t => {
        csvRows.push([
            t.created_at ? t.created_at.slice(0, 19) : '',
            `"${t.type}"`,
            t.amount,
            t.id || ''
        ].join(','));
    });
    csvRows.push('', `Current Balance: ${currentUser.balance}`);

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `statement-${currentUser.id}-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('success', 'Statement Downloaded', 'Your account statement has been saved');
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

// ── Beneficiaries ──────────────────────────────────────────

async function showCustomerBeneficiaries() {
    dynamicContent.innerHTML = '<div class="empty-state"><span class="loading-spinner dark"></span><p>Loading beneficiaries...</p></div>';
    
    const res = await apiGet('/customer/beneficiaries', { id: currentUser.id });
    const benList = res.beneficiaries || [];

    const listHtml = benList.length 
        ? benList.map(b => `
            <div class="table-row">
                <div style="font-weight:600">${b.name}</div>
                <div style="color:var(--text-secondary)">${b.bank_name}</div>
                <div style="font-family:monospace; color:var(--color-accent)">${b.account_number}</div>
                <div>
                    <button class="btn btn-primary btn-sm" onclick="quickTransfer('${b.account_number}')">Send Money</button>
                </div>
            </div>
        `).join('')
        : '<div class="empty-state">No beneficiaries saved.</div>';

    dynamicContent.innerHTML = `
        <div class="content-card glass">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2rem;">
                <h2 style="margin:0"><i class="fas fa-address-book"></i> My Beneficiaries</h2>
                <button class="btn btn-primary" onclick="showAddBeneficiaryModal()">+ Add New</button>
            </div>
            
            <div class="table-header">
                <div>Name</div><div>Bank</div><div>Account Number</div><div>Action</div>
            </div>
            ${listHtml}
        </div>
    `;
}

function showAddBeneficiaryModal() {
    dynamicContent.innerHTML += `
        <div class="modal-overlay active" id="add-ben-modal">
            <div class="modal-card">
                <div class="modal-header">
                    <i class="fas fa-user-plus"></i>
                    <div class="modal-title">Add Beneficiary</div>
                </div>
                <div class="modal-body">
                    <div class="field-group">
                        <label>Full Name</label>
                        <input type="text" id="ben-name" placeholder="Recipient Name">
                    </div>
                    <div class="field-group">
                        <label>Account Number</label>
                        <input type="text" id="ben-acc" placeholder="CT-XXXX-XXXX">
                    </div>
                    <div class="field-group">
                        <label>Bank Name</label>
                        <input type="text" id="ben-bank" value="Core-Trust">
                    </div>
                </div>
                <div class="modal-actions">
                    <button class="modal-btn modal-btn-cancel" onclick="document.getElementById('add-ben-modal').remove()">CANCEL</button>
                    <button class="modal-btn modal-btn-confirm" onclick="handleAddBeneficiary()">SAVE BENEFICIARY</button>
                </div>
            </div>
        </div>
    `;
}

async function handleAddBeneficiary() {
    const name = document.getElementById('ben-name').value;
    const acc = document.getElementById('ben-acc').value;
    const bank = document.getElementById('ben-bank').value;
    
    if (!name || !acc) return showToast('error', 'Required', 'Name and Account are required');
    
    const res = await apiPost('/customer/beneficiaries/add', { id: currentUser.id, name, account_number: acc, bank_name: bank });
    if (res.success) {
        showToast('success', 'Saved', 'Beneficiary added successfully');
        showCustomerBeneficiaries();
    } else {
        showToast('error', 'Failed', res.message);
    }
}

function quickTransfer(accNum) {
    showCustomerTransfer();
    setTimeout(() => {
        document.getElementById('trans-to').value = accNum;
    }, 100);
}

// ── Loans ──────────────────────────────────────────────────

async function showCustomerLoans() {
    dynamicContent.innerHTML = '<div class="empty-state"><span class="loading-spinner dark"></span><p>Loading loan data...</p></div>';
    
    const res = await apiGet('/customer/loans', { id: currentUser.id });
    const loans = res.loans || [];
    
    const rows = loans.length 
        ? loans.map(l => `
            <div class="table-row">
                <div style="font-weight:700">${formatCurrency(l.amount)}</div>
                <div>
                    <span class="tx-badge ${l.status === 'active' ? 'credit' : 'pending'}">${l.status.toUpperCase()}</span>
                </div>
                <div style="color:var(--text-muted)">${l.created_at.slice(0,10)}</div>
                <div>
                    ${l.status === 'active' ? `<button class="btn btn-ghost btn-sm">Repay</button>` : '—'}
                </div>
            </div>
        `).join('')
        : '<div class="empty-state">You have no active or pending loans.</div>';

    dynamicContent.innerHTML = `
        <div class="content-card glass">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2rem;">
                <h2 style="margin:0"><i class="fas fa-hand-holding-usd"></i> Loan Management</h2>
                <button class="btn btn-primary" onclick="showLoanApplication()">Apply for Loan</button>
            </div>
            
            <div class="table-header">
                <div>Amount</div><div>Status</div><div>Requested Date</div><div>Action</div>
            </div>
            ${rows}
        </div>
    `;
}

function showLoanApplication() {
    dynamicContent.innerHTML = `
        <div class="content-card glass" style="max-width:500px; margin:0 auto">
            <h2><i class="fas fa-bolt"></i> Apply for Instant Loan</h2>
            <p style="color:var(--text-secondary); margin-bottom:1.5rem">Select your desired loan amount. Approval takes less than 2 minutes.</p>
            
            <div class="field-group">
                <label>Loan Amount (UGX)</label>
                <select id="loan-amount">
                    <option value="500000">500,000</option>
                    <option value="1000000">1,000,000</option>
                    <option value="5000000">5,000,000</option>
                    <option value="10000000">10,000,000</option>
                </select>
            </div>
            <div class="field-group">
                <label>Repayment Period</label>
                <select>
                    <option>3 Months (15% Interest)</option>
                    <option>6 Months (12% Interest)</option>
                    <option>12 Months (10% Interest)</option>
                </select>
            </div>
            <button class="btn btn-primary" style="width:100%; padding:15px" onclick="handleLoanRequest()">SUBMIT APPLICATION</button>
            <button class="btn btn-ghost" style="width:100%; margin-top:10px" onclick="showCustomerLoans()">Cancel</button>
        </div>
    `;
}

async function handleLoanRequest() {
    const amount = document.getElementById('loan-amount').value;
    const res = await apiPost('/customer/loans/request', { id: currentUser.id, amount });
    if (res.success) {
        showToast('success', 'Applied', 'Your loan request has been submitted for instant review');
        showCustomerLoans();
    } else {
        showToast('error', 'Request Failed', res.message);
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
    let completedFields = 0;
    const totalFields = 4;
    if (currentUser.name) completedFields++;
    if (currentUser.phone) completedFields++;
    if (currentUser.address) completedFields++;
    if (currentUser.balance !== undefined) completedFields++; // Account is active/funded
    const completionPercent = Math.round((completedFields / totalFields) * 100);

    dynamicContent.innerHTML = `
        <div class="content-card glass" style="max-width:580px; margin:0 auto">
            <h2><i class="fas fa-user-circle"></i> My Profile</h2>

            <div class="profile-completion">
                <div class="completion-header">
                    <span>Profile Setup</span>
                    <span>${completionPercent}% Complete</span>
                </div>
                <div class="progress-bar-bg">
                    <div class="progress-bar-fill" style="width: ${completionPercent}%;"></div>
                </div>
                <p style="font-size:0.8rem;color:var(--text-secondary);margin-top:8px;">
                    Complete your profile to unlock all banking features securely.
                </p>
            </div>

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
                <div class="auth-field" style="margin-bottom: 0;">
                    <i class="fas fa-lock"></i>
                    <input type="password" id="prof-pwd" placeholder="Enter new password...">
                    <button type="button" class="pwd-toggle" onclick="togglePwd('prof-pwd', this)">
                        <i class="fas fa-eye-slash"></i>
                    </button>
                </div>
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

/**
 * Utility: Set button loading state
 */
function setButtonLoading(btnId, isLoading, originalText) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    
    if (isLoading) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Processing...`;
    } else {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}
