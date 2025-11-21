// Global State to track active mode
let currentMode = 'direct'; 
let charts = {}; // Store chart instances to prevent canvas reuse errors

/**
 * Handles switching between "Direct SSH" and "Jump Host Tunnel" tabs.
 */
function switchTab(mode) {
    currentMode = mode;
    
    // 1. Update Tab Buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    // Add active class to the clicked button
    if(event && event.target) {
        event.target.classList.add('active');
    }

    // 2. Update Form Visibility
    document.querySelectorAll('.form-section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(mode + '-section').classList.add('active');

    // 3. Handle "Start Analysis" Button and Dashboard Load
    const actionBtn = document.getElementById('generateBtn');
    
    if (mode === 'dashboard') {
        actionBtn.style.display = 'none'; // Hide button on dashboard
        loadDashboard(); 
    } else {
        actionBtn.style.display = ''; // Reset inline style to use CSS default
        actionBtn.innerText = 'Start Analysis';
    }
}

// --- DASHBOARD CHARTS ---

function loadDashboard() {
    fetch('/dashboard-stats')
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                renderCharts(data);
            }
        });
}

function renderCharts(data) {
    const colors = ['#3498db', '#2ecc71', '#e74c3c', '#f1c40f', '#9b59b6'];

    // 1. Line Chart (Daily Activity)
    createChart('activityChart', 'line', {
        labels: data.daily_activity.map(d => d.date),
        datasets: [{
            label: 'Analyses Per Day',
            data: data.daily_activity.map(d => d.count),
            borderColor: '#3498db',
            backgroundColor: 'rgba(52, 152, 219, 0.1)',
            fill: true,
            tension: 0.4
        }]
    });

    // 2. Pie Chart (Top Servers)
    createChart('serversChart', 'doughnut', {
        labels: data.top_servers.map(s => s.server_ip),
        datasets: [{
            data: data.top_servers.map(s => s.count),
            backgroundColor: colors
        }]
    });

    // 3. Bar Chart (Connection Modes)
    createChart('modesChart', 'bar', {
        labels: data.conn_modes.map(m => m.connection_mode),
        datasets: [{
            label: 'Count',
            data: data.conn_modes.map(m => m.count),
            backgroundColor: ['#1abc9c', '#34495e']
        }]
    });
}

function createChart(canvasId, type, dataConfig) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    
    // Destroy existing chart if it exists
    if (charts[canvasId]) {
        charts[canvasId].destroy();
    }

    charts[canvasId] = new Chart(ctx, {
        type: type,
        data: dataConfig,
        options: {
            responsive: true,
            plugins: { legend: { position: 'bottom' } },
            scales: type === 'line' || type === 'bar' ? { y: { beginAtZero: true, ticks: { stepSize: 1 } } } : {}
        }
    });
}

// --- LOG DISCOVERY (FILE LISTING) ---

function fetchLogFiles(mode) {
    let payload = { connection_mode: mode };
    let prefix = (mode === 'direct') ? 'd_' : 't_';

    // Gather credentials based on mode
    if (mode === 'direct') {
        payload.server_ip = document.getElementById('d_ip').value.trim();
        payload.username = document.getElementById('d_user').value.trim();
        payload.password = document.getElementById('d_pass').value.trim();
        payload.search_path = document.getElementById('d_search_dir').value.trim();
    } else {
        payload.jump_host = document.getElementById('t_jump').value.trim();
        payload.server_ip = document.getElementById('t_ip').value.trim();
        payload.username = document.getElementById('t_user').value.trim();
        payload.env_name = document.getElementById('t_env').value.trim();
        payload.password = document.getElementById('t_pass').value.trim();
        payload.search_path = document.getElementById('t_search_dir').value.trim();
    }

    if (!payload.server_ip || !payload.password) {
        alert("Connection Error: Please enter Server IP and Password to list files.");
        return;
    }

    // UI Feedback
    const selectBox = document.getElementById(prefix + 'log_select');
    const btn = event.target; 
    const originalText = btn.innerText;
    btn.innerText = 'Scanning...';
    btn.disabled = true;

    fetch('/list-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            // Clear and populate select box
            selectBox.innerHTML = '<option value="">-- Select a Log File --</option>';
            if (data.files.length > 0) {
                data.files.forEach(file => {
                    let cleanFile = file.trim(); 
                    if(cleanFile) {
                        let opt = document.createElement('option');
                        opt.value = cleanFile;
                        opt.innerText = cleanFile;
                        selectBox.appendChild(opt);
                    }
                });
                selectBox.style.display = 'block'; 
            } else {
                alert("No files found in the specified directory.");
            }
        } else {
            alert("Error Listing Files: " + data.message);
        }
    })
    .catch(err => {
        console.error(err);
        alert("Network Error while listing files.");
    })
    .finally(() => {
        btn.innerText = originalText;
        btn.disabled = false;
    });
}

