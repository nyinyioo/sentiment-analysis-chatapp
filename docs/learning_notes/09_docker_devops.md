# Docker, Docker Compose & Jenkins CI/CD

## What Is Docker?

**The problem:** "It works on my machine." Your app works locally but fails in production because the server has a different OS, different Node version, different Python version, different system libraries.

**Docker solves this with containers.** A container packages your app + all its dependencies (exact runtime versions, config, libraries) into a single unit that runs identically anywhere Docker is installed.

### VM vs Container

**Virtual Machine (VM):**
```
Host OS
  └── Hypervisor
        ├── VM1: Guest OS + App A
        └── VM2: Guest OS + App B
```
Full OS for each app. Heavy (~GBs), slow to start (minutes).

**Container:**
```
Host OS
  └── Docker Engine (shared kernel)
        ├── Container 1: App A (just the app + libs, no full OS)
        └── Container 2: App B
```
Shares the host kernel. Lightweight (~MBs), fast to start (seconds).

---

## How Docker Works (First Principles)

Docker uses Linux kernel features:
- **Namespaces** — each container gets its own isolated view of the system (own filesystem, network, process list)
- **cgroups** — limit how much CPU/RAM a container can use

A **Docker image** is a read-only template (like a snapshot). A **container** is a running instance of an image.

```
Dockerfile → build → Image → run → Container
```

---

## The Dockerfile

```dockerfile
# From backend/rasa/Dockerfile (approximately)
FROM python:3.9           # Start from an official Python base image
WORKDIR /app              # Set working directory
COPY requirements.txt .   # Copy requirements first (layer caching)
RUN pip install -r requirements.txt  # Install dependencies
COPY . .                  # Copy app code
CMD ["python", "server.py"]  # Default command to run
```

Each line is a **layer**. Docker caches layers — if `requirements.txt` doesn't change, the `pip install` layer is reused (huge speed boost for rebuilds).

---

## Docker Compose — Running Multiple Containers

Most apps need multiple services (web server + database + cache). Running them manually is painful. `docker-compose.yml` defines and starts them all together.

From this project:
```yaml
# docker/docker-compose.yml
version: '3.8'
services:
  mongodb:
    image: mongo           # Use the official MongoDB image from Docker Hub
    container_name: mongodb
    env_file:
      - ../.env            # Load variables from the project root .env file
    ports:
      - "${MONGO_PORT:-27017}:27017"  # port from .env, fallback to 27017
    environment:
      # Credentials come from .env — NEVER hardcoded here
      MONGO_INITDB_ROOT_USERNAME: ${MONGO_ROOT_USERNAME}
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_ROOT_PASSWORD}
    volumes:
      - ./initdb.mongo:/docker-entrypoint-initdb.d/initdb.mongo
      - ./initUsers.mongo:/docker-entrypoint-initdb.d/initUsers.mongo
    networks:
      - app_network

networks:
  app_network:
    driver: bridge         # Virtual network so containers can talk to each other
```

### Why `env_file` Instead of Hardcoding?

