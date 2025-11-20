from flask import Flask, render_template, jsonify, request
import os
import subprocess
import paramiko 
import shlex
import sqlite3 
from datetime import datetime
from flask_apscheduler import APScheduler
import atexit
import requests
import json

app = Flask(__name__)

# --- CONFIGURATION & PATHS ---
BASE_DIR = os.path.abspath(os.path.dirname(__file__))

# 1. Static Files (Reports)
REPORT_FOLDER = os.path.join(BASE_DIR, 'static', 'reports')

# 2. Data Folder (Logs & DB)
DATA_FOLDER = os.path.join(BASE_DIR, 'data') 
LOG_FOLDER = os.path.join(DATA_FOLDER, 'logs') 
DB_NAME = os.path.join(DATA_FOLDER, 'pela.db') 

# 3. Tools Folder (pgBadger Script)
PGBADGER_SCRIPT = os.path.join(BASE_DIR, 'tools', 'pgbadger.pl') 

# Ensure directories exist
os.makedirs(REPORT_FOLDER, exist_ok=True)
os.makedirs(DATA_FOLDER, exist_ok=True)
os.makedirs(LOG_FOLDER, exist_ok=True)

# --- DATABASE SETUP ---
def init_db():
    """Creates the database tables if they don't exist."""
    try:
        with sqlite3.connect(DB_NAME) as conn:
            cursor = conn.cursor()
            
            # Table: Audit Logs
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS audit_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    server_ip TEXT NOT NULL,
                    username TEXT NOT NULL,
                    connection_mode TEXT NOT NULL,
                    report_url TEXT NOT NULL
                )
            ''')

            # Table: Saved Profiles
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS saved_profiles (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    profile_name TEXT NOT NULL UNIQUE,
                    connection_mode TEXT NOT NULL,
                    server_ip TEXT NOT NULL,
                    username TEXT,
                    jump_host TEXT,
                    env_name TEXT,
                    log_path TEXT
                )
            ''')
            
            # Table: System Settings (e.g., Webhooks)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT
                )
            ''')
            
            conn.commit()
    except Exception as e:
        print(f"Init DB Error: {e}")

def add_audit_log(ip, user, mode, report_url):
    """Inserts a new record into the audit log."""
    try:
        with sqlite3.connect(DB_NAME) as conn:
            cursor = conn.cursor()
            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cursor.execute(
                "INSERT INTO audit_log (timestamp, server_ip, username, connection_mode, report_url) VALUES (?, ?, ?, ?, ?)",
                (now, ip, user, mode, report_url)
            )
            conn.commit()
    except Exception as e:
        print(f"DB Logging Error: {e}")

# Initialize DB on startup
init_db()

# --- SCHEDULER CONFIG ---
class Config:
    SCHEDULER_API_ENABLED = True
    SCHEDULER_DATABASE_URI = f"sqlite:///{DB_NAME}"

app.config.from_object(Config())
scheduler = APScheduler()
scheduler.init_app(app)
scheduler.start()

# Shut down the scheduler cleanly when the app exits
atexit.register(lambda: scheduler.shutdown())

# --- SSH HELPER FUNCTION ---
def create_ssh_client(mode, data):
    """
    Creates and returns an SSH client based on the connection mode.
    Returns: (client, jump_client_or_None)
    """
    ip = data.get('server_ip')
    user = data.get('username')
    pwd = data.get('password')

    if mode == 'direct':
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(
            hostname=ip, 
            username=user, 
            password=pwd, 
            timeout=10, 
            look_for_keys=False, 
            allow_agent=False
        )
        return client, None

    elif mode == 'tunnel':
        jump_host = data.get('jump_host')
        env_name = data.get('env_name')
        
        # Construct complex username for PAM/Vault tunneling
        target_username = f"{user}@{user}#{env_name}@{ip}"
        
        # 1. Connect to Jump Host
        jump_client = paramiko.SSHClient()
        jump_client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        jump_client.connect(
            hostname=jump_host, 
            username=user, 
            password=pwd, 
            timeout=10, 
            look_for_keys=False, 
            allow_agent=False
        )
        
        # 2. Create Tunnel
        transport = jump_client.get_transport()
        proxy_socket = transport.open_channel("direct-tcpip", (ip, 22), ('127.0.0.1', 0))
        
        # 3. Connect to Target via Tunnel
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(
            hostname=jump_host, 
            username=target_username, 
            password=pwd, 
            sock=proxy_socket, 
            timeout=10, 
            look_for_keys=False, 
            allow_agent=False
        )
        
        return client, jump_client
    
    else:
        raise ValueError("Invalid connection mode")

def send_teams_notification(status, ip, message, report_url=None):
    """
    Fetches the Webhook URL from the DB and sends a styled card to Teams.
    """
    try:
        # 1. Get Webhook URL from DB
        with sqlite3.connect(DB_NAME) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT value FROM settings WHERE key = 'teams_webhook'")
            row = cursor.fetchone()
            
        if not row:
            return # Exit silently if not configured

        webhook_url = row[0]
        
        # 2. Card Color and Title
        theme_color = "00FF00" if status == 'success' else "FF0000" 
        title = f"✅ PELA Analysis Success: {ip}" if status == 'success' else f"❌ PELA Analysis Failed: {ip}"
        
        # 3. Message Card (JSON Payload)
        payload = {
            "@type": "MessageCard",
            "@context": "http://schema.org/extensions",
            "themeColor": theme_color,
            "summary": title,
            "sections": [{
                "activityTitle": title,
                "activitySubtitle": f"Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
                "text": message,
                "markdown": True
            }]
        }

        # Add button if report link exists
        if report_url:
            # Placeholder button logic
            payload["potentialAction"] = [{
                "@type": "OpenUri",
                "name": "View Report",
                "targets": [{"os": "default", "uri": "http://YOUR_SERVER_IP:5000/" + report_url}]
            }]

        # 4. Send
        headers = {'Content-Type': 'application/json'}
        requests.post(webhook_url, data=json.dumps(payload), headers=headers)
        print(">> Teams notification sent.")

    except Exception as e:
        print(f"Teams Notification Error: {e}")

def core_analysis_task(data_payload):
    """
    Core function triggered by both HTTP requests and the Scheduler. 
    """
    client = None
    jump_client = None
    
    # Safe Data Extraction
    ip = data_payload.get('server_ip', '').strip()
    user = data_payload.get('username')
    mode = data_payload.get('connection_mode')
    remote_path = data_payload.get('log_path')
    
    # Audit Log Mode Label
    audit_mode = f"{mode} (Auto)" if data_payload.get('is_scheduled') else mode

    # --- 🛠️ SIMULATION MODE (For Testing) ---
    if ip.upper() == 'TEST':
        print(f" >> [SIMULATION] {datetime.now()}: Test scenario started.")
        
        timestamp_str = datetime.now().strftime('%Y%m%d%H%M%S')
        readable_date = datetime.now().strftime('%d-%m-%Y %H:%M:%S')
        fake_report_name = f"simulation_report_{timestamp_str}.html"
        fake_report_path = os.path.join(REPORT_FOLDER, fake_report_name)
        
        # Mock HTML Content
        html_content = f"""
        <!DOCTYPE html><html><head><title>PELA Simulation</title>
        <style>body{{font-family:sans-serif;padding:40px;background:#f4f4f4;}} .card{{background:white;padding:20px;border-radius:8px;box-shadow:0 2px 5px rgba(0,0,0,0.1);}} h1{{color:#2c3e50;}}</style>
        </head><body><div class="card"><h1>✅ Simulation Successful</h1><p>Server: {ip}</p><p>Date: {readable_date}</p><p>This is a mock report generated by PELA.</p></div></body></html>
        """
        
        with open(fake_report_path, 'w', encoding='utf-8') as f:
            f.write(html_content)

        web_report_url = f"static/reports/{fake_report_name}"
        add_audit_log(ip, user, audit_mode, web_report_url)
        send_teams_notification('success', ip, f"Simulation Report Generated.", web_report_url)
        
        return {'success': True, 'report_url': web_report_url}
    # --- END SIMULATION ---

    try:
        # 1. Connection
        client, jump_client = create_ssh_client(mode, data_payload)
        
        # 2. File Retrieval
        local_filename = f"{ip}_{os.path.basename(remote_path)}"
        local_file_path = os.path.join(LOG_FOLDER, local_filename)
        command_to_run = f"sudo /bin/cat {shlex.quote(remote_path)}"
        
        stdin, stdout, stderr = client.exec_command(command_to_run)
        log_content = stdout.read().decode('utf-8', errors='ignore')
        
        if not log_content.strip():
            return {'success': False, 'message': 'Empty log retrieved'}

        with open(local_file_path, 'w', encoding='utf-8') as f:
            f.write(log_content)
            
        # Close connections
        client.close()
        if jump_client: jump_client.close()

        # 3. Analysis
        timestamp_str = datetime.now().strftime('%Y%m%d%H%M%S')
        report_filename = f"report_{ip}_{timestamp_str}.html"
        output_path = os.path.join(REPORT_FOLDER, report_filename)
        web_report_url = f"static/reports/{report_filename}"

        command = [
            "perl", PGBADGER_SCRIPT, "-o", output_path, "-f", "stderr",
            "--title", f"Analysis: {ip}", local_file_path 
        ]
        process = subprocess.run(command, capture_output=True, text=True)

        if process.returncode == 0:
            # Save to DB & Notify
            add_audit_log(ip, user, audit_mode, web_report_url)
            send_teams_notification('success', ip, 'The analysis completed successfully.', web_report_url)
            return {'success': True, 'report_url': web_report_url}
        else:
            return {'success': False, 'message': process.stderr}
            
    except Exception as e:
        send_teams_notification('failed', ip, f"Analysis Error: {str(e)}")
        return {'success': False, 'message': str(e)}
    

# --- ROUTES ---

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/history')
def get_history():
    """API to fetch audit history."""
    try:
        with sqlite3.connect(DB_NAME) as conn:
            conn.row_factory = sqlite3.Row 
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM audit_log ORDER BY id DESC LIMIT 50")
            rows = [dict(row) for row in cursor.fetchall()]
            return jsonify({'success': True, 'data': rows})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

# --- DASHBOARD STATS ---
@app.route('/dashboard-stats')
def dashboard_stats():
    """Returns aggregated statistics for the dashboard."""
    try:
        with sqlite3.connect(DB_NAME) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            # Top Servers
            cursor.execute("SELECT server_ip, COUNT(*) as count FROM audit_log GROUP BY server_ip ORDER BY count DESC LIMIT 5")
            top_servers = [dict(row) for row in cursor.fetchall()]

            # Daily Activity
            cursor.execute("SELECT substr(timestamp, 1, 10) as date, COUNT(*) as count FROM audit_log GROUP BY date ORDER BY date DESC LIMIT 7")
            daily_activity = [dict(row) for row in cursor.fetchall()]
            daily_activity.reverse()

            # Connection Modes
            cursor.execute("SELECT connection_mode, COUNT(*) as count FROM audit_log GROUP BY connection_mode")
            conn_modes = [dict(row) for row in cursor.fetchall()]

            return jsonify({
                'success': True, 
                'top_servers': top_servers,
                'daily_activity': daily_activity,
                'conn_modes': conn_modes
            })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

# --- SETTINGS ROUTES (TEAMS) ---
@app.route('/settings', methods=['POST', 'GET'])
def manage_settings():
    """Manages system settings (e.g., Webhook URL)."""
    try:
        with sqlite3.connect(DB_NAME) as conn:
            cursor = conn.cursor()
            
            if request.method == 'POST':
                data = request.get_json()
                webhook = data.get('webhook_url')
                cursor.execute("REPLACE INTO settings (key, value) VALUES ('teams_webhook', ?)", (webhook,))
                conn.commit()
                return jsonify({'success': True, 'message': 'Settings saved.'})
            
            elif request.method == 'GET':
                cursor.execute("SELECT value FROM settings WHERE key = 'teams_webhook'")
                row = cursor.fetchone()
                return jsonify({'success': True, 'webhook_url': row[0] if row else ''})
                
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

# --- PROFILE MANAGEMENT ROUTES ---
@app.route('/profiles', methods=['GET', 'POST', 'DELETE'])
def manage_profiles():
    """Handles profile saving, listing, and deletion."""
    try:
        with sqlite3.connect(DB_NAME) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            if request.method == 'GET':
                cursor.execute("SELECT * FROM saved_profiles ORDER BY profile_name ASC")
                profiles = [dict(row) for row in cursor.fetchall()]
                return jsonify({'success': True, 'data': profiles})

            if request.method == 'POST':
                data = request.get_json()
                name = data.get('profile_name')
                
                cursor.execute("DELETE FROM saved_profiles WHERE profile_name = ?", (name,))
                cursor.execute('''
                    INSERT INTO saved_profiles 
                    (profile_name, connection_mode, server_ip, username, jump_host, env_name, log_path)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ''', (
                    name, data.get('connection_mode'), data.get('server_ip'),
                    data.get('username'), data.get('jump_host'), data.get('env_name'),
                    data.get('log_path')
                ))
                conn.commit()
                return jsonify({'success': True, 'message': f'Profile "{name}" saved.'})

            if request.method == 'DELETE':
                profile_id = request.args.get('id')
                cursor.execute("DELETE FROM saved_profiles WHERE id = ?", (profile_id,))
                conn.commit()
                return jsonify({'success': True, 'message': 'Profile deleted.'})

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

# -------------------------------------------------------

@app.route('/list-files', methods=['POST'])
def list_files():
    """API to list log files in a remote directory."""
    client = None
    jump_client = None
    try:
        data = request.get_json()
        mode = data.get('connection_mode', 'direct')
        search_path = data.get('search_path', '/var/log/postgresql/') 

        client, jump_client = create_ssh_client(mode, data)
        command = f"sudo ls -1t {search_path}*" 
        
        stdin, stdout, stderr = client.exec_command(command)
        file_list_raw = stdout.read().decode('utf-8', errors='ignore')
        
        files = [f.strip() for f in file_list_raw.split('\n') if f.strip()]
        return jsonify({'success': True, 'files': files})

    except Exception as e:
        return jsonify({'success': False, 'message': f'Connection Error: {str(e)}'})
    finally:
        if client: client.close()
        if jump_client: jump_client.close()

@app.route('/schedule', methods=['POST', 'GET', 'DELETE'])
def manage_schedule():
    """Manages scheduled tasks."""
    if request.method == 'POST':
        data = request.get_json()
        job_id = f"job_{datetime.now().strftime('%Y%m%d%H%M%S')}"
        
        task_data = data.copy()
        task_data['is_scheduled'] = True
        
        scheduler.add_job(
            id=job_id,
            func=core_analysis_task,
            args=[task_data],
            trigger='cron',
            hour=data.get('hour'),
            minute=data.get('minute')
        )
        return jsonify({'success': True, 'message': 'Task Scheduled!'})

    elif request.method == 'GET':
        jobs = []
        for job in scheduler.get_jobs():
            target = job.args[0].get('server_ip') if job.args else 'Unknown'
            next_run = job.next_run_time.strftime("%Y-%m-%d %H:%M") if job.next_run_time else 'N/A'
            jobs.append({'id': job.id, 'target': target, 'next_run': next_run})
        return jsonify({'success': True, 'jobs': jobs})

    elif request.method == 'DELETE':
        job_id = request.args.get('id')
        scheduler.remove_job(job_id)
        return jsonify({'success': True, 'message': 'Schedule deleted.'})

@app.route('/run-analysis', methods=['POST'])
def run_analysis():
    data = request.get_json()
    result = core_analysis_task(data)
    
    if result['success']:
        return jsonify({'success': True, 'message': 'Analysis Complete', 'report_url': result['report_url']})
    else:
        return jsonify({'success': False, 'message': result.get('message', 'Unknown Error')})
    
if __name__ == '__main__':
    host_ip = os.environ.get('FLASK_HOST', '127.0.0.1')
    print(f" * Running on http://{host_ip}:5000")
    app.run(debug=True, host=host_ip, port=5000)