// --- PROFILE MANAGEMENT ---

function fetchProfiles() {
    const select = document.getElementById('profileSelect');
    fetch('/profiles')
        .then(res => res.json())
        .then(data => {
            if(data.success) {
                select.innerHTML = '<option value="">-- Select Saved Profile --</option>';
                data.data.forEach(p => {
                    let opt = document.createElement('option');
                    opt.value = JSON.stringify(p);
                    opt.innerText = p.profile_name;
                    select.appendChild(opt);
                });
            }
        });
}

function saveProfile() {
    const name = prompt("Enter a name for this profile:");
    if (!name) return;

    let payload = { profile_name: name, connection_mode: currentMode };

    if (currentMode === 'direct') {
        payload.server_ip = document.getElementById('d_ip').value.trim();
        payload.username = document.getElementById('d_user').value.trim();
        payload.log_path = document.getElementById('d_search_dir').value.trim();
    } else {
        payload.jump_host = document.getElementById('t_jump').value.trim();
        payload.server_ip = document.getElementById('t_ip').value.trim();
        payload.username = document.getElementById('t_user').value.trim();
        payload.env_name = document.getElementById('t_env').value.trim();
        payload.log_path = document.getElementById('t_search_dir').value.trim();
    }

    fetch('/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        alert(data.message);
        fetchProfiles();
    });
}

function loadProfileData() {
    const select = document.getElementById('profileSelect');
    if (!select.value) return;

    const data = JSON.parse(select.value);
    
    switchTab(data.connection_mode);

    if (data.connection_mode === 'direct') {
        document.getElementById('d_ip').value = data.server_ip;
        document.getElementById('d_user').value = data.username || '';
        document.getElementById('d_search_dir').value = data.log_path || '/var/log/postgresql/';
    } else {
        document.getElementById('t_jump').value = data.jump_host || '';
        document.getElementById('t_ip').value = data.server_ip;
        document.getElementById('t_user').value = data.username || '';
        document.getElementById('t_env').value = data.env_name || '';
        document.getElementById('t_search_dir').value = data.log_path || '/tmp/';
    }
}

function deleteProfile() {
    const select = document.getElementById('profileSelect');
    if (!select.value) {
        alert("Please select a profile to delete.");
        return;
    }
    
    const data = JSON.parse(select.value);
    if(!confirm(`Are you sure you want to delete "${data.profile_name}"?`)) return;

    fetch(`/profiles?id=${data.id}`, { method: 'DELETE' })
        .then(res => res.json())
        .then(data => {
            alert(data.message);
            fetchProfiles();
        });
}

// --- SCHEDULER ---

