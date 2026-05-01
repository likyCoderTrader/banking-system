"""
server.py — Core-Trust Banking API Server
==========================================
This module is the main Flask backend that exposes all REST API endpoints
for the banking portal. It handles authentication, customer operations, and
admin operations by delegating to the appropriate logic modules.

Usage:
    python backend/server.py          # Development mode
    FLASK_ENV=production python ...   # Production mode (uses Waitress)

Author: Core-Trust Team
"""

import os
import sys
import logging
from datetime import datetime
from functools import wraps
import time
import re

# ---------------------------------------------------------------------------
# Path Setup
# ---------------------------------------------------------------------------
# Add the backend directory to sys.path so Python can find the local modules
# (supabase_client, banking_logic, admin_logic) regardless of where the
# script is launched from.
backend_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, backend_dir)

# ---------------------------------------------------------------------------
# Imports
# ---------------------------------------------------------------------------
from flask import Flask, request, jsonify, g
from flask_cors import CORS
from supabase_client import SupabaseService
import banking_logic
import admin_logic
import bcrypt

# ---------------------------------------------------------------------------
# Logging Configuration
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('banking.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Rate Limiting
# ---------------------------------------------------------------------------
class RateLimiter:
    """Simple in-memory rate limiter."""
    def __init__(self):
        self.requests = {}
        self.window = 60  # seconds
        self.max_requests = 30  # max requests per window
    
    def is_allowed(self, key):
        now = time.time()
        if key not in self.requests:
            self.requests[key] = []
        
        # Clean old requests
        self.requests[key] = [t for t in self.requests[key] if now - t < self.window]
        
        if len(self.requests[key]) >= self.max_requests:
            return False
        
        self.requests[key].append(now)
        return True

rate_limiter = RateLimiter()

def rate_limit(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        client_ip = request.remote_addr
        if not rate_limiter.is_allowed(client_ip):
            logger.warning(f"Rate limit exceeded for IP: {client_ip}")
            return jsonify({"success": False, "message": "Too many requests. Please try again later."}), 429
        return f(*args, **kwargs)
    return decorated_function

# ---------------------------------------------------------------------------
# Input Validation
# ---------------------------------------------------------------------------
def sanitize_input(data, fields):
    """Sanitize input fields to prevent XSS and injection attacks."""
    sanitized = {}
    for field in fields:
        if field in data and data[field]:
            value = str(data[field]).strip()
            # Remove potential HTML/JS tags
            value = re.sub(r'<[^>]*>', '', value)
            # Escape special characters
            value = value.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            sanitized[field] = value
    return sanitized

def validate_id_format(uid):
    """Validate ID format (alphanumeric and underscores only)."""
    return bool(re.match(r'^[a-zA-Z0-9_]+$', str(uid)))

def validate_phone(phone):
    """Validate phone number format."""
    return bool(re.match(r'^\+?[0-9\-\s]{7,15}$', str(phone)))

# ---------------------------------------------------------------------------
# App Initialization
# ---------------------------------------------------------------------------
app = Flask(__name__)

# Allow the frontend (served on port 8000) to call the API (port 5000)
# without browser CORS blocking.
CORS(app)

# Create a single shared database service instance for all endpoints
db = SupabaseService()


# ===========================================================================
# AUTH ENDPOINTS
# ===========================================================================

@app.route('/api/login', methods=['POST'])
@rate_limit
def login():
    """
    POST /api/login
    Authenticates an Admin or Customer.

    Request Body (JSON):
        {
          "id":       str,   -- User ID (e.g., "admin" or "1001")
          "password": str,   -- Plain-text password entered by the user
          "mode":     str    -- "admin" or "customer"
        }

    Response (JSON):
        Success → { "success": true,  "user": { ...user_record... } }
        Failure → { "success": false, "message": "Invalid credentials" }

    Authentication Flow:
        1. Fetch the user record from Supabase by ID only.
        2. Compare the submitted password against the stored hash using bcrypt.
        3. Fall back to plain-text comparison for legacy accounts.
    """
    data = request.json
    if not data:
        return jsonify({"success": False, "message": "No data received"}), 400

    uid  = data.get('id')
    pwd  = data.get('password')
    mode = data.get('mode')   # 'admin' or 'customer'

    # Validate ID format (if it's not an email)
    if '@' not in uid and not validate_id_format(uid):
        logger.warning(f"Invalid ID format attempted: {uid}")
        return jsonify({"success": False, "message": "Invalid credentials"}), 401

    # Log authentication attempt
    logger.info(f"Login attempt: mode={mode}, id={uid}, ip={request.remote_addr}")

    # Step 1: Fetch user record (by ID only — no password sent to DB)
    result = db.verify_admin(uid) if mode == 'admin' else db.verify_customer(uid)

    if result:
        stored_hash = result.get('password')
        if stored_hash:
            # Step 2: Try bcrypt comparison (for hashed passwords)
            try:
                if bcrypt.checkpw(pwd.encode('utf-8'), stored_hash.encode('utf-8')):
                    logger.info(f"Successful login: {uid}, ip={request.remote_addr}")
                    return jsonify({"success": True, "user": result})
            except Exception:
                pass
            # Step 3: Plain-text fallback (for legacy/seeded accounts)
            if pwd == stored_hash:
                logger.info(f"Successful login (legacy): {uid}, ip={request.remote_addr}")
                return jsonify({"success": True, "user": result})

    logger.warning(f"Failed login attempt: {uid}, ip={request.remote_addr}")
    return jsonify({"success": False, "message": "Invalid credentials"}), 401


# ===========================================================================
# CUSTOMER ENDPOINTS
# ===========================================================================

@app.route('/api/customer/balance', methods=['GET'])
@rate_limit
def get_balance():
    """
    GET /api/customer/balance?id=<customer_id>
    Returns the current account balance for the given customer.

    Query Params:
        id (str) — Customer account ID

    Response:
        { "balance": float }
    """
    cid = request.args.get('id')
    if not validate_id_format(cid):
        return jsonify({"balance": 0}), 400
    balance = db.get_customer_balance(cid)
    return jsonify({"balance": balance})


@app.route('/api/customer/deposit', methods=['POST'])
@rate_limit
def deposit():
    """
    POST /api/customer/deposit
    Processes a deposit into the customer's account.

    Request Body (JSON):
        { "id": str, "amount": str }

    Response:
        { "success": bool, "message": str }
    """
    data = request.json
    cid = data.get('id')
    amount = data.get('amount')
    
    # Validate inputs
    if not validate_id_format(cid):
        return jsonify({"success": False, "message": "Invalid account ID"}), 400
    
    logger.info(f"Deposit: id={cid}, amount={amount}, ip={request.remote_addr}")
    success, message = banking_logic.process_deposit(db, cid, amount)
    return jsonify({"success": success, "message": message})


@app.route('/api/customer/withdraw', methods=['POST'])
@rate_limit
def withdraw():
    """
    POST /api/customer/withdraw
    Processes a withdrawal from the customer's account.
    Validates sufficient funds before executing.

    Request Body (JSON):
        { "id": str, "amount": str }

    Response:
        { "success": bool, "message": str }
    """
    data = request.json
    cid = data.get('id')
    amount = data.get('amount')
    
    # Validate inputs
    if not validate_id_format(cid):
        return jsonify({"success": False, "message": "Invalid account ID"}), 400
    
    logger.info(f"Withdrawal: id={cid}, amount={amount}, ip={request.remote_addr}")
    current_bal = db.get_customer_balance(cid)
    success, message = banking_logic.process_withdrawal(db, cid, amount, current_bal)
    return jsonify({"success": success, "message": message})


@app.route('/api/customer/history', methods=['GET'])
@rate_limit
def get_history():
    """
    GET /api/customer/history?id=<customer_id>
    Returns a list of all transactions for the customer (newest first).

    Response:
        { "history": [ { ...transaction... }, ... ] }
    """
    cid = request.args.get('id')
    if not validate_id_format(cid):
        return jsonify({"history": []}), 400
    history = db.get_transaction_history(cid)
    return jsonify({"history": history})


@app.route('/api/customer/transfer', methods=['POST'])
@rate_limit
def transfer():
    """
    POST /api/customer/transfer
    Transfers funds from one customer account to another.

    Request Body (JSON):
        { "from_id": str, "to_id": str, "amount": str }

    Response:
        { "success": bool, "message": str }
    """
    data = request.json
    from_id = data.get('from_id')
    to_id = data.get('to_id')
    amount = data.get('amount')
    
    # Validate inputs
    if not validate_id_format(from_id) or not validate_id_format(to_id):
        return jsonify({"success": False, "message": "Invalid account ID"}), 400
    
    logger.info(f"Transfer: from={from_id}, to={to_id}, amount={amount}, ip={request.remote_addr}")
    success, message = banking_logic.process_transfer(db, from_id, to_id, amount)
    return jsonify({"success": success, "message": message})


@app.route('/api/customer/profile', methods=['POST'])
@rate_limit
def update_profile():
    """
    POST /api/customer/profile
    Updates a customer's personal details. If a new password is provided,
    it is hashed with bcrypt before being stored.

    Request Body (JSON):
        { "id": str, "name": str, "address": str, "phone": str, "password": str }

    Response:
        { "success": bool, "message": str }
    """
    data = request.json
    cid = data.get('id')

    # Validate ID format
    if not validate_id_format(cid):
        return jsonify({"success": False, "message": "Invalid account ID"}), 400
    
    # Validate phone if provided
    phone = data.get("phone")
    if phone and not validate_phone(phone):
        return jsonify({"success": False, "message": "Invalid phone number format"}), 400

    # Build the update payload (only include non-sensitive fields here)
    profile_data = {
        "name":    data.get("name"),
        "address": data.get("address"),
        "phone":   data.get("phone")
    }

    # If a new password was provided, hash it before saving
    new_pwd = data.get("password")
    if new_pwd and str(new_pwd).strip():
        profile_data["password"] = bcrypt.hashpw(
            new_pwd.encode('utf-8'), bcrypt.gensalt()
        ).decode('utf-8')

    logger.info(f"Profile update: id={cid}, ip={request.remote_addr}")
    success = db.update_customer_profile(cid, profile_data)
    return jsonify({
        "success": success,
        "message": "Profile updated successfully" if success else "Update failed"
    })

@app.route('/api/customer/kyc', methods=['POST'])
@rate_limit
def submit_kyc():
    """
    POST /api/customer/kyc
    Submits KYC details and moves customer status from 'pending' to 'under_review'.
    """
    data = request.json
    cid = data.get('id')
    
    if not validate_id_format(cid):
        return jsonify({"success": False, "message": "Invalid account ID"}), 400

    # We update the phone and address, and simulate saving the rest.
    # The most important part is changing the status to 'under_review'.
    profile_data = {
        "phone": data.get("phone"),
        "address": data.get("address"),
        "id_number": data.get("id_number"),
        "dob": data.get("dob"),
        "occupation": data.get("occupation"),
        "next_of_kin": data.get("next_of_kin")
    }
    
    # 1. Update basic profile fields
    db.update_customer_profile(cid, profile_data)
    
    # 2. Update status to under_review
    success = db.update_customer_status(cid, 'under_review')
    
    logger.info(f"KYC Submitted for id={cid}, ip={request.remote_addr}")
    return jsonify({
        "success": success,
        "message": "KYC submitted successfully" if success else "Failed to submit KYC"
    })


@app.route('/api/customer/cards', methods=['GET'])
@rate_limit
def get_customer_cards():
    cid = request.args.get('id')
    if not cid:
        return jsonify({"success": False, "message": "Missing ID"}), 400
    try:
        cards = db.client.table("cards").select("*").eq("customer_id", cid).execute().data
        return jsonify({"success": True, "cards": cards})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/customer/cards/create', methods=['POST'])
@rate_limit
def create_customer_card():
    data = request.json
    cid = data.get('id')
    card_type = data.get('card_type', 'Virtual')
    if not cid:
        return jsonify({"success": False, "message": "Missing ID"}), 400
    try:
        # Mock card details
        card_num = f"4{str(int(time.time()))[-15:]}"
        db.client.table("cards").insert({
            "customer_id": cid,
            "card_number": card_num,
            "card_type": card_type,
            "expiry_date": "12/28",
            "cvv": "123",
            "status": "active"
        }).execute()
        return jsonify({"success": True, "message": "Card created successfully"})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/customer/tickets', methods=['GET', 'POST'])
@rate_limit
def customer_tickets():
    if request.method == 'GET':
        cid = request.args.get('id')
        if not cid:
            return jsonify({"success": False, "message": "Missing ID"}), 400
        try:
            tickets = db.client.table("support_tickets").select("*").eq("customer_id", cid).order("created_at", desc=True).execute().data
            return jsonify({"success": True, "tickets": tickets})
        except Exception as e:
            return jsonify({"success": False, "message": str(e)}), 500
    else:
        data = request.json
        cid = data.get('id')
        subject = data.get('subject')
        desc = data.get('description')
        if not cid or not subject or not desc:
            return jsonify({"success": False, "message": "Missing data"}), 400
        try:
            db.client.table("support_tickets").insert({
                "customer_id": cid,
                "subject": subject,
                "description": desc,
                "status": "open"
            }).execute()
            return jsonify({"success": True, "message": "Support ticket submitted"})
        except Exception as e:
            return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/customer/savings', methods=['GET', 'POST'])
@rate_limit
def customer_savings():
    if request.method == 'GET':
        cid = request.args.get('id')
        if not cid:
            return jsonify({"success": False, "message": "Missing ID"}), 400
        try:
            goals = db.client.table("savings_goals").select("*").eq("customer_id", cid).execute().data
            return jsonify({"success": True, "goals": goals})
        except Exception as e:
            return jsonify({"success": False, "message": str(e)}), 500
    else:
        data = request.json
        cid = data.get('id')
        name = data.get('name')
        target = data.get('target_amount')
        if not cid or not name or not target:
            return jsonify({"success": False, "message": "Missing data"}), 400
        try:
            db.client.table("savings_goals").insert({
                "customer_id": cid,
                "name": name,
                "target_amount": float(target),
                "current_amount": 0,
                "deadline": data.get('deadline')
            }).execute()
            return jsonify({"success": True, "message": "Savings goal created"})
        except Exception as e:
            return jsonify({"success": False, "message": str(e)}), 500

# ===========================================================================
# SELF-REGISTRATION
# ===========================================================================

@app.route('/api/register', methods=['POST'])
@rate_limit
def register_customer():
    """
    POST /api/register
    Public self-registration for new customers.
    Auto-generates an account ID.

    Request Body (JSON):
        { "name", "email", "phone", "address", "occupation", "password" }

    Response:
        { "success": bool, "message": str, "id": str }
    """
    data = request.json
    name = (data.get('name') or '').strip()
    email = (data.get('email') or '').strip()
    password = data.get('password', '')
    phone = (data.get('phone') or '').strip()
    address = (data.get('address') or '').strip()
    occupation = (data.get('occupation') or '').strip()

    if not name or not password or not email:
        return jsonify({"success": False, "message": "Name, email, and password are required"}), 400

    if '@' not in email:
        return jsonify({"success": False, "message": "Invalid email format"}), 400

    if len(password) < 4:
        return jsonify({"success": False, "message": "Password must be at least 4 characters"}), 400

    if phone and not validate_phone(phone):
        return jsonify({"success": False, "message": "Invalid phone number format"}), 400

    # Check if email already exists
    existing = db.verify_customer(email)
    if existing:
        return jsonify({"success": False, "message": "An account with this email already exists"}), 400

    # Auto-generate next available ID
    try:
        customers = db.get_all_customers()
        if customers:
            # Filter for numeric IDs and find max
            numeric_ids = [int(c['id']) for c in customers if str(c.get('id', '')).isdigit()]
            new_id = str(max(numeric_ids) + 1) if numeric_ids else "1001"
        else:
            new_id = "1001"
    except Exception:
        new_id = str(int(time.time()) % 100000)

    hashed_pwd = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    customer_data = {
        "id": new_id,
        "name": name,
        "email": email,
        "phone": phone,
        "address": address,
        "occupation": occupation,
        "password": hashed_pwd,
        "balance": 0,
        "status": "pending",
        "auth_provider": "local"
    }

    success = db.create_customer(customer_data)
    if success:
        logger.info(f"Self-registration: id={new_id}, name={name}, ip={request.remote_addr}")
        return jsonify({
            "success": True,
            "message": f"Account created successfully. Your Account ID is: {new_id}",
            "id": new_id
        })
    else:
        return jsonify({"success": False, "message": "Registration failed. Please try again."}), 500

@app.route('/api/auth/google', methods=['POST'])
@rate_limit
def auth_google():
    """
    POST /api/auth/google
    Handles Google Authentication (Login/Signup).
    """
    data = request.json
    google_id = data.get('google_id')
    email = data.get('email')
    name = data.get('name')
    avatar = data.get('avatar_url')

    if not google_id or not email:
        return jsonify({"success": False, "message": "Google Authentication failed: Missing data"}), 400

    # 1. Check if user already exists by google_id
    user = db.find_by_google_id(google_id)
    
    if not user:
        # 2. Check if user exists by email (link accounts)
        user = db.verify_customer(email)
        if user:
            # Update existing user with google_id
            db.update_customer_profile(user['id'], {"google_id": google_id, "auth_provider": "google"})
            user['google_id'] = google_id
            user['auth_provider'] = "google"
        else:
            # 3. Create new user via Google
            try:
                customers = db.get_all_customers()
                numeric_ids = [int(c['id']) for c in customers if str(c.get('id', '')).isdigit()]
                new_id = str(max(numeric_ids) + 1) if numeric_ids else "1001"
            except Exception:
                new_id = str(int(time.time()) % 100000)

            user_data = {
                "id": new_id,
                "name": name,
                "email": email,
                "google_id": google_id,
                "avatar_url": avatar,
                "auth_provider": "google",
                "balance": 0,
                "status": "active" # Auto-activate social logins for convenience
            }
            if db.create_customer(user_data):
                user = user_data
            else:
                return jsonify({"success": False, "message": "Failed to create account via Google"}), 500

    return jsonify({"success": True, "user": user})


# ===========================================================================
# ADMIN ENDPOINTS
# ===========================================================================

@app.route('/api/admin/check', methods=['GET'])
@rate_limit
def admin_check():
    """
    GET /api/admin/check?email=<email>
    Checks if an email belongs to an admin user.
    """
    email = request.args.get('email')
    if not email:
        return jsonify({"is_admin": False}), 400
        
    try:
        # We query the admin_roles table directly if email matches an admin id
        # Alternatively, we just check if the user is in the admins table
        admin_data = db.verify_admin(email)
        if admin_data:
            admin_id = admin_data.get('id')
            role_resp = db.client.table("admin_roles").select("role").eq("admin_id", admin_id).execute()
            roles = role_resp.data if role_resp.data else []
            return jsonify({
                "is_admin": True,
                "roles": [r.get('role') for r in roles]
            })
    except Exception as e:
        logger.error(f"Admin check error: {e}")
    return jsonify({"is_admin": False})

@app.route('/api/admin/kyc/approve', methods=['POST'])
@rate_limit
def approve_kyc():
    data = request.json
    cid = data.get('id')
    if not cid:
        return jsonify({"success": False, "message": "Missing ID"}), 400
    try:
        db.update_customer_status(cid, 'active')
        return jsonify({"success": True, "message": "KYC Approved"})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/admin/loans/approve', methods=['POST'])
@rate_limit
def approve_loan():
    data = request.json
    loan_id = data.get('loan_id')
    if not loan_id:
        return jsonify({"success": False, "message": "Missing loan ID"}), 400
    try:
        db.client.table("loans").update({"status": "approved"}).eq("id", loan_id).execute()
        # Fetch loan details to disburse funds
        loan_data = db.client.table("loans").select("*").eq("id", loan_id).execute().data[0]
        db.update_balance(loan_data['customer_id'], float(loan_data['amount']), "Loan Disbursement")
        return jsonify({"success": True, "message": "Loan Approved & Disbursed"})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/admin/cards', methods=['GET'])
@rate_limit
def get_all_cards():
    try:
        cards = db.client.table("cards").select("*").execute().data
        return jsonify({"success": True, "cards": cards})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/admin/cards/status', methods=['POST'])
@rate_limit
def update_card_status():
    data = request.json
    card_id = data.get('card_id')
    status = data.get('status') # e.g. blocked, active
    if not card_id or not status:
        return jsonify({"success": False, "message": "Missing card_id or status"}), 400
    try:
        db.client.table("cards").update({"status": status}).eq("id", card_id).execute()
        return jsonify({"success": True, "message": f"Card {status} successfully"})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/admin/tickets', methods=['GET'])
@rate_limit
def get_all_tickets():
    try:
        tickets = db.client.table("support_tickets").select("*").order("created_at", desc=True).execute().data
        return jsonify({"success": True, "tickets": tickets})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/admin/tickets/resolve', methods=['POST'])
@rate_limit
def resolve_ticket():
    data = request.json
    ticket_id = data.get('ticket_id')
    if not ticket_id:
        return jsonify({"success": False, "message": "Missing ticket_id"}), 400
    try:
        db.client.table("support_tickets").update({"status": "resolved"}).eq("id", ticket_id).execute()
        return jsonify({"success": True, "message": "Ticket resolved"})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/admin/reports/financial', methods=['GET'])
@rate_limit
def get_financial_reports():
    try:
        total_bal = db.get_total_deposits()
        tx_resp = db.client.table("transactions").select("amount, type").execute()
        txs = tx_resp.data if tx_resp.data else []
        total_tx_vol = sum(abs(float(t['amount'])) for t in txs)
        return jsonify({
            "success": True,
            "report": {
                "total_deposits": total_bal,
                "transaction_volume": total_tx_vol,
                "total_transactions": len(txs)
            }
        })
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@app.route('/api/admin/customers/status', methods=['POST'])
@rate_limit
def update_customer_status():
    """
    POST /api/admin/customers/status
    Updates the status of a customer (e.g., active, suspended).
    """
    data = request.json
    cid = data.get('id')
    status = data.get('status')
    
    if not cid or not status:
        return jsonify({"success": False, "message": "Missing ID or status"}), 400
        
    success = db.update_customer_status(cid, status)
    if success:
        logger.info(f"Updated customer {cid} status to {status}")
        return jsonify({"success": True, "message": f"Customer marked as {status}."})
    return jsonify({"success": False, "message": "Failed to update status."}), 500

@app.route('/api/admin/create-customer', methods=['POST'])
@rate_limit
def create_customer():
    """
    POST /api/admin/create-customer
    Creates a new customer account. Validates input and hashes
    the initial password before storing.

    Request Body (JSON):
        { "id", "name", "address", "phone", "password", "balance" }

    Response:
        { "success": bool, "message": str }
    """
    data = request.json
    cid = data.get('id')
    
    # Validate ID format
    if not validate_id_format(cid):
        return jsonify({"success": False, "message": "Invalid account ID format"}), 400
    
    # Validate phone if provided
    phone = data.get("phone")
    if phone and not validate_phone(phone):
        return jsonify({"success": False, "message": "Invalid phone number format"}), 400
    
    logger.info(f"Create customer: id={cid}, ip={request.remote_addr}")
    success, message = admin_logic.create_customer_profile(db, data)
    return jsonify({"success": success, "message": message})


@app.route('/api/admin/search', methods=['GET'])
@rate_limit
def search_customer():
    """
    GET /api/admin/search?id=<customer_id>
    Searches for a customer by their account ID.

    Response:
        Found    → { "success": true, "customer": { ...record... } }
        Not Found → { "success": false, "message": "Not found" } (404)
    """
    cid = request.args.get('id')
    if not validate_id_format(cid):
        return jsonify({"success": False, "message": "Invalid account ID"}), 400
    
    user_data = db.search_customer(cid)
    if user_data:
        return jsonify({"success": True, "customer": user_data})
    return jsonify({"success": False, "message": "Not found"}), 404


@app.route('/api/admin/audit', methods=['GET'])
@rate_limit
def audit_customer():
    """
    GET /api/admin/audit?id=<customer_id>
    Returns a full financial audit for a customer:
    their current balance and complete transaction history.

    Response:
        { "success": true, "history": [...], "balance": float }
    """
    cid = request.args.get('id')
    if not validate_id_format(cid):
        return jsonify({"success": False, "message": "Invalid account ID"}), 400
    
    logger.info(f"Audit: id={cid}, ip={request.remote_addr}")
    history, balance, error = admin_logic.get_transaction_audit_data(db, cid)
    if error:
        return jsonify({"success": False, "message": error}), 400
    return jsonify({"success": True, "history": history, "balance": balance})


@app.route('/api/admin/analytics', methods=['GET'])
@rate_limit
def get_analytics():
    """
    GET /api/admin/analytics
    Returns system-wide analytics for the admin dashboard.

    Response:
        { 
            "success": true, 
            "total_customers": int,
            "total_deposits": float,
            "recent_transactions": [...]
        }
    """
    try:
        total_customers = db.get_customer_count()
        total_deposits = db.get_total_deposits()
        
        # Get recent transactions (last 10)
        if db.client is not None:
            try:
                response = db.client.table("transactions").select("*").order("created_at", desc=True).limit(10).execute()
                recent_transactions = response.data if response.data else []
            except Exception:
                recent_transactions = []
        else:
            recent_transactions = []
        
        return jsonify({
            "success": True,
            "total_customers": total_customers,
            "total_deposits": total_deposits,
            "recent_transactions": recent_transactions
        })
    except Exception as e:
        logger.error(f"Analytics error: {e}")
        return jsonify({"success": False, "message": "Failed to load analytics"}), 500


@app.route('/api/admin/customers', methods=['GET'])
@rate_limit
def list_customers():
    """
    GET /api/admin/customers
    Returns a list of all customer accounts (without passwords).

    Response:
        { "success": true, "customers": [ ...records... ] }
    """
    try:
        customers = db.list_all_customers()
        return jsonify({"success": True, "customers": customers})
    except Exception as e:
        logger.error(f"List customers error: {e}")
        return jsonify({"success": False, "message": "Failed to load customers"}), 500


@app.route('/api/admin/delete-customer', methods=['POST'])
@rate_limit
def delete_customer():
    """
    POST /api/admin/delete-customer
    Deletes a customer and all their transaction records.

    Request Body (JSON):
        { "id": str }

    Response:
        { "success": bool, "message": str }
    """
    data = request.json
    cid = data.get('id')
    if not validate_id_format(cid):
        return jsonify({"success": False, "message": "Invalid account ID"}), 400

    # Verify customer exists first
    existing = db.search_customer(cid)
    if not existing:
        return jsonify({"success": False, "message": "Customer not found"}), 404

    logger.info(f"Delete customer: id={cid}, ip={request.remote_addr}")
    success = db.delete_customer(cid)
    return jsonify({
        "success": success,
        "message": f"Customer {cid} deleted successfully" if success else "Delete failed"
    })


@app.route('/api/admin/transactions', methods=['GET'])
@rate_limit
def list_all_transactions():
    """
    GET /api/admin/transactions
    Returns the most recent transactions across all customers.

    Response:
        { "success": true, "transactions": [ ...records... ] }
    """
    try:
        limit = int(request.args.get('limit', 50))
        transactions = db.get_all_transactions(limit)
        return jsonify({"success": True, "transactions": transactions})
    except Exception as e:
        logger.error(f"All transactions error: {e}")
        return jsonify({"success": False, "message": "Failed to load transactions"}), 500

# ===========================================================================
# ERROR HANDLING
# ===========================================================================

@app.errorhandler(Exception)
def handle_exception(e):
    """
    Global error handler. Catches any unhandled exception in the app,
    logs it server-side, and returns a safe generic message to the client
    (never leaking stack traces to the browser).
    """
    app.logger.error(f"Unhandled Exception: {e}")
    return jsonify({"success": False, "message": "An internal server error occurred"}), 500


# ===========================================================================
# LOANS & BENEFICIARIES
# ===========================================================================

@app.route('/api/customer/loans', methods=['GET'])
@rate_limit
def get_loans():
    cid = request.args.get('id')
    if not cid:
        return jsonify({"success": False, "message": "Missing ID"}), 400
    try:
        # We need to add get_loans to SupabaseService
        loans = db.client.table("loans").select("*").eq("customer_id", cid).order("created_at", desc=True).execute()
        return jsonify({"success": True, "loans": loans.data})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/customer/loans/request', methods=['POST'])
@rate_limit
def request_loan():
    data = request.json
    cid = data.get('id')
    amount = data.get('amount')
    if not cid or not amount:
        return jsonify({"success": False, "message": "Missing data"}), 400
    try:
        db.client.table("loans").insert({
            "customer_id": cid,
            "amount": float(amount),
            "status": "pending"
        }).execute()
        return jsonify({"success": True, "message": "Loan request submitted successfully"})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/customer/beneficiaries', methods=['GET'])
@rate_limit
def get_beneficiaries():
    cid = request.args.get('id')
    if not cid:
        return jsonify({"success": False, "message": "Missing ID"}), 400
    try:
        res = db.client.table("beneficiaries").select("*").eq("customer_id", cid).execute()
        return jsonify({"success": True, "beneficiaries": res.data})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/customer/beneficiaries/add', methods=['POST'])
@rate_limit
def add_beneficiary():
    data = request.json
    cid = data.get('id')
    name = data.get('name')
    acc_num = data.get('account_number')
    bank = data.get('bank_name', 'Core-Trust')
    if not cid or not name or not acc_num:
        return jsonify({"success": False, "message": "Missing data"}), 400
    try:
        db.client.table("beneficiaries").insert({
            "customer_id": cid,
            "name": name,
            "account_number": acc_num,
            "bank_name": bank
        }).execute()
        return jsonify({"success": True, "message": "Beneficiary added successfully"})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

# ===========================================================================
# SERVER ENTRY POINT
# ===========================================================================
if __name__ == '__main__':
    # Use 'waitress' for production-style serving on Windows, or standard Flask dev server
    env = os.getenv('FLASK_ENV', 'development')
    
    if env == 'production':
        from waitress import serve
        logger.info("Starting production server (waitress) on port 5000...")
        serve(app, host='0.0.0.0', port=5000)
    else:
        logger.info("Starting development server on port 5000...")
        print("[DEVELOPMENT] Starting Flask Dev Server on http://localhost:5000")
        app.run(host='0.0.0.0', port=5000, debug=True)
