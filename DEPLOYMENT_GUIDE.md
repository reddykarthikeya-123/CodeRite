# Inspectra AI - Production Deployment Guide

This guide provides end-to-end instructions for deploying the Inspectra AI Document Review & Scoring Application on Linux Server(s).

## Table of Contents
1. [Prerequisites & System Setup](#1-prerequisites--system-setup)
2. [Backend Deployment (FastAPI)](#2-backend-deployment-fastapi)
3. [Frontend Deployment (React + Vite)](#3-frontend-deployment-react--vite)
4. [Nginx Reverse Proxy Configuration](#4-nginx-reverse-proxy-configuration)
5. [Process Management (Systemd)](#5-process-management-systemd)

---

## 1. Prerequisites & System Setup

The backend AI parsing engine requires native C++ imaging libraries to process PDFs and scan embedded diagrams via OCR. 

Run the following on your Linux server to prepare the environment:

```bash
sudo apt update
sudo apt install -y python3-pip python3-venv git nginx
sudo apt install -y tesseract-ocr poppler-utils
sudo apt install -y libreoffice libreoffice-writer fonts-liberation fonts-dejavu-core
```

Optional (for closer Microsoft Office layout parity in converted DOCX pagination):
```bash
sudo apt install -y ttf-mscorefonts-installer
```

*Note: If `tesseract-ocr` and `poppler-utils` are not installed, the application will not crash, but it will be physically unable to read images embedded inside uploaded documents. If `libreoffice` is missing, DOCX page-number references will be disabled.*

---

## 2. Backend Deployment (FastAPI)

### A. Clone and Setup
Place the application files on your server (e.g., `/var/www/coderite`).

```bash
cd /var/www/coderite/backend

# Create an isolated Python environment
python3 -m venv venv
source venv/bin/activate

# Install all required Python packages
pip install -r requirements.txt

# Install Gunicorn for production-grade serving
pip install gunicorn
```

### B. Environment Configuration
Create the secure `.env` file for the backend.

```bash
nano .env
```

Add your production database and AI routing keys:
```env
# Point this to your actual production PostgreSQL database
DATABASE_URL="postgresql+asyncpg://<username>:<password>@<db-host>:5432/CodeRite"

# Point this to your GPU server running Ollama
OLLAMA_BASE_URL="http://<ollama-server-ip>:11434"

# LibreOffice binary used for DOCX -> PDF conversion
SOFFICE_PATH="/usr/bin/soffice"

# Timeout (seconds) for DOCX -> PDF conversion
DOCX_CONVERT_TIMEOUT_SEC=90

# If true, DOCX analysis fails when pagination conversion fails
DOCX_PAGINATION_REQUIRED=false

# Vision routing controls (pure prompt+parsing path)
LLM_VISION_MODE=auto
LLM_VISION_MODEL_ALLOWLIST="gpt-4o,gpt-4.1,gemini-1.5,gemini-2.0,gemini-2.5,llava,vision"
LLM_VISION_MODEL_BLOCKLIST=""
LLM_VISION_MAX_IMAGES_PER_REQUEST=6

# OCR extraction policy for PDF page images
PDF_OCR_MODE=always
PDF_OCR_MIN_TEXT_CHARS_PER_PAGE=120
PDF_OCR_MAX_PAGES=100
```

---

## 3. Frontend Deployment (React + Vite)

### A. Install Node.js
If Node.js is not installed on the server hosting the frontend:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### B. Environment Configuration & Build
Navigate to the frontend directory:
```bash
cd /var/www/coderite/frontend
npm install
```

Create the frontend `.env` file **before** building, so the URLs are hardbaked into the static JavaScript.

```bash
nano .env
```

```env
# Hides the settings gear icon from standard end-users
VITE_HIDE_SETTINGS_BUTTON=true

# CRITICAL: This must be the public URL where your Backend API is accessible
VITE_API_BASE_URL="http://<public-backend-ip-or-domain>/api"
```

Build the static production files:
```bash
npm run build
```
This generates a `dist/` folder containing the optimized application.

---

## 4. Nginx Reverse Proxy Configuration

You should serve the built React app statically using Nginx, and proxy API requests to the Python backend.

```bash
sudo nano /etc/nginx/sites-available/coderite
```

Paste the following configuration (replace `<your-domain>`):

```nginx
server {
    listen 80;
    server_name <your-domain-or-ip>;

    # Allow large document uploads (Apply to entire server block)
    client_max_body_size 50M;

    # Serve the static React application
    location / {
        root /var/www/coderite/frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to the FastAPI Backend
    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
    }
}
```

Enable the site and restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/coderite /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## 5. Process Management (Systemd)

To ensure the Python backend starts automatically if the server reboots, configure it as a Systemd service.

```bash
sudo nano /etc/systemd/system/coderite-backend.service
```

```ini
[Unit]
Description=Gunicorn daemon for Inspectra AI API
After=network.target

[Service]
User=ubuntu
Group=www-data
WorkingDirectory=/var/www/coderite/backend
Environment="PATH=/var/www/coderite/backend/venv/bin"
ExecStart=/var/www/coderite/backend/venv/bin/gunicorn main:app --workers 4 --worker-class uvicorn.workers.UvicornWorker --bind 127.0.0.1:8000 --timeout 300

[Install]
WantedBy=multi-user.target
```

Enable and start the background service:
```bash
sudo systemctl start coderite-backend
sudo systemctl enable coderite-backend
sudo systemctl status coderite-backend
```

### ✅ Deployment Complete
You can now access the Inspectra AI platform by navigating to your domain or server IP in a web browser.
