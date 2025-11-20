````markdown
# Contributing to PELA (PostgreSQL Enterprise Log Analyzer)

First off, thank you for considering contributing to PELA! It's people like you that make the open-source community such an amazing place to learn, inspire, and create. 🚀

Whether you're fixing a bug, improving the documentation, or adding a new feature, your help is welcome.

## 📋 Table of Contents

1. [Getting Started](#getting-started)
2. [Development Workflow](#development-workflow)
3. [Project Structure](#project-structure)
4. [Coding Standards](#coding-standards)
5. [Submission Guidelines](#submission-guidelines)
6. [Reporting Bugs](#reporting-bugs)

---

## 🚀 Getting Started

To start contributing, you need to set up the project locally.

### Prerequisites
* **Python 3.9+**
* **Perl** (Required for the `pgBadger` engine)
* **Docker** (Optional, for containerized testing)

### Local Setup

1. **Fork and Clone** the repository:
   ```bash
   git clone [https://github.com/eryo-dev/pela.git](https://github.com/eryo-dev/pela.git)
   cd pela
````

2.  **Set up a Virtual Environment:**

    ```bash
    python -m venv venv
    # Windows
    .\venv\Scripts\activate
    # Linux/macOS
    source venv/bin/activate
    ```

3.  **Install Dependencies:**

    ```bash
    pip install -r requirements.txt
    ```

4.  **Run the Application:**

    ```bash
    python app.py
    ```

    The app will be available at `http://127.0.0.1:5000`.

### Docker Setup (Recommended)

If you prefer using Docker to ensure a clean environment:

```bash
docker-compose up --build
```

The app will be available at `http://localhost:5000`.

-----

## 🛠️ Development Workflow

We follow a standard **Feature Branch** workflow:

1.  **Create a Branch:** Always create a new branch for your work.
      * `feature/new-dashboard-chart`
      * `fix/ssh-timeout-issue`
      * `docs/update-readme`
2.  **Make Changes:** Hack away\! 💻
3.  **Test:**
      * Use the **Simulation Mode** to test without a real server. Enter `TEST` in the *Target Server* field to generate mock reports.
      * Ensure `pgbadger.pl` is executable.
4.  **Commit:** Write clear, concise commit messages (see guidelines below).

-----

## 📂 Project Structure

Please respect the Clean Architecture of the project:

  * `app.py`: Main Flask application and backend logic.
  * `tools/`: External tools (e.g., `pgbadger.pl`).
  * `data/`: Stores `pela.db` (SQLite) and raw logs. **Do not commit files here.**
  * `static/`:
      * `css/`: Stylesheets.
      * `js/`: Frontend logic (`main.js`).
      * `reports/`: Generated HTML reports.
  * `templates/`: HTML files (`index.html`).

-----

## 🎨 Coding Standards

### Python (Backend)

  * Follow **PEP 8** style guidelines.
  * Use descriptive variable names (`server_ip` instead of `ip`).
  * Handle exceptions gracefully using `try-except` blocks, especially for SSH and DB operations.

### JavaScript / HTML (Frontend)

  * Keep logic in `static/js/main.js`. Avoid inline scripts in HTML.
  * Keep styles in `static/css/style.css`. Avoid inline styles.
  * Use `const` and `let` instead of `var`.

### Git Commit Messages

  * Use the [Conventional Commits](https://www.conventionalcommits.org/) format if possible:
      * `feat: Add dark mode support`
      * `fix: Resolve button alignment issue`
      * `docs: Update installation guide`
      * `refactor: Clean up app.py routes`

-----

## 📝 Submission Guidelines

### Pull Requests (PR)

1.  Push your branch to your fork.
2.  Open a Pull Request against the `main` branch of the original repository.
3.  Provide a clear description of what you changed and why.
4.  If you added a new feature, include a screenshot if possible.

-----

## 🐛 Reporting Bugs

If you find a bug, please open an Issue using the following template:

  * **Description:** What happened?
  * **Steps to Reproduce:** How can we see the bug?
  * **Expected Behavior:** What should have happened?
  * **Environment:** (OS, Docker vs Local, Python version).
  * **Logs:** Any error messages from the terminal?

-----

Thank you for contributing to PELA\! Happy coding\! 🐧

````