function loadSchedules() {
    const ul = document.getElementById('jobsUl');
    fetch('/schedule')
        .then(res => res.json())
        .then(data => {
            ul.innerHTML = '';
            if (data.jobs.length > 0) {
                data.jobs.forEach(job => {
                    let li = document.createElement('li');
                    li.style.display = 'flex';
                    li.style.justifyContent = 'space-between';
                    li.style.marginBottom = '5px';
                    li.innerHTML = `
                        <span>Target: <b>${job.target}</b> - Next: ${job.next_run}</span>
                        <button onclick="deleteSchedule('${job.id}')" style="border:none; background:transparent; color:red; cursor:pointer;">✕</button>
                    `;
                    ul.appendChild(li);
                });
            } else {
                ul.innerHTML = '<li style="color:var(--text-muted);">No active schedules.</li>';
            }
        });
}

function deleteSchedule(id) {
    if(!confirm('Stop this scheduled task?')) return;
    fetch(`/schedule?id=${id}`, { method: 'DELETE' })
        .then(res => res.json())
        .then(data => {
            loadSchedules();
        });
}

function scheduleTask() {
    const hour = document.getElementById('sched_hour').value;
    const min = document.getElementById('sched_min').value;
    
    if (hour === '' || min === '') {
        alert("Please set hour and minute.");
        return;
    }

    let payload = { connection_mode: currentMode };
    let prefix = (currentMode === 'direct') ? 'd_' : 't_';
    
    // Get log path from select if available, else from search input
    const selectedLogPath = document.getElementById(prefix + 'log_select').value || document.getElementById(prefix + 'search_dir').value.trim();

    if (currentMode === 'direct') {
        payload.server_ip = document.getElementById('d_ip').value.trim();
        payload.username = document.getElementById('d_user').value.trim();
        payload.password = document.getElementById('d_pass').value.trim();
        payload.log_path = selectedLogPath;
    } else {
        payload.jump_host = document.getElementById('t_jump').value.trim();
        payload.server_ip = document.getElementById('t_ip').value.trim();
        payload.username = document.getElementById('t_user').value.trim();
        payload.env_name = document.getElementById('t_env').value.trim();
        payload.password = document.getElementById('t_pass').value.trim();
        payload.log_path = selectedLogPath;
    }

    if (!payload.server_ip) {
        alert("Please fill connection details first.");
        return;
    }

    payload.hour = hour;
    payload.minute = min;

    fetch('/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        alert(data.message);
        loadSchedules();
    });
}

// --- SETTINGS (TEAMS) ---

function saveSettings() {
    const url = document.getElementById('webhookUrl').value.trim();
    if (!url) {
        alert("Please enter a Webhook URL.");
        return;
    }

    fetch('/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhook_url: url })
    })
    .then(res => res.json())
    .then(data => {
        alert(data.message);
    });
}

function loadSettings() {
    fetch('/settings')
        .then(res => res.json())
        .then(data => {
            if (data.success && data.webhook_url) {
                document.getElementById('webhookUrl').value = data.webhook_url;
            }
        });
}

// --- AUDIT HISTORY ---

