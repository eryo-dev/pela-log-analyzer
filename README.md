# PELA - PostgreSQL Enterprise Log Analyzer 🚀

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/python-3.9+-yellow.svg)
![Status](https://img.shields.io/badge/status-stable-green.svg)
![Docker](https://img.shields.io/badge/docker-ready-blue)

**PELA** is a lightweight, enterprise-grade observability tool designed for DBAs and DevOps engineers. It automates the retrieval and analysis of PostgreSQL logs, supporting complex network architectures (Jump Hosts/Bastion) and generating visual reports using the powerful **pgBadger** engine.

It goes beyond simple scripting by providing an **Operational Dashboard**, **Audit Trails**, **Automated Scheduling**, **Profile Management**, and **Real-time Notifications**.

---

## ✨ Key Features

* **🔐 Enterprise Connectivity:**
    * **Direct SSH:** Connect directly to accessible database servers.
    * **Jump Host Tunneling:** Securely tunnel through Bastion servers (supports complex PAM/Vault username structures).
* **📂 Smart Log Discovery:** No need to remember file paths. PELA lists remote log files (`ls`) for you to select via a dropdown.
* **💾 Profile Manager:** Save your frequently used server connection details (excluding passwords) and load them with a single click.
* **📊 Operational Dashboard:** Visualize your operations with interactive charts (Most Analyzed Servers, Daily Activity, Connection Types).
* **🤖 Automation & Scheduling:** Schedule daily analysis tasks to run automatically in the background.
* **🔔 Proactive Alerts:** Get instant notifications via **Microsoft Teams** Webhooks when an analysis completes or fails.
* **📜 Audit Trail:** Automatically logs every operation to a local SQLite database (`pela.db`) for historical tracking.
* **🎨 Modern UI:** Features a clean, tabbed interface with a toggleable **Dark Mode**.
* **🐳 Docker Ready:** Fully containerized with timezone support for global usage.

---

## 📸 Screenshots

| **Operational Dashboard** | **Dark Mode UI** |
|:-------------------------:|:----------------:|
| ![Dashboard](docs/images/dashboard.png) | ![Dark Mode](docs/images/dark_mode.png) |

| **Connection & Profiles** | **Audit History** |
|:-------------------------:|:-----------------:|
| ![Connection](docs/images/connection.png) | ![History](docs/images/history.png) |

---

## 🛠️ Tech Stack

* **Backend:** Python, Flask, Paramiko (SSH), APScheduler, SQLite
* **Frontend:** HTML5, CSS3 (Variables), JavaScript (Vanilla), Chart.js
* **Engine:** Perl, pgBadger (Embedded in `tools/`)
* **Infrastructure:** Docker, Docker Compose

---

## ⚙️ Prerequisites

Before running PELA locally (without Docker), ensure you have:

1.  **Python 3.9+** installed.
2.  **Perl** installed (Crucial for pgBadger execution).
    * *Windows:* [Strawberry Perl](https://strawberryperl.com/)
    * *Linux:* `sudo apt install perl`

---

## 📥 Installation & Usage

## 🔑 SSH Key Setup (Passwordless Access)

PELA supports SSH keys for secure, passwordless connections.

### For Local Development (Windows/Linux)
1. Create a folder named `keys` in the project root.
2. Place your private key file named `id_rsa` inside it.
3. PELA will automatically detect and use `keys/id_rsa`.
4. And of course you have to put your `id_rsa.pub in your` -> `~/.ssh/authorized_keys` folder

### For Docker / Kubernetes
* **Docker Compose:** Place the key in the local `keys/` folder; it is automatically mounted to `/app/keys`.
* **Kubernetes:** Create a Secret named `ssh-key-secret` containing your `id_rsa` and mount it to `/app/keys`.

### Option A: Docker Deployment (Recommended)

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/eryo-dev/pela-log-analyzer
    cd pela-log-analyzer
    ```

2.  **Configure Timezone (Optional):**
    Open `docker-compose.yml` and set your local timezone (default is UTC) to ensure the Scheduler runs correctly:
    ```yaml
    environment:
      - TZ=Europe/Istanbul  # Example
    ```

3.  **Build and Run:**
    ```bash
    docker-compose up --build -d
    ```

4.  **Access:**
    Open your browser and go to `http://localhost:5000`.

---

### Option B: Local Python Setup

1.  **Create virtual environment:**
    ```bash
    python -m venv venv
    # Windows:
    .\venv\Scripts\activate
    # Linux/macOS:
    source venv/bin/activate
    ```

2.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

3.  **Run the application:**
    ```bash
    python app.py
    ```
    Access the app at: `http://127.0.0.1:5000`

---

## 🧪 Simulation Mode (Demo)

Want to test the dashboard, reporting engine, or scheduler without connecting to a real server? PELA includes a built-in **Mock Engine**.

1.  Go to the **Direct Connection** tab.
2.  Enter `TEST` in the **Target Server** field.
3.  Fill other fields with random data (e.g., User: `admin`, Pass: `123`).
4.  Click **Start Analysis** (or schedule it).

> The system will generate a realistic **Mock HTML Report** with sample data (Cache Hit Ratios, Slow Queries) and log the activity to the Audit Trail.

---

## 🔔 Integrations

### Microsoft Teams
To receive notifications:
1.  Create an **Incoming Webhook** in your Microsoft Teams channel.
2.  Copy the Webhook URL.
3.  In PELA, go to the **Notifications** section (bottom of the page).
4.  Paste the URL and click **Save**.

---

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

* Special thanks to [Gilles Darold](https://github.com/darold) for creating **pgBadger**, the powerful core analysis engine used in this project.

---
*Engineered by [Eren Yormaz](https://github.com/eryo-dev)*