Hardcoding credentials directly in `docker-compose.yml` is a security mistake — the file gets committed to git, and now your database password is in public version history forever (even if you delete it later, it's in `git log`).

The fix: use `${VARIABLE_NAME}` substitution. Docker Compose reads variables from the `.env` file specified in `env_file`. The `.env` is in `.gitignore` so it never gets committed. The `.env.example` file shows which variables are needed without exposing real values — that's what you commit instead.

```bash
# .env (gitignored — real values here)
MONGO_ROOT_USERNAME=iyn_nimda
MONGO_ROOT_PASSWORD=some_real_password

# .env.example (committed — shows the shape, not the values)
MONGO_ROOT_USERNAME=your_mongo_username
MONGO_ROOT_PASSWORD=your_mongo_password
```

### Common Docker Compose Commands

```bash
docker-compose up        # Start all services (foreground)
docker-compose up -d     # Start in background (detached)
docker-compose down      # Stop and remove containers
docker-compose logs      # View logs
docker-compose ps        # See running containers
```

### Volumes

```yaml
volumes:
  - ./initdb.mongo:/docker-entrypoint-initdb.d/initdb.mongo
```

Format: `host_path:container_path`

This **mounts** the local file into the container. Changes on the host are reflected in the container. Here it's used to seed the database — the MongoDB image automatically runs scripts in `/docker-entrypoint-initdb.d/` on first start.

### Ports

```yaml
ports:
  - "27017:27017"  # Expose container port 27017 as host port 27017
```

Without this, MongoDB is only accessible from within the Docker network (other containers). With this, you can also connect from your host machine (e.g., MongoDB Compass or your Node app).

### Networks

The `app_network` bridge network lets containers communicate using service names as hostnames:
```
# From inside another container, you can reach MongoDB at:
mongodb://mongodb:27017  # "mongodb" is the service name
```

---

## The Init Scripts

```
docker/
├── initdb.mongo    # Creates collections, seeds chatrooms
└── initUsers.mongo  # Creates user accounts with hashed passwords
```

These are MongoDB shell scripts that run automatically on the **first** container start. This is idempotent — if the data already exists (from a previous run with a volume), it won't run again.

---

## Jenkins — Continuous Integration (CI)

**The problem:** Everyone on a team commits code. You need to know immediately if a commit breaks something — before it merges to main, before anyone else builds on broken code.

**CI (Continuous Integration)** automatically runs your tests on every push. Jenkins is a popular open-source CI server.

### The Jenkinsfile

A `Jenkinsfile` lives in the repo root and defines the **pipeline** — a series of stages to run:

```groovy
pipeline {
    agent any  // Run on any available Jenkins agent (worker)

    environment {
        NODE_ENV = 'test'
        CI = 'true'
    }

    triggers {
        pollSCM('H/5 * * * *')  // Check for new commits every 5 minutes
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm  // Pull the latest code from git
            }
        }

        stage('Node Install') {
            steps {
                dir('backend/app') {
                    sh 'npm ci'  // Clean install (uses package-lock.json exactly)
                }
            }
        }

        stage('Node Test') {
            steps {
                dir('backend/app') {
                    sh 'npm test -- --forceExit'  // Run Jest tests
                }
            }
        }

        stage('Python Setup') {
            steps {
                sh 'python3 -m venv ${WORKSPACE}/.venv'  // Create virtualenv
                sh '${WORKSPACE}/.venv/bin/pip install -r backend/requirements-dev.txt'
            }
        }

        stage('Python Test') {
            steps {
                sh '''
                    cd backend/ml
                    PYTHONPATH=${WORKSPACE}/backend/ml/sentiment_analysis \
                        ${WORKSPACE}/.venv/bin/pytest sentiment_analysis/tests -v
                '''
            }
        }
    }

    post {
        always {
            cleanWs()  // Clean up workspace after every run
        }
    }
}
```

### Why `npm ci` Instead of `npm install`?

```bash
npm install   # Uses package.json, may update package-lock.json, may install different versions
npm ci        # Uses package-lock.json exactly, fails if it's out of sync
```

In CI you always want `npm ci` — reproducible, deterministic installs. No surprises from minor version updates.

### Why `--forceExit`?

Jest sometimes hangs after tests complete if async operations haven't cleaned up (like open database connections). `--forceExit` tells Jest to kill the process after tests finish, even if there's pending async work. It's a common CI workaround.

### Python Virtual Environment in CI

```bash
python3 -m venv ${WORKSPACE}/.venv     # Create isolated Python environment
.venv/bin/pip install -r requirements-dev.txt  # Install packages into it
.venv/bin/pytest ...                   # Use the venv's pytest
```

Virtual environments isolate Python package installations per project. Jenkins might run many different projects — without venvs, packages from one project could conflict with another.

### PYTHONPATH

```bash
PYTHONPATH=${WORKSPACE}/backend/ml/sentiment_analysis pytest ...
```

`PYTHONPATH` tells Python where to look for modules when you do `import sentiment_analysis`. Without this, pytest can't find the module to import it.

---

## CI/CD Flow

```
Developer pushes code to GitHub
    ↓
Jenkins polls GitHub every 5 minutes
    ↓ (new commit found)
Jenkins pulls latest code
    ↓
Stage: Install Node deps (npm ci)
    ↓
Stage: Run Node tests (npm test)
    ↓ (if tests pass)
Stage: Setup Python venv
    ↓
Stage: Run Python tests (pytest)
    ↓ (if all pass)
Pipeline GREEN — safe to merge
    ↓ (if any stage fails)
Pipeline RED — notifies developer
```

### CD — Continuous Deployment

This Jenkinsfile only does CI (run tests). CD would add a deployment stage:
```groovy
stage('Deploy') {
    when { branch 'main' }  // Only deploy from main
    steps {
        sh 'docker-compose up -d --build'
        // or: deploy to cloud, update Kubernetes, etc.
    }
}
```

---

## WSL2 + Docker on Windows

The connection string `mongodb://...@172.23.96.1:27017/...` uses `172.23.96.1` — this is the WSL2 host IP (the Windows machine's IP as seen from within WSL). This is a common gotcha:
- `localhost` in WSL2 = the Linux container, not Windows
- Docker Desktop on Windows exposes ports on the Windows host
- To reach them from WSL2, use the host machine's IP: `172.23.96.1` (or `$(ip route | grep default | awk '{print $3}')`)

---

## Key Docker Concepts Summary

| Term | Meaning |
|------|---------|
| Image | Blueprint for a container (like a class) |
| Container | Running instance of an image (like an object) |
| Dockerfile | Instructions to build an image |
| docker-compose.yml | Defines + runs multiple containers together |
| Volume | Mount a host path into a container |
| Port mapping | Expose container ports to the host |
| Network | Virtual network for container communication |
| Registry | Where images are stored (Docker Hub = public) |
