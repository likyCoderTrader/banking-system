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
from flask import Flask, request, jsonify     # Core web framework
from flask_cors import CORS                   # Allow cross-origin requests from the frontend
from supabase_client import SupabaseService   # Handles all Supabase DB operations
import banking_logic                          # Business rules for deposits, withdrawals, transfers
import admin_logic                            # Business rules for customer management
import bcrypt                                 # Password hashing

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

    # Step 1: Fetch user record (by ID only — no password sent to DB)
    result = db.verify_admin(uid) if mode == 'admin' else db.verify_customer(uid)

    if result:
        stored_hash = result.get('password')
        if stored_hash:
            # Step 2: Try bcrypt comparison (for hashed passwords)
            try:
                if bcrypt.checkpw(pwd.encode('utf-8'), stored_hash.encode('utf-8')):
                    return jsonify({"success": True, "user": result})
            except Exception:
                pass
            # Step 3: Plain-text fallback (for legacy/seeded accounts)
            if pwd == stored_hash:
                return jsonify({"success": True, "user": result})

    return jsonify({"success": False, "message": "Invalid credentials"}), 401


# ===========================================================================
# CUSTOMER ENDPOINTS
# ===========================================================================

@app.route('/api/customer/balance', methods=['GET'])
def get_balance():
    """
    GET /api/customer/balance?id=<customer_id>
    Returns the current account balance for the given customer.

    Query Params:
        id (str) — Customer account ID

    Response:
        { "balance": float }
    """
    balance = db.get_customer_balance(request.args.get('id'))
    return jsonify({"balance": balance})


@app.route('/api/customer/deposit', methods=['POST'])
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
    success, message = banking_logic.process_deposit(db, data.get('id'), data.get('amount'))
    return jsonify({"success": success, "message": message})


@app.route('/api/customer/withdraw', methods=['POST'])
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
    # Fetch current balance for the business-logic overdraft check
    current_bal = db.get_customer_balance(cid)
    success, message = banking_logic.process_withdrawal(db, cid, data.get('amount'), current_bal)
    return jsonify({"success": success, "message": message})


@app.route('/api/customer/history', methods=['GET'])
def get_history():
    """
    GET /api/customer/history?id=<customer_id>
    Returns a list of all transactions for the customer (newest first).

    Response:
        { "history": [ { ...transaction... }, ... ] }
    """
    history = db.get_transaction_history(request.args.get('id'))
    return jsonify({"history": history})


@app.route('/api/customer/transfer', methods=['POST'])
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
    success, message = banking_logic.process_transfer(
        db, data.get('from_id'), data.get('to_id'), data.get('amount')
    )
    return jsonify({"success": success, "message": message})


@app.route('/api/customer/profile', methods=['POST'])
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

    success = db.update_customer_profile(cid, profile_data)
    return jsonify({
        "success": success,
        "message": "Profile updated successfully" if success else "Update failed"
    })


# ===========================================================================
# ADMIN ENDPOINTS
# ===========================================================================

@app.route('/api/admin/create-customer', methods=['POST'])
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
    success, message = admin_logic.create_customer_profile(db, data)
    return jsonify({"success": success, "message": message})


@app.route('/api/admin/search', methods=['GET'])
def search_customer():
    """
    GET /api/admin/search?id=<customer_id>
    Searches for a customer by their account ID.

    Response:
        Found    → { "success": true, "customer": { ...record... } }
        Not Found → { "success": false, "message": "Not found" } (404)
    """
    user_data = db.search_customer(request.args.get('id'))
    if user_data:
        return jsonify({"success": True, "customer": user_data})
    return jsonify({"success": False, "message": "Not found"}), 404


@app.route('/api/admin/audit', methods=['GET'])
def audit_customer():
    """
    GET /api/admin/audit?id=<customer_id>
    Returns a full financial audit for a customer:
    their current balance and complete transaction history.

    Response:
        { "success": true, "history": [...], "balance": float }
    """
    cid = request.args.get('id')
    history, balance, error = admin_logic.get_transaction_audit_data(db, cid)
    if error:
        return jsonify({"success": False, "message": error}), 400
    return jsonify({"success": True, "history": history, "balance": balance})


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
# ENTRY POINT
# ===========================================================================

if __name__ == '__main__':
    is_prod = os.getenv("FLASK_ENV") == "production"

    if is_prod:
        # Production: use Waitress (a robust WSGI server, not Flask's dev server)
        from waitress import serve
        print("[PRODUCTION] Starting Core-Trust API with Waitress on port 5000...")
        serve(app, host='0.0.0.0', port=5000)
    else:
        # Development: use Flask's built-in server (reloader disabled for cleaner logs)
        print("[DEVELOPMENT] Starting Flask Dev Server on port 5000...")
        app.run(port=5000, debug=False)
