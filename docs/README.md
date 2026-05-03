# 🏦 Core-Trust Digital Banking System
### A Premium FinTech Solution by **likyCoder**

Welcome to the **Core-Trust Digital Banking System**, a high-performance, full-stack banking portal designed for security, speed, and a premium user experience. This system leverages a robust Python Flask backend and a modern Vanilla JavaScript frontend to deliver real-time financial services.

---

## 🚀 Quick Setup Guide

Follow these steps to get the system running on your local environment (XAMPP/Windows).

### 1. Prerequisites
- **XAMPP Control Panel** (Apache and MySQL)
- **Python 3.12+**
- **Web Browser** (Chrome/Edge recommended)

### 2. Database Configuration
1. Open XAMPP and **Start MySQL**.
2. Open [phpMyAdmin](http://localhost/phpmyadmin).
3. Create a new database named: `core_trust_bank`.
4. *Note: The system will automatically generate all required tables and seed the initial admin account upon the first run.*

### 3. Environment & Dependencies
1. Navigate to the project root: `c:\xampp\htdocs\bankSystem`.
2. Open the `.env` file and verify your MySQL credentials:
   ```env
   MYSQL_HOST=localhost
   MYSQL_USER=root
   MYSQL_PWD=
   MYSQL_DB=core_trust_bank
   ```
3. Install the required Python packages:
   ```bash
   pip install -r requirements.txt
   ```

### 4. Launching the System
1. Open XAMPP and **Start Apache**.
2. Run the dedicated launcher script:
   ```bash
   python run_web.py
   ```
3. This script will:
   - Free up Port 5000.
   - Start the Flask API server.
   - Automatically open your browser to the landing page.

---

## 🛠 How It Works

### **Frontend (The Presentation Layer)**
The frontend is a Single Page Application (SPA) built using **Vanilla JavaScript (app.js)** and **CSS3**. It handles all UI transitions, data fetching via Fetch API, and local session management without requiring page reloads for core banking actions.

### **Backend (The Engine)**
The **Flask API (server.py)** serves as the central hub. It processes requests, enforces business rules (via `banking_logic.py`), and communicates with the database.
- **Security:** Every password is encrypted using **Bcrypt**.
- **Performance:** Implements **Rate Limiting** to prevent brute-force attacks and **Connection Pooling** for database efficiency.

### **Database (The Vault)**
A relational **MySQL** schema ensures data integrity. It tracks:
- **Customers & Admins**: Profiles and encrypted credentials.
- **Transactions**: Atomic records of every movement (UUID-based).
- **KYC & Compliance**: Secure storage of identity verification details.
- **Support & Loans**: Workflow management for customer inquiries and credit.

---

## 🔑 Default Admin Access
To manage the system, use the following default credentials (change upon first login):
- **User ID:** `admin@coretrust.com`
- **Password:** `admin123`

---

## 📜 Credits
Developed with ❤️ by **likyCoder**  
🌐 [Developer Portfolio](https://likyjosh.likesyou.org)  
*Building the future of digital finance.*

