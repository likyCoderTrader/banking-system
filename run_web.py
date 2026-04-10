"""
run_web.py — Core-Trust Banking Portal Launch Script (Development)
==================================================================
This is the main entry point for running the banking system locally.

What it does:
    1. Cleans up any old/orphaned processes on ports 5000 and 8000.
    2. Starts the Flask backend API (backend/server.py) on port 5000.
    3. Starts Python's built-in HTTP server to serve the frontend/ 
       directory on port 8000.
    4. Opens the portal in the browser automatically.
    5. Keeps running until you press Ctrl+C, then shuts everything down cleanly.

Usage:
    python run_web.py

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
# All paths are relative to this file's location (the project root), so the
# script works regardless of where it is launched from.
ROOT_DIR       = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR   = os.path.join(ROOT_DIR, "frontend")    # Served by http.server
BACKEND_SERVER = os.path.join(ROOT_DIR, "backend", "server.py")


def kill_port(port: int):
    """
    Kill any process currently listening on the given port (Windows only).

    This prevents "Address already in use" errors caused by orphaned
    processes from previous server runs.

    Args:
        port (int): The TCP port number to free (e.g. 5000 or 8000).
    """
    try:
        # Find PIDs listening on the port using netstat
        result = subprocess.run(
            f'netstat -ano | findstr :{port}',
            shell=True, capture_output=True, text=True
        )
        pids = set()
        for line in result.stdout.splitlines():
            parts = line.strip().split()
            # Only kill LISTENING processes (not TIME_WAIT connections)
            if len(parts) >= 5 and parts[-1].isdigit() and 'LISTENING' in line:
                pids.add(parts[-1])
        for pid in pids:
            subprocess.run(f'taskkill /F /PID {pid}', shell=True, capture_output=True)
        if pids:
            print(f"[CLEANUP] Freed port {port} (killed PID: {', '.join(pids)})", flush=True)
    except Exception as e:
        print(f"[CLEANUP] Warning: could not free port {port}: {e}", flush=True)


def run_all():
    """
    Main orchestration function — starts both servers and opens the browser.
    Blocks until the user presses Ctrl+C, then shuts down gracefully.
    """
    # -----------------------------------------------------------------------
    # Step 0: Clean up orphaned processes from any previous runs
    # -----------------------------------------------------------------------
    print("[CLEANUP] Freeing ports 5000 and 8000...", flush=True)
    kill_port(5000)
    kill_port(8000)
    time.sleep(0.5)   # Brief pause to allow OS to release the ports

    # -----------------------------------------------------------------------
    # Step 1: Start the Flask Backend API
    # -----------------------------------------------------------------------
    print("[INFO] Starting Python Logic Engine (Flask)...", flush=True)
    backend = subprocess.Popen(
        [sys.executable, BACKEND_SERVER],
        cwd=ROOT_DIR   # Run from project root so .env is found
    )

    # Give Flask time to initialise before the frontend tries to call it
    time.sleep(2)

    # -----------------------------------------------------------------------
    # Step 2: Start the Frontend Web Server
    # -----------------------------------------------------------------------
    print("[INFO] Launching Web Portal at http://localhost:8000...", flush=True)
    web_server = subprocess.Popen(
        [sys.executable, "-m", "http.server", "8000"],
        cwd=FRONTEND_DIR   # Serve files from the frontend/ directory
    )

    # -----------------------------------------------------------------------
    # Step 3: Open the Browser
    # -----------------------------------------------------------------------
    time.sleep(1.5)   # Give http.server a moment before opening the browser
    print("[INFO] Opening browser...", flush=True)
    webbrowser.open("http://localhost:8000")

    # -----------------------------------------------------------------------
    # Live Status
    # -----------------------------------------------------------------------
    print("\n[SUCCESS] Core-Trust Digital Banking is LIVE!", flush=True)
    print("   - API Backend: http://localhost:5000", flush=True)
    print("   - Web Portal:  http://localhost:8000", flush=True)
    print("\nServer logs will appear below. Press Ctrl+C to stop.\n", flush=True)

    # -----------------------------------------------------------------------
    # Keep-alive loop
    # -----------------------------------------------------------------------
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        # -----------------------------------------------------------------------
        # Graceful Shutdown
        # -----------------------------------------------------------------------
        print("\n[SHUTDOWN] Stopping servers...", flush=True)
        web_server.terminate()
        backend.terminate()
        try:
            backend.wait(timeout=5)
            web_server.wait(timeout=5)
        except Exception:
            pass   # Force-killed processes may not respond to wait()
        print("[SHUTDOWN] Done. Goodbye!", flush=True)


# ---------------------------------------------------------------------------
# Entry Point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    run_all()
