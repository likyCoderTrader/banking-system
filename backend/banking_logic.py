'''
banking_logic.py — Core-Trust Customer Banking Business Rules
=============================================================
This module contains the business logic layer for customer-facing
financial operations: deposits, withdrawals, and transfers.

It acts as an intermediary between the API layer (server.py) and the
database layer (supabase_client.py), ensuring all inputs are validated
and all business rules are enforced before any DB writes occur.

Design Principle:
    All functions follow the pattern:
        (db_service, ...) -> (bool success, str message)
    This lets the API layer remain thin — it just passes results to JSON.

Author: Core-Trust Team
'''


def validate_amount(amount_str) -> tuple:
    """
    Validate that a raw string input represents a positive numeric value.
    Supports K (thousands), M (millions), B (billions) suffixes.

    This is the first line of defence for any financial input. It prevents:
      - Non-numeric strings (e.g. "abc")
      - Zero amounts
      - Negative amounts

    Args:
        amount_str: The raw value from the user (string or number).

    Returns:
        (True, float)  — if valid positive number
        (False, 0.0)   — if invalid
    """
    if amount_str is None:
        return False, 0.0

    # Ensure it's a string, strip whitespace, and uppercase for suffix checking
    amount_str = str(amount_str).strip().upper()
    
    multiplier = 1.0
    if amount_str.endswith('K'):
        multiplier = 1_000.0
        amount_str = amount_str.rstrip('K')
    elif amount_str.endswith('M'):
        multiplier = 1_000_000.0
        amount_str = amount_str.rstrip('M')
    elif amount_str.endswith('B'):
        multiplier = 1_000_000_000.0
        amount_str = amount_str.rstrip('B')

    try:
        amount = float(amount_str) * multiplier
        if amount <= 0:
            return False, 0.0
        return True, amount
    except (ValueError, TypeError):
        return False, 0.0


def process_deposit(db_service, customer_id: str, amount_str) -> tuple:
    """
    Business logic for processing a deposit.

    Steps:
        1. Validate the amount string.
        2. Call the DB service to credit the account.

    Args:
        db_service  : SupabaseService instance.
        customer_id : The account to credit.
        amount_str  : Raw amount string from the frontend.

    Returns:
        (True,  success_message) on success.
        (False, error_message)   on failure.
    """
    is_valid, amount = validate_amount(amount_str)
    if not is_valid:
        return False, "Invalid deposit amount. Please enter a positive number."

    success = db_service.update_balance(customer_id, amount, "Deposit")
    if success:
        return True, "Funds deposited successfully."
    return False, "Deposit failed. Please check your connection and try again."


def process_withdrawal(db_service, customer_id: str, amount_str, current_balance: float) -> tuple:
    """
    Business logic for processing a withdrawal.

    Steps:
        1. Validate the amount string.
        2. Check the customer has sufficient funds (no overdraft).
        3. Call the DB service to debit the account.

    Args:
        db_service       : SupabaseService instance.
        customer_id      : The account to debit.
        amount_str       : Raw amount string from the frontend.
        current_balance  : Current account balance (pre-fetched by the server).

    Returns:
        (True,  success_message) on success.
        (False, error_message)   on failure.
    """
    # Step 1: Validate input format
    is_valid, amount = validate_amount(amount_str)
    if not is_valid:
        return False, "Invalid withdrawal amount. Please enter a positive number."

    # Step 2: Overdraft check — enforce no-negative-balance rule
    if amount > current_balance:
        return False, "Insufficient funds."

    # Step 3: Debit the account (negative amount recorded in transactions)
    success = db_service.update_balance(customer_id, -amount, "Withdrawal")
    if success:
        return True, "Withdrawal successful."
    return False, "Withdrawal failed. Please try again."


def process_transfer(db_service, sender_id: str, recipient_id: str, amount_str) -> tuple:
    """
    Business logic for transferring funds between two customer accounts.

    Steps:
        1. Prevent self-transfers.
        2. Validate the amount.
        3. Verify the recipient account exists.
        4. Check the sender has sufficient funds.
        5. Execute the transfer via the DB service.

    Args:
        db_service   : SupabaseService instance.
        sender_id    : Account ID of the sender.
        recipient_id : Account ID of the recipient.
        amount_str   : Raw amount string from the frontend.

    Returns:
        (True,  success_message) on success.
        (False, error_message)   on failure.
    """
    # Step 1: Prevent transferring to yourself
    if sender_id == recipient_id:
        return False, "You cannot transfer funds to yourself."

    # Step 2: Validate input amount
    is_valid, amount = validate_amount(amount_str)
    if not is_valid:
        return False, "Invalid transfer amount. Please enter a positive number."

    # Step 3: Verify the recipient account exists in the database
    recipient = db_service.search_customer(recipient_id)
    if not recipient:
        return False, "Recipient account not found."

    # Step 4: Check sender has enough funds
    sender_balance = db_service.get_customer_balance(sender_id)
    if amount > sender_balance:
        return False, "Insufficient funds for transfer."

    # Step 5: Execute the transfer (debit sender, credit recipient)
    success = db_service.transfer_funds(sender_id, recipient_id, amount)
    if success:
        return True, f"Successfully transferred ${amount:,.2f} to {recipient['name']}."
    return False, "Transfer failed. Please try again later."
