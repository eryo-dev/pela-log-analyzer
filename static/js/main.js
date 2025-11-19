// Global State: Aktif modu takip eder ('direct' veya 'tunnel')
let currentMode = 'direct'; 

/**
 * Sekmeler arası geçişi yönetir.
 */
function switchTab(mode) {
    currentMode = mode;
    
    // 1. Tab butonlarını güncelle
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    if(event && event.target) {
        event.target.classList.add('active');
    }

    // 2. Form alanlarını güncelle
    document.querySelectorAll('.form-section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(mode + '-section').classList.add('active');
}

/**
 * Sunucudan dosya listesini çeker ve Dropdown'ı doldurur.
 * @param {string} mode - 'direct' veya 'tunnel'
 */
function fetchLogFiles(mode) {
    let payload = { connection_mode: mode };
    let prefix = (mode === 'direct') ? 'd_' : 't_';

    // Gerekli bağlantı bilgilerini topla
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

    // Basit Validasyon (Dosya listelemek için en azından IP ve Şifre lazım)
    if (!payload.server_ip || !payload.password) {
        alert("Connection Error: Please enter Server IP and Password to list files.");
        return;
    }

    // Buton Görsel Geri Bildirimi
    const selectBox = document.getElementById(prefix + 'log_select');
    const btn = event.target; // Tıklanan butonu al
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
            // Select box'ı temizle
            selectBox.innerHTML = '<option value="">-- Select a Log File --</option>';
            
            // Dosyaları ekle
            if (data.files.length > 0) {
                data.files.forEach(file => {
                    // Gelen dosya yolunu temizle (bazen boşluklu gelebilir)
                    let cleanFile = file.trim(); 
                    if(cleanFile) {
                        let opt = document.createElement('option');
                        // Tam yolu oluştur: search_path + filename (veya ls çıktısı tam yol dönüyorsa direkt kullan)
                        // Bizim backend ls -1t path* çalıştırdığı için tam yol dönmeyebilir,
                        // ama genellikle ls path/* yapınca path/file döner.
                        // Garanti olsun diye basitçe option text ve value'yu aynı yapıyoruz.
                        opt.value = cleanFile;
                        opt.innerText = cleanFile;
                        selectBox.appendChild(opt);
                    }
                });
                selectBox.style.display = 'block'; // Dropdown'ı göster
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
 * Geçmiş analizleri (Audit Trail) yükler.
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
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#e74c3c;">Failed to load history.</td></tr>';
        });
}

// Sayfa Yüklendiğinde
document.addEventListener('DOMContentLoaded', function() {
    const generateBtn = document.getElementById('generateBtn');
    const statusMsg = document.getElementById('statusMsg');

    // Geçmişi yükle
    loadHistory();

    // Analiz Butonu Olayı
    generateBtn.addEventListener('click', function() {
        let payload = { connection_mode: currentMode };
        let isValid = false;
        let prefix = (currentMode === 'direct') ? 'd_' : 't_';

        // Dropdown'dan seçilen dosya yolunu al
        const selectedLogPath = document.getElementById(prefix + 'log_select').value;

        if (currentMode === 'direct') {
            const ip = document.getElementById('d_ip').value.trim();
            const user = document.getElementById('d_user').value.trim();
            const pass = document.getElementById('d_pass').value.trim();
            
            if (ip && user && pass && selectedLogPath) {
                payload.server_ip = ip;
                payload.username = user;
                payload.password = pass;
                payload.log_path = selectedLogPath; // Dropdown'dan gelen değer
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
                payload.log_path = selectedLogPath; // Dropdown'dan gelen değer
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

        // UI Loading State
        generateBtn.disabled = true;
        generateBtn.innerHTML = '<span class="loader"></span> Establishing Connection & Analyzing...';
        statusMsg.style.display = 'none';
        statusMsg.className = 'status-box'; 

        // Analiz İsteği Gönder
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
                
                // Tabloyu güncelle
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
            statusMsg.innerHTML = 'Network Error. Please check server logs.';
        })
        .finally(() => {
            generateBtn.disabled = false;
            generateBtn.innerText = 'Start Analysis';
        });
    });
});