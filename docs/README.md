<h1 align="center">🌐 Core-Trust Digital Banking Portal 🌐</h1>
<p align="center">A Super Premium, Browser-Based Banking Experience powered by Supabase</p><br>

## 💎 Features
- **Frosted Glass UI**: Stunning "Frosted White" glassmorphic design with real-time blur and elegant animations.
- **Universal Access**: Fully responsive web portal that works seamlessly on desktop, tablets, and mobile.
- **Live Integration**: Connects directly to the Supabase Cloud backend for real-time transaction syncing.
- **Dual Portal**: Integrated views for both **Administrators** (Customer management, Auditing) and **Customers** (Deposits, Withdrawals, History).

## 🚀 Getting Started
1. **Prerequisites**: Ensure you have Python installed (to serve the portal locally).
2. **Launch**: Simply run the following command in your terminal:
   ```bash
   python run_web.py
   ```
3. **Login**:
   - **Admin**: ID: `admin`, Password: `admin123`
   - **Customer**: Use an ID created by the admin (e.g., `1001` with pass `1234`).

## 📁 System Architecture
- **`run_web.py`**: The **Ignition Switch** (Starts both the backend and frontend).
- **`server.py`**: The **Gatekeeper** (Handles API requests and authentication).
- **`admin_logic.py`** & **`banking_logic.py`**: The **Brain** (Where all the Python business rules live).
- **`index.html`** & **`styles.css`**: The **Showroom** (The visual architecture and theme).
- **`app.js`**: The **Nervous System** (Connects the user's clicks to the Python logic).
- **`supabase_client.py`**: The **Vault Door** (Handles the actual secure talk with Supabase).
- **`.env.example`**: The **Blueprints** (Template for required environment variables).

## 🌍 Live Testing & Deployment
To prepare this system for live testing:
1. **Environment Variables**: Configure your hosting environment (e.g., Heroku, Render, AWS) with:
   - `SUPABASE_URL`: Your project URL.
   - `SUPABASE_KEY`: Your anon/public key.
   - `FLASK_ENV`: Set to `production`.
2. **API Base**: The frontend automatically detects if it's running on `localhost` or a live domain. No manual URL changes are required.
3. **Waitress WSGI**: The system uses `waitress` to serve the API in production mode for improved stability.



