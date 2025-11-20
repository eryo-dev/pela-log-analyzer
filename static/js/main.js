// Global State
let currentMode = 'direct'; 

/**
 * Handles switching between "Direct SSH" and "Jump Host Tunnel" tabs.
 */
function switchTab(mode) {
    currentMode = mode;
    
    // Update Tab Buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    if(event && event.target) {
        event.target.classList.add('active');
    }

    // Update Form Visibility
    document.querySelectorAll('.form-section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(mode + '-section').classList.add('active');
}

/**
 * Fetches list of log files from the remote server.
 */
function fetchLogFiles(mode) {
    let payload = { connection_mode: mode };
    let prefix = (mode === 'direct') ? 'd_' : 't_';

    // Gather credentials
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

/**
 * Fetches and renders audit history.
 */
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
    
    //Preloads
    loadSettings();
    loadSchedules();
    loadHistory();
    fetchProfiles();
    
    // 1. THEME LOGIC
    const themeToggleBtn = document.getElementById('themeToggle');
    const currentTheme = localStorage.getItem('theme');

    // Apply saved theme on load
    if (currentTheme) {
        document.documentElement.setAttribute('data-theme', currentTheme);
        if (currentTheme === 'dark' && themeToggleBtn) {
            themeToggleBtn.innerText = '☀️';
        }
    }

    // Toggle Theme Button Click
    if(themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            let theme = document.documentElement.getAttribute('data-theme');
            if (theme === 'dark') {
                document.documentElement.setAttribute('data-theme', 'light');
                localStorage.setItem('theme', 'light');
                themeToggleBtn.innerText = '🌙';
            } else {
                document.documentElement.setAttribute('data-theme', 'dark');
                localStorage.setItem('theme', 'dark');
                themeToggleBtn.innerText = '☀️';
            }
        });
    }

    // 2. LOAD HISTORY
    loadHistory();

    // 3. START ANALYSIS LOGIC
    const generateBtn = document.getElementById('generateBtn');
    const statusMsg = document.getElementById('statusMsg');

    generateBtn.addEventListener('click', function() {
        let payload = { connection_mode: currentMode };
        let isValid = false;
        let prefix = (currentMode === 'direct') ? 'd_' : 't_';

        const selectedLogPath = document.getElementById(prefix + 'log_select').value;

        if (currentMode === 'direct') {
            const ip = document.getElementById('d_ip').value.trim();
            const user = document.getElementById('d_user').value.trim();
            const pass = document.getElementById('d_pass').value.trim();
            
            if (ip && user && pass && selectedLogPath) {
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
            
            if (jump && ip && user && env && pass && selectedLogPath) {
                payload.jump_host = jump;
                payload.server_ip = ip;
                payload.username = user;
                payload.env_name = env;
                payload.password = pass;
                payload.log_path = selectedLogPath;
                isValid = true;
            }
        }

        if (!isValid) {
            if (!selectedLogPath) {
                alert("Please list files and select a log file first.");
            } else {
                alert("Please fill all required connection fields.");
            }
            return;
        }

        generateBtn.disabled = true;
        generateBtn.innerHTML = '<span class="loader"></span> Analyzing...';
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
                        <div><strong>✔ Success</strong><br><span style="font-size:0.9em; opacity:0.9">${data.message}</span></div>
                        <a href="${data.report_url}" target="_blank" style="background:var(--success); color:white; padding:8px 16px; text-decoration:none; border-radius:4px; font-weight:bold;">View Report</a>
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
            statusMsg.innerHTML = 'Network Error.';
        })
        .finally(() => {
            generateBtn.disabled = false;
            generateBtn.innerText = 'Start Analysis';
        });
    });
});

function fetchProfiles() {
    const select = document.getElementById('profileSelect');
    fetch('/profiles')
        .then(res => res.json())
        .then(data => {
            if(data.success) {
                // Mevcut seçenekleri temizle (ilk seçenek hariç)
                select.innerHTML = '<option value="">-- Select Saved Profile --</option>';
                data.data.forEach(p => {
                    let opt = document.createElement('option');
                    opt.value = JSON.stringify(p); // Tüm profil verisini value içine gömüyoruz
                    opt.innerText = p.profile_name;
                    select.appendChild(opt);
                });
            }
        });
}

// 2. Yeni Profil Kaydet
function saveProfile() {
    const name = prompt("Enter a name for this profile:");
    if (!name) return;

    // Şu anki moddan verileri topla
    let payload = { 
        profile_name: name,
        connection_mode: currentMode 
    };

    if (currentMode === 'direct') {
        payload.server_ip = document.getElementById('d_ip').value.trim();
        payload.username = document.getElementById('d_user').value.trim();
        payload.log_path = document.getElementById('d_search_dir').value.trim(); // Search dir'i kaydediyoruz
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
        fetchProfiles(); // Listeyi yenile
    });
}

// 3. Seçilen Profili Forma Doldur
function loadProfileData() {
    const select = document.getElementById('profileSelect');
    if (!select.value) return;

    const data = JSON.parse(select.value);
    
    // Sekmeyi değiştir
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

// 4. Profil Sil
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
            // Formu temizlemek istersen buraya kod ekleyebilirsin
        });
}

// --- SCHEDULER FUNCTIONS ---

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

    // Mevcut form verilerini topla (Payload oluşturma mantığı fetchLogFiles ile aynı)
    // Tek fark, bu fonksiyon payload'ı anında göndermek yerine zamanlayıcıya gönderir.
    let payload = { connection_mode: currentMode };
    
    // Formdan verileri çek (Kopyala-Yapıştır mantığı)
    if (currentMode === 'direct') {
        payload.server_ip = document.getElementById('d_ip').value.trim();
        payload.username = document.getElementById('d_user').value.trim();
        payload.password = document.getElementById('d_pass').value.trim();
        payload.log_path = document.getElementById('d_search_dir').value.trim(); // Path buradan alınıyor
        // Eğer dosya seçildiyse onu al, yoksa search path'i al
        const selected = document.getElementById('d_log_select').value;
        if(selected) payload.log_path = selected; 
    } else {
        payload.jump_host = document.getElementById('t_jump').value.trim();
        payload.server_ip = document.getElementById('t_ip').value.trim();
        payload.username = document.getElementById('t_user').value.trim();
        payload.env_name = document.getElementById('t_env').value.trim();
        payload.password = document.getElementById('t_pass').value.trim();
        const selected = document.getElementById('t_log_select').value;
        payload.log_path = selected ? selected : document.getElementById('t_search_dir').value.trim();
    }

    if (!payload.server_ip || !payload.password) {
        alert("Please fill connection details first.");
        return;
    }

    // Zaman bilgisini ekle
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