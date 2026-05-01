-- ============================================================
-- CORE-TRUST BANKING SYSTEM MASTER DATABASE SCHEMA
-- ============================================================
-- This script initializes the complete Supabase database for the Core-Trust portal.
-- Includes: Customers, Admins, Accounts, Transactions, Loans, KYC, Security, etc.
-- ============================================================

-- 0. Enable Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create Admins Table
CREATE TABLE IF NOT EXISTS public.admins (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create Customers Table (Consolidated KYC & Social Auth)
CREATE TABLE IF NOT EXISTS public.customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    phone TEXT,
    address TEXT,
    id_number TEXT,
    dob TEXT,
    occupation TEXT,
    next_of_kin TEXT,
    password TEXT, -- Optional for social logins
    google_id TEXT UNIQUE,
    avatar_url TEXT,
    auth_provider TEXT DEFAULT 'local',
    balance NUMERIC DEFAULT 0 NOT NULL,
    status TEXT DEFAULT 'pending' NOT NULL, -- pending, active, frozen, closed
    kyc_status TEXT DEFAULT 'unverified', -- unverified, pending, approved, rejected
    id_document_url TEXT,
    selfie_url TEXT,
    address_proof_url TEXT,
    mfa_enabled BOOLEAN DEFAULT FALSE,
    mfa_secret TEXT,
    transaction_pin TEXT,
    preferred_language TEXT DEFAULT 'en',
    preferred_currency TEXT DEFAULT 'UGX',
    theme TEXT DEFAULT 'dark',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Create Accounts Table (Support for multiple accounts per customer)
CREATE TABLE IF NOT EXISTS public.accounts (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    account_number TEXT UNIQUE NOT NULL,
    account_type TEXT NOT NULL DEFAULT 'savings', -- savings, current, fixed_deposit
    balance NUMERIC DEFAULT 0 NOT NULL,
    currency TEXT DEFAULT 'UGX' NOT NULL,
    status TEXT DEFAULT 'active' NOT NULL, -- active, frozen, closed
    iban TEXT,
    swift_code TEXT,
    branch_info TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Create Transactions Table (Linking to customers and specific accounts)
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- deposit, withdrawal, transfer, loan_payment
    amount NUMERIC NOT NULL,
    currency TEXT DEFAULT 'UGX',
    status TEXT DEFAULT 'completed', -- pending, completed, failed
    reference_code TEXT UNIQUE,
    description TEXT,
    destination_account TEXT,
    destination_bank TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Create Loans Table
CREATE TABLE IF NOT EXISTS public.loans (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL,
    status TEXT DEFAULT 'pending' NOT NULL, -- pending, approved, rejected, paid
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Create Beneficiaries Table
CREATE TABLE IF NOT EXISTS public.beneficiaries (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    account_number TEXT NOT NULL,
    bank_name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. Create OTP & MFA Requests
CREATE TABLE IF NOT EXISTS public.otp_requests (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    otp_code TEXT NOT NULL,
    type TEXT NOT NULL, -- login, reset, transaction
    used BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. Create User Sessions
CREATE TABLE IF NOT EXISTS public.user_sessions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    device_info TEXT,
    ip_address TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 9. Create Cards Management
CREATE TABLE IF NOT EXISTS public.cards (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    customer_id TEXT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    card_number TEXT NOT NULL UNIQUE,
    card_type TEXT NOT NULL, -- virtual, physical
    brand TEXT NOT NULL, -- visa, mastercard
    expiry_date TEXT NOT NULL,
    cvv TEXT NOT NULL,
    status TEXT DEFAULT 'active' NOT NULL, -- active, frozen, closed
    spending_limit NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 10. Create Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL, -- alert, info, promo, transaction
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 11. Create Support Tickets
CREATE TABLE IF NOT EXISTS public.support_tickets (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT DEFAULT 'open' NOT NULL, -- open, in_progress, resolved
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 12. Create Audit Logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    customer_id TEXT REFERENCES public.customers(id) ON DELETE SET NULL,
    action TEXT NOT NULL, -- login, transfer, profile_update
    ip_address TEXT,
    device_info TEXT,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 13. Create Savings Goals
CREATE TABLE IF NOT EXISTS public.savings_goals (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    target_amount NUMERIC NOT NULL,
    current_amount NUMERIC DEFAULT 0,
    deadline DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- -------------------------------------------------------------
-- SECURITY & ROW LEVEL SECURITY (RLS)
-- -------------------------------------------------------------

-- Enable RLS on all tables
-- 1.5 Admin Roles Table
CREATE TABLE IF NOT EXISTS public.admin_roles (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    admin_id TEXT NOT NULL REFERENCES public.admins(id) ON DELETE CASCADE,
    role TEXT NOT NULL, -- super_admin, manager, teller, loan_officer, compliance, support, it_admin, auditor
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on admin_roles
ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;

-- Allow service_role to access admin_roles
DO $$
DECLARE
    t text;
BEGIN
    EXECUTE format('DROP POLICY IF EXISTS "Allow all for service role" ON public.admin_roles');
    EXECUTE format('CREATE POLICY "Allow all for service role" ON public.admin_roles FOR ALL USING (true) WITH CHECK (true)');
END $$;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beneficiaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.otp_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;

-- Allow service_role (backend API) to perform all actions
DO $$ 
DECLARE
    t text;
BEGIN
    FOR t IN (SELECT table_name FROM information_schema.tables WHERE table_schema = 'public') 
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Allow all for service role" ON public.%I', t);
        EXECUTE format('CREATE POLICY "Allow all for service role" ON public.%I FOR ALL USING (true) WITH CHECK (true)', t);
    END LOOP;
END $$;

-- -------------------------------------------------------------
-- INITIAL DATA SEEDING
-- -------------------------------------------------------------

-- Insert Default Admin Account
INSERT INTO public.admins (id, name, email, password) 
VALUES ('admin', 'System Administrator', 'admin@coretrust.com', 'admin123')
ON CONFLICT (id) DO NOTHING;

-- Reload PostgREST Schema Cache
NOTIFY pgrst, 'reload schema';
