"""
run_prod.py — Core-Trust Banking Portal Launch Script (Production)
==================================================================
Use this script to launch the banking system in production mode.

Key differences from run_web.py (development):
    - Sets FLASK_ENV=production so server.py switches from Flask's
      built-in dev server to Waitress (a robust WSGI server).
    - Waitress handles concurrent requests properly and is safe
      to expose outside of localhost.
    - Also includes the port cleanup logic to prevent startup errors.

Usage:
    python run_prod.py

Author: Core-Trust Team
"""

import subprocess
import webbrowser
import time
import os
import sys

# ---------------------------------------------------------------------------
# Path Constants
# ---------------------------------------------------------------------------
ROOT_DIR       = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR   = os.path.join(ROOT_DIR, "frontend")
BACKEND_SERVER = os.path.join(ROOT_DIR, "backend", "server.py")


def kill_port(port: int):
    """
    Kill any process listening on the given port (Windows).
    Prevents 'Address already in use' errors from orphaned processes.
    """
    try:
        result = subprocess.run(
            f'netstat -ano | findstr :{port}',
            shell=True, capture_output=True, text=True
        )
        pids = set()
        for line in result.stdout.splitlines():
            parts = line.strip().split()
            if len(parts) >= 5 and parts[-1].isdigit() and 'LISTENING' in line:
                pids.add(parts[-1])
        for pid in pids:
            subprocess.run(f'taskkill /F /PID {pid}', shell=True, capture_output=True)
        if pids:
            print(f"[CLEANUP] Freed port {port} (PID: {', '.join(pids)})", flush=True)
    except Exception as e:
        print(f"[CLEANUP] Warning: could not free port {port}: {e}", flush=True)


def run_production():
    """
    Orchestrates the production launch:
        1. Clean up orphaned processes.
        2. Start Waitress WSGI backend on port 5000.
        3. Serve frontend/ on port 8000.
        4. Open the browser.
    """
    print("--------------------------------------------------")
    print("[INFO] Core-Trust Digital Banking - PRODUCTION MODE")
    print("--------------------------------------------------")

    # -----------------------------------------------------------------------
    # Step 0: Free ports before starting
    # -----------------------------------------------------------------------
    kill_port(5000)
    kill_port(8000)
    time.sleep(0.5)

    # -----------------------------------------------------------------------
    # Step 1: Set FLASK_ENV so server.py uses Waitress instead of dev server
    # -----------------------------------------------------------------------
    os.environ["FLASK_ENV"] = "production"

    # -----------------------------------------------------------------------
    # Step 2: Launch the backend (Waitress will start inside server.py)
    # -----------------------------------------------------------------------
    print("[INFO] Starting Waitress WSGI Server on port 5000...")
    backend = subprocess.Popen(
        [sys.executable, BACKEND_SERVER],
        cwd=ROOT_DIR   # Run from project root so .env is found
    )
    time.sleep(2)   # Allow Waitress time to bind the port

    # -----------------------------------------------------------------------
    # Step 3: Serve frontend files
    # -----------------------------------------------------------------------
    print("[INFO] Starting Web Server at http://localhost:8000...")
    web_server = subprocess.Popen(
        [sys.executable, "-m", "http.server", "8000"],
        cwd=FRONTEND_DIR
    )

    # -----------------------------------------------------------------------
    # Step 4: Open browser
    # -----------------------------------------------------------------------
    time.sleep(1.5)
    webbrowser.open("http://localhost:8000")

    print("\n[SUCCESS] SYSTEM ONLINE (PRODUCTION)")
    print("   - API Backend: http://localhost:5000")
    print("   - Web Portal:  http://localhost:8000")
    print("\nPress Ctrl+C to stop all servers.")

    # -----------------------------------------------------------------------
    # Keep-alive / Graceful Shutdown
    # -----------------------------------------------------------------------
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[SHUTDOWN] Stopping servers...")
        web_server.terminate()
        backend.terminate()
        try:
            backend.wait(timeout=5)
            web_server.wait(timeout=5)
        except Exception:
            pass
        print("[SHUTDOWN] Done.")


# ---------------------------------------------------------------------------
# Entry Point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    run_production()