function loadHistory() {
    const tbody = document.getElementById('historyTableBody');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:20px;">Fetching data...</td></tr>';

    fetch('/history')
        .then(response => response.json())
        .then(data => {
            tbody.innerHTML = ''; 
            
            if (data.success && data.data.length > 0) {
                data.data.forEach(row => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td style="color:var(--text-muted); font-size:0.9em;">${row.timestamp}</td>
                        <td style="font-weight:600; color:var(--text-color);">${row.server_ip}</td>
                        <td>${row.username}</td>
                        <td><span class="badge">${row.connection_mode}</span></td>
                        <td><a href="${row.report_url}" target="_blank" class="report-link">View Report ↗</a></td>
                    `;
                    tbody.appendChild(tr);
                });
            } else {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-muted);">No analysis history found yet.</td></tr>';
            }
        })
        .catch(err => {
            console.error("History fetch error:", err);
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#e74c3c;">Failed to load history.</td></tr>';
        });
}

// --- MAIN EVENT LISTENER ---
document.addEventListener('DOMContentLoaded', function() {
    
    // 1. THEME LOGIC
    const themeToggleBtn = document.getElementById('themeToggle');
    const currentTheme = localStorage.getItem('theme');

    if (currentTheme) {
        document.documentElement.setAttribute('data-theme', currentTheme);
        if (currentTheme === 'dark' && themeToggleBtn) {
            themeToggleBtn.innerText = '☀️';
        }
    }

    if(themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            let theme = document.documentElement.getAttribute('data-theme');
            let newTheme = (theme === 'dark') ? 'light' : 'dark';
            let newIcon = (theme === 'dark') ? '🌙' : '☀️';
            
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            themeToggleBtn.innerText = newIcon;
        });
    }

    // 2. LOAD INITIAL DATA
    loadHistory();
    fetchProfiles();
    loadSettings();
    loadSchedules();

    // 3. START ANALYSIS BUTTON LOGIC
    const generateBtn = document.getElementById('generateBtn');
    const statusMsg = document.getElementById('statusMsg');

    generateBtn.addEventListener('click', function() {
        let payload = { connection_mode: currentMode };
        let isValid = false;
        let prefix = (currentMode === 'direct') ? 'd_' : 't_';

        const selectedLogPath = document.getElementById(prefix + 'log_select').value;

        // GATHER DATA
        if (currentMode === 'direct') {
            const ip = document.getElementById('d_ip').value.trim();
            const user = document.getElementById('d_user').value.trim();
            const pass = document.getElementById('d_pass').value.trim();
            
            // SIMULATION MODE BYPASS (Check if IP is TEST)
            if (ip.toUpperCase() === 'TEST' && user) {
                payload.server_ip = ip;
                payload.username = user;
                payload.password = pass;
                payload.log_path = '/simulation/dummy.log';
                isValid = true;
            }
            // NORMAL MODE
            else if (ip && user && selectedLogPath) {
                payload.server_ip = ip;
                payload.username = user;
                payload.password = pass;
                payload.log_path = selectedLogPath;
                isValid = true;
            }
        } 
        else {
            const jump = document.getElementById('t_jump').value.trim();
            const ip = document.getElementById('t_ip').value.trim();
            const user = document.getElementById('t_user').value.trim();
            const env = document.getElementById('t_env').value.trim();
            const pass = document.getElementById('t_pass').value.trim();
            
            if (jump && ip && user && env && selectedLogPath) {
                payload.jump_host = jump;
                payload.server_ip = ip;
                payload.username = user;
                payload.env_name = env;
                payload.password = pass;
                payload.log_path = selectedLogPath;
                isValid = true;
            }
        }

        // VALIDATION
        if (!isValid) {
            const checkIP = (currentMode === 'direct') ? document.getElementById('d_ip').value : document.getElementById('t_ip').value;
            
            if (checkIP.toUpperCase() !== 'TEST' && !selectedLogPath) {
                alert("Please list files and select a log file first.");
            } else {
                alert("Please fill all required connection fields.");
            }
            return;
        }

        // UI LOADING STATE
        generateBtn.disabled = true;
        generateBtn.innerHTML = '<span class="loader"></span> Analyzing...';
        statusMsg.style.display = 'none';
        statusMsg.className = 'status-box'; 

        // SEND REQUEST
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
                        <a href="${data.report_url}" target="_blank" style="background:var(--success); color:white; padding:8px 16px; text-decoration:none; border-radius:4px; font-weight:bold;">View Report</a>
                    </div>`;
                
                loadHistory(); // Refresh table
                if(currentMode === 'dashboard') loadDashboard(); // Refresh charts if active
                
            } else {
                statusMsg.classList.add('error-box');
                statusMsg.innerHTML = `<strong>⚠ Error:</strong> ${data.message}`;
            }
        })
        .catch(error => {
            console.error('Request failed:', error);
            statusMsg.style.display = 'block';
            statusMsg.classList.add('error-box');
            statusMsg.innerHTML = 'Network Error. Please check server logs.';
        })
        .finally(() => {
            generateBtn.disabled = false;
            generateBtn.innerText = 'Start Analysis';
        });
    });
});
