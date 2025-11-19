from flask import Flask, render_template, jsonify, request
import os
import subprocess
import paramiko 
import shlex
import sqlite3 
from datetime import datetime

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
    """Creates the audit_log table if it doesn't exist."""
    try:
        with sqlite3.connect(DB_NAME) as conn:
            cursor = conn.cursor()
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

# --- PROFILE MANAGEMENT ROUTES (YENİ EKLENEN KISIM) ---

@app.route('/profiles', methods=['GET', 'POST', 'DELETE'])
def manage_profiles():
    """Profil kaydetme, listeleme ve silme işlemleri."""
    try:
        with sqlite3.connect(DB_NAME) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            # 1. GET: Profilleri Listele
            if request.method == 'GET':
                cursor.execute("SELECT * FROM saved_profiles ORDER BY profile_name ASC")
                profiles = [dict(row) for row in cursor.fetchall()]
                return jsonify({'success': True, 'data': profiles})

            # 2. POST: Yeni Profil Kaydet
            if request.method == 'POST':
                data = request.get_json()
                name = data.get('profile_name')
                
                # Aynı isimde varsa üzerine yaz (UPSERT mantığı yerine DELETE+INSERT basitliği)
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

            # 3. DELETE: Profil Sil
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

        # Establish Connection using Helper
        client, jump_client = create_ssh_client(mode, data)
        
        # List files (sudo might be needed depending on permissions)
        # ls -1t orders by modification time (newest first)
        command = f"sudo ls -1t {search_path}*" 
        
        stdin, stdout, stderr = client.exec_command(command)
        file_list_raw = stdout.read().decode('utf-8', errors='ignore')
        error_msg = stderr.read().decode('utf-8', errors='ignore')

        # If we got files, ignore minor stderr warnings. If empty and stderr exists, it's an error.
        if not file_list_raw.strip() and error_msg:
             return jsonify({'success': False, 'message': f'List Error: {error_msg}'})

        # Clean up the list
        files = [f.strip() for f in file_list_raw.split('\n') if f.strip()]
        
        return jsonify({'success': True, 'files': files})

    except Exception as e:
        return jsonify({'success': False, 'message': f'Connection Error: {str(e)}'})
    finally:
        if client: client.close()
        if jump_client: jump_client.close()

@app.route('/run-analysis', methods=['POST'])
def run_analysis():
    """Main logic to pull log and run pgBadger."""
    client = None
    jump_client = None

    try:
        data = request.get_json()
        mode = data.get('connection_mode', 'direct')
        
        # Inputs
        ip = data.get('server_ip')
        user = data.get('username')
        # Password is used in helper function
        remote_path = data.get('log_path')

        if not remote_path:
             return jsonify({'success': False, 'message': 'Please select a log file first.'})

        # 1. Establish Connection
        try:
            client, jump_client = create_ssh_client(mode, data)
        except Exception as e:
            return jsonify({'success': False, 'message': f'Connection Failed: {str(e)}'})

        # 2. File Streaming
        local_filename = f"{ip}_{os.path.basename(remote_path)}"
        local_file_path = os.path.join(LOG_FOLDER, local_filename)
        
        # Stream file content using cat
        command_to_run = f"sudo /bin/cat {shlex.quote(remote_path)}"
        
        stdin, stdout, stderr = client.exec_command(command_to_run)
        log_content = stdout.read().decode('utf-8', errors='ignore')
        
        if not log_content.strip():
            error_msg = stderr.read().decode('utf-8', errors='ignore')
            if error_msg:
                 return jsonify({'success': False, 'message': f'Read Error: {error_msg}'})
            return jsonify({'success': False, 'message': 'Empty log file retrieved.'})

        # Save to local file
        with open(local_file_path, 'w', encoding='utf-8') as f:
            f.write(log_content)

        # Close SSH connections
        client.close()
        if jump_client: jump_client.close()

        # 3. Analysis (pgBadger)
        report_filename = f"report_{ip}_{datetime.now().strftime('%Y%m%d%H%M%S')}.html"
        output_path = os.path.join(REPORT_FOLDER, report_filename)
        web_report_url = f"static/reports/{report_filename}"

        command = [
            "perl", PGBADGER_SCRIPT, 
            "-o", output_path, 
            "-f", "stderr",
            "--title", f"Analysis: {ip}", 
            local_file_path 
        ]

        process = subprocess.run(command, capture_output=True, text=True)

        if process.returncode == 0:
            # Save to Audit Log
            add_audit_log(ip, user, mode, web_report_url)
            
            return jsonify({
                'success': True, 
                'message': f'Analysis completed for <b>{ip}</b>.',
                'report_url': web_report_url
            })
        else:
            return jsonify({'success': False, 'message': f'pgBadger Error: {process.stderr}'})

    except Exception as e:
        return jsonify({'success': False, 'message': f'System Error: {str(e)}'})

if __name__ == '__main__':
    host_ip = os.environ.get('FLASK_HOST', '127.0.0.1')
    
    print(f" * Running on http://{host_ip}:5000 (Press CTRL+C to quit)")
    app.run(debug=True, host=host_ip, port=5000)