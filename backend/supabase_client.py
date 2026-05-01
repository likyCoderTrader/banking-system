"""
supabase_client.py — Core-Trust Supabase Database Service
==========================================================
This module provides the `SupabaseService` class, which is the single
gateway between the application and the Supabase cloud database.

All direct database interactions (queries, inserts, updates) are
centralised here, keeping the rest of the code database-agnostic.

Database Tables:
    admins       — Admin accounts { id, name, password }
    customers    — Customer accounts { id, name, address, phone, password, balance }
    transactions — Transaction log { id, customer_id, amount, type, created_at }

Author: Core-Trust Team
"""

import os
from dotenv import load_dotenv
from supabase import create_client, Client
from typing import Optional, List, Dict, Any

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
# Load SUPABASE_URL and SUPABASE_KEY from the .env file at the project root
load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")


class SupabaseService:
    """
    Centralised database service for all Supabase interactions.

    Creates and holds a single Supabase client on instantiation.
    Methods return None / False / [] on failure so callers
    can handle errors gracefully without catching raw exceptions.
    """

    def __init__(self):
        """
        Initialise the Supabase client using credentials from .env.
        If credentials are missing, client is set to None and all
        methods will safely return empty/failure values.
        """
        if not SUPABASE_URL or not SUPABASE_KEY:
            self.client = None
            print("[WARNING] Supabase credentials missing — check your .env file.")
        else:
            self.client: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

    def is_connected(self) -> bool:
        """Returns True if the Supabase client was initialised successfully."""
        return self.client is not None

    # =======================================================================
    # ADMIN OPERATIONS
    # =======================================================================

    def verify_admin(self, identifier: str) -> Optional[Dict[str, Any]]:
        """
        Fetch an admin record by their ID or email.

        Args:
            identifier (str): The admin's login ID or email.

        Returns:
            Dict with admin data if found, None otherwise.
        """
        if self.client is not None:
            try:
                if '@' in identifier:
                    response = self.client.table("admins").select("*").eq("email", identifier).execute()
                else:
                    response = self.client.table("admins").select("*").eq("id", identifier).execute()
                return response.data[0] if response.data else None
            except Exception:
                return None
        return None

    def create_customer(self, data: Dict[str, Any]) -> bool:
        """
        Insert a new customer record into the `customers` table and create
        an opening transaction entry in the `transactions` table.

        Args:
            data (dict): Full customer profile — must include `id` and `balance`.

        Returns:
            True on success, False on failure.
        """
        if self.client is not None:
            try:
                # Insert the customer profile
                self.client.table("customers").insert(data).execute()

                # Record the initial deposit as the first transaction
                self.client.table("transactions").insert({
                    "customer_id": data["id"],
                    "amount":      data["balance"],
                    "type":        "Deposit"   # Opening deposit
                }).execute()
                return True
            except Exception as e:
                print(f"[ERROR] create_customer failed: {e}")
                return False
        return False

    def search_customer(self, cid: str) -> Optional[Dict[str, Any]]:
        """
        Find a customer by their account ID (used by the admin search panel).

        Args:
            cid (str): Customer account ID.

        Returns:
            Dict with customer data if found, None otherwise.
        """
        if self.client is not None:
            try:
                response = self.client.table("customers").select("*").eq("id", cid).execute()
                return response.data[0] if response.data else None
            except Exception:
                return None
        return None

    def get_all_customers(self) -> List[Dict[str, Any]]:
        """
        Get all customers for admin analytics and reporting.

        Returns:
            List of all customer records.
        """
        if self.client is not None:
            try:
                response = self.client.table("customers").select("*").execute()
                return response.data if response.data else []
            except Exception:
                return []
        return []

    def get_customer_count(self) -> int:
        """
        Get total number of customers.

        Returns:
            Count of customers.
        """
        if self.client is not None:
            try:
                response = self.client.table("customers").select("*", count='exact').execute()
                return len(response.data) if response.data else 0
            except Exception:
                return 0
        return 0

    def get_total_deposits(self) -> float:
        """
        Get sum of all deposits across all accounts.

        Returns:
            Total deposits amount.
        """
        if self.client is not None:
            try:
                response = self.client.table("customers").select("balance").execute()
                if response.data:
                    return sum(float(c.get("balance", 0)) for c in response.data if c.get("balance", 0) > 0)
                return 0.0
            except Exception:
                return 0.0
        return 0.0

    # =======================================================================
    # CUSTOMER OPERATIONS
    # =======================================================================

    def update_customer_status(self, cid: str, status: str) -> bool:
        """
        Update a customer's status (e.g., 'active', 'pending', 'suspended').

        Args:
            cid (str): Customer ID.
            status (str): The new status to apply.

        Returns:
            True on success, False on failure.
        """
        if self.client is not None:
            try:
                self.client.table("customers").update({"status": status}).eq("id", cid).execute()
                return True
            except Exception as e:
                print(f"[ERROR] update_customer_status failed: {e}")
                return False
        return False

    def verify_customer(self, identifier: str) -> Optional[Dict[str, Any]]:
        """
        Fetch a customer record by their ID or email (used during login).

        Args:
            identifier (str): The customer's account ID or email.

        Returns:
            Dict with customer data if found, None otherwise.
        """
        if self.client is not None:
            try:
                if '@' in identifier:
                    response = self.client.table("customers").select("*").eq("email", identifier).execute()
                else:
                    response = self.client.table("customers").select("*").eq("id", identifier).execute()
                return response.data[0] if response.data else None
            except Exception:
                return None
        return None

    def find_by_google_id(self, google_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetch a customer record by their Google ID.
        """
        if self.client is not None:
            try:
                response = self.client.table("customers").select("*").eq("google_id", google_id).execute()
                return response.data[0] if response.data else None
            except Exception:
                return None
        return None

    def get_customer_balance(self, cid: str) -> float:
        """
        Retrieve only the balance field for a given customer.
        Used by withdraw and transfer logic to check available funds.

        Args:
            cid (str): Customer account ID.

        Returns:
            Account balance as a float, or 0.0 if not found.
        """
        if self.client is not None:
            try:
                response = self.client.table("customers").select("balance").eq("id", cid).execute()
                return float(response.data[0]["balance"]) if response.data else 0.0
            except Exception:
                return 0.0
        return 0.0

    def update_balance(self, cid: str, amount: float, trans_type: str) -> bool:
        """
        Update a customer's balance and record the transaction.

        Negative `amount` values represent withdrawals/debits.
        The method guards against overdrafts — returns False if the
        resulting balance would be negative.

        Args:
            cid        (str):   Customer ID.
            amount     (float): Amount to add (positive) or deduct (negative).
            trans_type (str):   Human-readable label, e.g. "Deposit", "Withdrawal".

        Returns:
            True on success, False on insufficient funds or DB error.
        """
        if self.client is not None:
            try:
                current_bal = self.get_customer_balance(cid)
                new_bal = current_bal + amount

                # Guard against overdraft
                if new_bal < 0:
                    return False

                # Update the balance in the customers table
                self.client.table("customers").update({"balance": new_bal}).eq("id", cid).execute()

                # Record the transaction for audit history
                self.client.table("transactions").insert({
                    "customer_id": cid,
                    "amount":      amount,
                    "type":        trans_type
                }).execute()
                return True
            except Exception as e:
                print(f"[ERROR] update_balance failed: {e}")
                return False
        return False

    def get_transaction_history(self, cid: str) -> List[Dict[str, Any]]:
        """
        Return all transactions for a customer, sorted newest-first.

        Args:
            cid (str): Customer account ID.

        Returns:
            List of transaction dicts, empty list on error.
        """
        if self.client is not None:
            try:
                response = (
                    self.client.table("transactions")
                    .select("*")
                    .eq("customer_id", cid)
                    .order("created_at", desc=True)
                    .execute()
                )
                return response.data
            except Exception:
                return []
        return []

    def update_customer_profile(self, cid: str, data: Dict[str, Any]) -> bool:
        """
        Update one or more fields in a customer's profile without touching
        other unrelated fields (partial update / patch).

        Args:
            cid  (str):  Customer ID.
            data (dict): Fields to update (e.g. name, address, hashed password).

        Returns:
            True on success, False on failure.
        """
        if self.client is not None:
            try:
                self.client.table("customers").update(data).eq("id", cid).execute()
                return True
            except Exception as e:
                print(f"[ERROR] update_customer_profile failed: {e}")
                return False
        return False

    def transfer_funds(self, sender_id: str, recipient_id: str, amount: float) -> bool:
        """
        Execute a fund transfer between two customer accounts as two
        sequential balance updates.

        Note: This is not a true atomic transaction — if the second
        update fails the sender will have already been debited.
        For production, consider wrapping these in a Supabase RPC function.

        Args:
            sender_id    (str):   Account ID of the sender.
            recipient_id (str):   Account ID of the recipient.
            amount       (float): Amount to transfer (must be positive).

        Returns:
            True on success, False on failure.
        """
        if self.client is not None:
            try:
                # Debit sender
                self.update_balance(sender_id, -amount, f"Transfer to {recipient_id}")
                # Credit recipient
                self.update_balance(recipient_id, amount, f"Transfer from {sender_id}")
                return True
            except Exception as e:
                print(f"[ERROR] transfer_funds failed: {e}")
                return False
        return False

    # =======================================================================
    # ADMIN — REAL-WORLD OPERATIONS
    # =======================================================================

    def list_all_customers(self) -> List[Dict[str, Any]]:
        """
        Return all customer records (without passwords) for admin listing.

        Returns:
            List of customer dicts, empty list on error.
        """
        if self.client is not None:
            try:
                response = (
                    self.client.table("customers")
                    .select("id, name, address, phone, balance, created_at")
                    .order("created_at", desc=True)
                    .execute()
                )
                return response.data if response.data else []
            except Exception as e:
                print(f"[ERROR] list_all_customers failed: {e}")
                return []
        return []

    def delete_customer(self, cid: str) -> bool:
        """
        Delete a customer and all their transaction records.

        Args:
            cid (str): Customer account ID to delete.

        Returns:
            True on success, False on failure.
        """
        if self.client is not None:
            try:
                # Delete transactions first (referential integrity)
                self.client.table("transactions").delete().eq("customer_id", cid).execute()
                # Delete the customer record
                self.client.table("customers").delete().eq("id", cid).execute()
                return True
            except Exception as e:
                print(f"[ERROR] delete_customer failed: {e}")
                return False
        return False

    def get_all_transactions(self, limit: int = 50) -> List[Dict[str, Any]]:
        """
        Return the most recent transactions across ALL customers.

        Args:
            limit (int): Max number of records to return.

        Returns:
            List of transaction dicts.
        """
        if self.client is not None:
            try:
                response = (
                    self.client.table("transactions")
                    .select("*")
                    .order("created_at", desc=True)
                    .limit(limit)
                    .execute()
                )
                return response.data if response.data else []
            except Exception as e:
                print(f"[ERROR] get_all_transactions failed: {e}")
                return []
        return []
