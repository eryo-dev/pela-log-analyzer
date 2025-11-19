let currentMode = 'direct'; 

function switchTab(mode) {
    currentMode = mode;
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    if(event && event.target) {
        event.target.classList.add('active');
    }

    document.querySelectorAll('.form-section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(mode + '-section').classList.add('active');
}

function loadHistory() {
    const tbody = document.getElementById('historyTableBody');
    
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#7f8c8d; padding:20px;">Fetching data...</td></tr>';

    fetch('/history')
        .then(response => response.json())
        .then(data => {
            tbody.innerHTML = ''; 
            
            if (data.success && data.data.length > 0) {
                data.data.forEach(row => {
                    const tr = document.createElement('tr');
                    
                    tr.innerHTML = `
                        <td style="color:#666; font-size:0.9em;">${row.timestamp}</td>
                        <td style="font-weight:600; color:#2c3e50;">${row.server_ip}</td>
                        <td>${row.username}</td>
                        <td><span class="badge">${row.connection_mode}</span></td>
                        <td><a href="${row.report_url}" target="_blank" class="report-link">View Report ↗</a></td>
                    `;
                    tbody.appendChild(tr);
                });
            } else {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#95a5a6;">No analysis history found yet.</td></tr>';
            }
        })
        .catch(err => {
            console.error("History fetch error:", err);
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#e74c3c;">Failed to load history. Check connection.</td></tr>';
        });
}

document.addEventListener('DOMContentLoaded', function() {
    const generateBtn = document.getElementById('generateBtn');
    const statusMsg = document.getElementById('statusMsg');

    loadHistory();

    generateBtn.addEventListener('click', function() {
        let payload = { connection_mode: currentMode };
        let isValid = false;

        if (currentMode === 'direct') {
            const ip = document.getElementById('d_ip').value.trim();
            const user = document.getElementById('d_user').value.trim();
            const pass = document.getElementById('d_pass').value.trim();
            const path = document.getElementById('d_path').value.trim();

            if (ip && user && pass && path) {
                payload.server_ip = ip;
                payload.username = user;
                payload.password = pass;
                payload.log_path = path;
                isValid = true;
            }
        } 
        else {
            const jump = document.getElementById('t_jump').value.trim();
            const ip = document.getElementById('t_ip').value.trim();
            const user = document.getElementById('t_user').value.trim();
            const env = document.getElementById('t_env').value.trim();
            const pass = document.getElementById('t_pass').value.trim();
            const path = document.getElementById('t_path').value.trim();

            if (jump && ip && user && env && pass && path) {
                payload.jump_host = jump;
                payload.server_ip = ip;
                payload.username = user;
                payload.env_name = env;
                payload.password = pass;
                payload.log_path = path;
                isValid = true;
            }
        }

        if (!isValid) {
            alert("Please fill all fields for the selected connection mode.");
            return;
        }

        generateBtn.disabled = true;
        generateBtn.innerHTML = '<span class="loader"></span> Establishing Connection...';
        statusMsg.style.display = 'none';
        statusMsg.className = 'status-box'; 

        fetch('/run-analysis', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(response => response.json())
        .then(data => {
            statusMsg.style.display = 'block';
            
            if (data.success) {
                statusMsg.classList.add('success-box');
                statusMsg.innerHTML = `
                    <div style="display:flex; align-items:center; justify-content:space-between;">
                        <div>
                            <strong>✔ Success</strong><br>
                            <span style="font-size:0.9em; opacity:0.9">${data.message}</span>
                        </div>
                        <a href="${data.report_url}" target="_blank" style="background:#27ae60; color:white; padding:8px 16px; text-decoration:none; border-radius:4px; font-weight:bold;">View Report</a>
                    </div>`;
                
                loadHistory();
                
            } else {
                statusMsg.classList.add('error-box');
                statusMsg.innerHTML = `<strong>⚠ Error:</strong> ${data.message}`;
            }
        })
        .catch(error => {
            console.error('Request failed:', error);
            statusMsg.style.display = 'block';
            statusMsg.classList.add('error-box');
            statusMsg.innerHTML = 'Network Error. Please check server logs or your connection.';
        })
        .finally(() => {
            generateBtn.disabled = false;
            generateBtn.innerText = 'Start Analysis';
        });
    });
});