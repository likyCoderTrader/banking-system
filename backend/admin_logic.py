"""
admin_logic.py — Core-Trust Admin Business Rules
=================================================
This module contains the business logic layer for administrative operations:
creating new customer accounts and retrieving audit data.

Like banking_logic.py, it acts as the layer between the API (server.py)
and the database (supabase_client.py), ensuring inputs are validated and
passwords are hashed before storage.

Author: Core-Trust Team
"""

import bcrypt


def validate_profile_data(data: dict) -> tuple:
    """
    Validate that all required fields are present and non-empty when
    creating a new customer profile.

    Required fields: id, name, address, phone, password, balance.
    The balance field is also checked to be a valid numeric value.

    Args:
        data (dict): The raw form data submitted by the admin.

    Returns:
        (True,  None)          — all fields valid
        (False, error_message) — a required field is missing or invalid
    """
    required_fields = ["id", "name", "address", "phone", "password", "balance"]

    for field in required_fields:
        # Check field exists and is not blank after stripping whitespace
        if not data.get(field) or not str(data.get(field)).strip():
            return False, f"Field '{field}' is required."

    # Separately validate that balance is a real number
    try:
        float(data.get("balance", 0))
    except ValueError:
        return False, "Initial Balance must be a valid number."

    return True, None


def create_customer_profile(db_service, form_data: dict) -> tuple:
    """
    Business logic for onboarding a new customer.

    Steps:
        1. Validate all required profile fields.
        2. Convert balance to float.
        3. Hash the password with bcrypt before storing.
        4. Insert the record via the DB service.

    Args:
        db_service  : SupabaseService instance.
        form_data   : Dict containing the new customer's profile fields.

    Returns:
        (True,  success_message) on success.
        (False, error_message)   on validation or DB failure.
    """
    # Step 1: Validate all required fields
    is_valid, error_msg = validate_profile_data(form_data)
    if not is_valid:
        return False, error_msg

    # Step 2: Ensure balance is stored as a number, not a string
    form_data["balance"] = float(form_data["balance"])

    # Step 3: Hash the password so it is never stored in plain text
    pwd = str(form_data["password"]).encode('utf-8')
    hashed = bcrypt.hashpw(pwd, bcrypt.gensalt()).decode('utf-8')
    form_data["password"] = hashed

    # Step 4: Persist to the database
    if db_service.create_customer(form_data):
        return True, "Account created successfully."
    return False, "Failed to create account. ID might already exist."


def get_transaction_audit_data(db_service, customer_id: str) -> tuple:
    """
    Retrieve complete audit data for a customer for the admin panel.

    Returns both the transaction history and the current balance,
    giving the admin a full financial picture of the account.

    Args:
        db_service  : SupabaseService instance.
        customer_id : The account to audit.

    Returns:
        (history, balance, None)        — on success
        (None, None, error_message)     — if no ID was provided
    """
    # Guard: require a customer ID to be supplied
    if not customer_id:
        return None, None, "Please enter a Customer ID."

    # Fetch history and balance in parallel-ish calls (sequential for simplicity)
    history = db_service.get_transaction_history(customer_id)
    balance = db_service.get_customer_balance(customer_id)

    return history, balance, None
