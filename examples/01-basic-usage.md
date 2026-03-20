# Examples

Real-world examples of using DeepSeek Brain Skill.

---

## 01. Basic Usage

### Hello World

```bash
deepseek "create a hello world Python script and run it"
```

**Expected output:**
```bash
$ cat > hello.py << 'EOF'
print("Hello, World!")
EOF
$ python hello.py
→ Hello, World!
```

### File Operations

```bash
deepseek "create a directory called project, then create README.md with a title"
```

---

## 02. Web Development

### Flask API

```bash
deepseek "create a Flask REST API with endpoints for /hello and /health"
```

**What DeepSeek will do:**
1. Create project structure
2. Install Flask
3. Create app.py with routes
4. Test the endpoints

### React App

```bash
deepseek "scaffold a React app with Vite and Tailwind CSS"
```

**What DeepSeek will do:**
1. Run `npm create vite@latest`
2. Install dependencies
3. Configure Tailwind
4. Create sample component

### Next.js + Auth

```bash
deepseek "create a Next.js app with user authentication using NextAuth"
```

---

## 03. System Administration

### Nginx Setup

```bash
deepseek "install nginx, configure it for my app, and start the service"
```

**Commands DeepSeek might run:**
```bash
apt install nginx -y
cat > /etc/nginx/sites-available/myapp << 'EOF'
server {
    listen 80;
    server_name example.com;
    location / {
        proxy_pass http://localhost:3000;
    }
}
EOF
ln -s /etc/nginx/sites-available/myapp /etc/nginx/sites-enabled/
systemctl restart nginx
```

### Docker Container

```bash
deepseek "create a Dockerfile for my Python app and build the image"
```

### SSL Certificate

```bash
deepseek "install certbot and get an SSL certificate for my domain"
```

---

## 04. Data Processing

### CSV Analysis

```bash
deepseek "analyze this sales.csv and create a summary report"
```

**What DeepSeek will do:**
1. Read CSV with pandas
2. Calculate statistics
3. Generate summary report
4. Create visualizations (optional)

### JSON Transformation

```bash
deepseek "convert this API response JSON to a formatted Markdown table"
```

### Log Analysis

```bash
deepseek "analyze nginx access.log and show top 10 IPs and most requested URLs"
```

---

## 05. Code Refactoring

### Python Modernization

```bash
deepseek "refactor this Python code to use type hints and async/await"
```

### JavaScript → TypeScript

```bash
deepseek "convert this JavaScript file to TypeScript with proper types"
```

### Add Tests

```bash
deepseek "add pytest tests for all functions in utils.py"
```

---

## 06. Debugging

### Fix Crashing App

```bash
deepseek "my Flask app crashes on startup. Check logs/ and fix the issue"
```

### Performance Investigation

```bash
deepseek "profile this Python script and identify bottlenecks"
```

### Memory Leak

```bash
deepseek "find the memory leak in this Node.js application"
```

---

## 07. DevOps

### CI/CD Pipeline

```bash
deepseek "create a GitHub Actions workflow that runs tests and deploys to production"
```

**Files created:**
- `.github/workflows/ci.yml`
- `.github/workflows/deploy.yml`

### Database Migration

```bash
deepseek "create a database migration script for adding a users table"
```

### Monitoring Setup

```bash
deepseek "set up Prometheus and Grafana for monitoring my app"
```

---

## 08. Security

### Vulnerability Scan

```bash
deepseek "scan my Python dependencies for known vulnerabilities"
```

### Firewall Configuration

```bash
deepseek "configure ufw firewall to allow only SSH, HTTP, and HTTPS"
```

### SSH Key Setup

```bash
deepseek "generate SSH keys and add to GitHub"
```

---

## 09. Machine Learning

### Model Training

```bash
deepseek "train a sentiment analysis model on this dataset"
```

### Data Preprocessing

```bash
deepseek "clean and preprocess this dataset for ML training"
```

### Model Deployment

```bash
deepseek "deploy this sklearn model as a REST API"
```

---

## 10. Automation

### Daily Report

```bash
deepseek "create a script that generates a daily report of system metrics"
```

### Backup Script

```bash
deepseek "create a backup script that archives my project and uploads to S3"
```

### Auto-Deploy

```bash
deepseek "create a script that pulls latest code, runs migrations, and restarts the app"
```

---

## Tips for Better Results

### 1. Be Specific

❌ "make an app"
✅ "create a Flask API with /users and /posts endpoints, using SQLite"

### 2. Chain Related Tasks

❌ "create directory" ... "now create file" ... "now install deps"
✅ "scaffold a complete React project with all dependencies installed"

### 3. Provide Context

✅ "In the project/ directory, there's a broken app.py. Fix the import errors and run it"

### 4. Use Reset for New Topics

```bash
deepseek --reset "new task: create a Discord bot"
```

### 5. Review Commands

Watch the output to see what commands DeepSeek runs. Learn from them!

---

## Community Examples

Have a great example? Submit a PR to add it here!
