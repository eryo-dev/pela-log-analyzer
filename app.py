from flask import Flask, render_template, jsonify, request
import os
import subprocess
import paramiko 
import shlex
import sqlite3 # Python'un yerleşik veritabanı
from datetime import datetime

app = Flask(__name__)

# --- CONFIGURATION ---
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
REPORT_FOLDER = os.path.join(BASE_DIR, 'static', 'reports')
LOG_FOLDER = os.path.join(BASE_DIR, 'logs')
PGBADGER_SCRIPT = os.path.join(BASE_DIR, 'pgbadger.pl')
DB_NAME = os.path.join(BASE_DIR, 'pela.db') # Veritabanı dosyası

# Klasörleri oluştur
os.makedirs(REPORT_FOLDER, exist_ok=True)
os.makedirs(LOG_FOLDER, exist_ok=True)

# --- DATABASE SETUP ---
def init_db():
    """Veritabanı tablosunu yoksa oluşturur (Migration)."""
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
        conn.commit()

def add_audit_log(ip, user, mode, report_url):
    """Analiz sonucunu veritabanına kaydeder."""
    try:
        with sqlite3.connect(DB_NAME) as conn:
            cursor = conn.cursor()
            # Şu anki zamanı formatla (Yıl-Ay-Gün Saat:Dakika:Saniye)
            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cursor.execute(
                "INSERT INTO audit_log (timestamp, server_ip, username, connection_mode, report_url) VALUES (?, ?, ?, ?, ?)",
                (now, ip, user, mode, report_url)
            )
            conn.commit()
    except Exception as e:
        print(f"DB Error: {e}")

# Uygulama başlarken veritabanını hazırla
init_db()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/history')
def get_history():
    """Frontend için geçmiş kayıtları JSON olarak döner."""
    try:
        with sqlite3.connect(DB_NAME) as conn:
            conn.row_factory = sqlite3.Row # Sütun isimleriyle erişebilmek için
            cursor = conn.cursor()
            # En son yapılan en üstte görünsün (ORDER BY id DESC)
            cursor.execute("SELECT * FROM audit_log ORDER BY id DESC LIMIT 50")
            rows = [dict(row) for row in cursor.fetchall()]
            return jsonify({'success': True, 'data': rows})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

@app.route('/run-analysis', methods=['POST'])
def run_analysis():
    client = None
    jump_client = None

    try:
        data = request.get_json()
        mode = data.get('connection_mode', 'direct')
        
        # Common fields
        ip = data.get('server_ip')
        user = data.get('username')
        pwd = data.get('password')
        remote_path = data.get('log_path')
        
        # --- MODE 1: DIRECT SSH ---
        if mode == 'direct':
            if not all([ip, user, pwd, remote_path]):
                return jsonify({'success': False, 'message': 'Missing credentials.'})
            try:
                client = paramiko.SSHClient()
                client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
                client.connect(hostname=ip, username=user, password=pwd, timeout=10, look_for_keys=False, allow_agent=False)
            except Exception as e:
                return jsonify({'success': False, 'message': f'Direct SSH Error: {str(e)}'})

        # --- MODE 2: JUMP HOST TUNNEL ---
        elif mode == 'tunnel':
            jump_host = data.get('jump_host')
            env_name = data.get('env_name')
            
            if not all([jump_host, ip, user, env_name, pwd, remote_path]):
                return jsonify({'success': False, 'message': 'Missing Tunnel credentials.'})
            
            target_username = f"{user}@{user}#{env_name}@{ip}"

            try:
                jump_client = paramiko.SSHClient()
                jump_client.set_missing_host_key_policy(paramiko.AutoAddPolicy()) 
                jump_client.connect(hostname=jump_host, username=user, password=pwd, timeout=10, look_for_keys=False, allow_agent=False)
                
                transport = jump_client.get_transport()
                proxy_socket = transport.open_channel("direct-tcpip", (ip, 22), ('127.0.0.1', 0))
                
                client = paramiko.SSHClient()
                client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
                client.connect(hostname=jump_host, username=target_username, password=pwd, sock=proxy_socket, timeout=10, look_for_keys=False, allow_agent=False)
            except Exception as e:
                return jsonify({'success': False, 'message': f'Tunnel Error: {str(e)}'})

        # --- FILE STREAMING ---
        if not client:
            return jsonify({'success': False, 'message': 'Connection failed.'})

        local_filename = f"{ip}_{os.path.basename(remote_path)}"
        local_file_path = os.path.join(LOG_FOLDER, local_filename)
        
        command_to_run = f"sudo /bin/cat {shlex.quote(remote_path)}"
        
        stdin, stdout, stderr = client.exec_command(command_to_run)
        log_content = stdout.read().decode('utf-8', errors='ignore')
        
        if not log_content.strip():
            error_msg = stderr.read().decode('utf-8', errors='ignore')
            if error_msg:
                 return jsonify({'success': False, 'message': f'Remote Command Error: {error_msg}'})
            return jsonify({'success': False, 'message': 'Empty log file retrieved.'})

        with open(local_file_path, 'w', encoding='utf-8') as f:
            f.write(log_content)

        client.close()
        if jump_client: jump_client.close()

        # --- ANALYSIS (pgBadger) ---
        # Rapor ismine timestamp ekledik ki benzersiz olsun
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
            # ==> BAŞARILI OLDUĞUNDA DB'YE KAYDET <==
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
    app.run(debug=True)