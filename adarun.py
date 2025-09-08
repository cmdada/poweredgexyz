import sqlite3
import requests
from flask import Flask, request, redirect, url_for, render_template_string, session

app = Flask(__name__)
app.secret_key = "supersecretkeycausethisreallymatterswithonlyusernames" 

# --- DB Setup ---
def init_db():
    conn = sqlite3.connect("homelab.db")
    c = conn.cursor()
    c.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE
    )
    """)
    c.execute("""
    CREATE TABLE IF NOT EXISTS services (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        name TEXT,
        url TEXT,
        status TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )
    """)
    conn.commit()
    conn.close()

init_db()

# status
def check_status(url):
    try:
        r = requests.get(url, timeout=3)
        if r.status_code == 200:
            return "Running"
        else:
            return f"Error {r.status_code}"
    except Exception:
        return "Down"

# routes
@app.route("/", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form["username"].strip()
        if not username:
            return "Username required", 400

        conn = sqlite3.connect("homelab.db")
        c = conn.cursor()
        c.execute("INSERT OR IGNORE INTO users (username) VALUES (?)", (username,))
        conn.commit()
        c.execute("SELECT id FROM users WHERE username = ?", (username,))
        user_id = c.fetchone()[0]
        conn.close()

        session["user_id"] = user_id
        session["username"] = username
        return redirect(url_for("dashboard"))

    return """
    <!doctype html>
    <html>
    <head>
        <title>Login</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    </head>
    <body class="bg-light d-flex justify-content-center align-items-center vh-100">
        <div class="card shadow p-4" style="width: 22rem;">
            <h2 class="mb-3">Login</h2>
            <form method="post">
                <input class="form-control mb-2" name="username" placeholder="Enter your username">
                <button class="btn btn-primary w-100" type="submit">Login</button>
            </form>
        </div>
    </body>
    </html>
    """

@app.route("/dashboard")
def dashboard():
    if "user_id" not in session:
        return redirect(url_for("login"))

    conn = sqlite3.connect("homelab.db")
    c = conn.cursor()
    c.execute("SELECT id, name, url FROM services WHERE user_id = ?", (session["user_id"],))
    services = c.fetchall()

    # update statuses dynamically
    updated_services = []
    for s in services:
        status = check_status(s[2])
        updated_services.append((s[0], s[1], s[2], status))
        c.execute("UPDATE services SET status = ? WHERE id = ?", (status, s[0]))
    conn.commit()
    conn.close()

    template = """
    <!doctype html>
    <html>
    <head>
        <title>Dashboard</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    </head>
    <body class="bg-light">
        <div class="container py-4">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h2>Welcome, {{username}}</h2>
                <a class="btn btn-outline-danger" href="{{url_for('logout')}}">Logout</a>
            </div>

            <h3>Your Services</h3>
            <ul class="list-group mb-4">
            {% for s in services %}
                <li class="list-group-item d-flex justify-content-between align-items-center">
                    <div>
                        <b>{{s[1]}}</b> - 
                        {% if s[3] == "Running" %}
                            <span class="badge bg-success">🟢 Running</span>
                        {% elif "Error" in s[3] %}
                            <span class="badge bg-warning text-dark">🟡 {{s[3]}}</span>
                        {% else %}
                            <span class="badge bg-danger">🔴 Down</span>
                        {% endif %}
                    </div>
                    <div>
                        <a class="btn btn-sm btn-primary" href="{{s[2]}}" target="_blank">Launch</a>
                        <a class="btn btn-sm btn-outline-danger" href="{{url_for('delete_service', service_id=s[0])}}">Delete</a>
                    </div>
                </li>
            {% else %}
                <li class="list-group-item">No services yet.</li>
            {% endfor %}
            </ul>

            <h3>Add Service</h3>
            <form method="post" action="{{url_for('add_service')}}" class="card card-body shadow-sm">
                <input class="form-control mb-2" name="name" placeholder="Service name" required>
                <input class="form-control mb-2" name="url" placeholder="http://..." required>
                <button class="btn btn-success w-100" type="submit">Add</button>
            </form>
        </div>
    </body>
    </html>
    """
    return render_template_string(template, username=session["username"], services=updated_services)

@app.route("/add_service", methods=["POST"])
def add_service():
    if "user_id" not in session:
        return redirect(url_for("login"))

    name = request.form["name"].strip()
    url = request.form["url"].strip()

    conn = sqlite3.connect("homelab.db")
    c = conn.cursor()
    c.execute("INSERT INTO services (user_id, name, url, status) VALUES (?, ?, ?, ?)",
              (session["user_id"], name, url, "Unknown"))
    conn.commit()
    conn.close()

    return redirect(url_for("dashboard"))

@app.route("/delete/<int:service_id>")
def delete_service(service_id):
    if "user_id" not in session:
        return redirect(url_for("login"))

    conn = sqlite3.connect("homelab.db")
    c = conn.cursor()
    c.execute("DELETE FROM services WHERE id = ? AND user_id = ?", (service_id, session["user_id"]))
    conn.commit()
    conn.close()

    return redirect(url_for("dashboard"))

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=3158, debug=False)
