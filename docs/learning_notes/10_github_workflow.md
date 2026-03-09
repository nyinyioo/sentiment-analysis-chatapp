# GitHub Workflow — Agile, Issues, CI/CD & Branch Strategy

## What is Agile?

**The problem:** Software projects fail when work is unstructured — no priorities, no feedback loops, no visibility into what's done vs. broken. Teams ship late, miss bugs, and lose track of scope.

**Agile solves this with iterative, incremental delivery.** Instead of planning everything upfront and shipping once, you break work into short cycles called **sprints**, prioritize ruthlessly, and ship continuously.

Agile is a mindset, not a tool. The core values from the Agile Manifesto:
```
→ Working software over comprehensive documentation
→ Responding to change over following a plan
→ Individuals and interactions over processes and tools
→ Customer collaboration over contract negotiation
```

### Key Agile Concepts

**Sprint** — a fixed time-box (1–2 weeks) with a defined scope of work. You commit to a set of tasks, complete them, and review.

**Backlog** — the full list of work to be done, prioritized by importance. Not everything in the backlog is in the current sprint.

**Epic → Story → Task hierarchy:**
```
Epic   — large body of work (e.g. "Codacy Remediation")
  └── Story  — a user-facing goal (e.g. "Fix all security vulnerabilities")
        └── Task   — a concrete unit of work (e.g. "Fix NoSQL injection in Database.js")
```

**Definition of Done** — a task is only "done" when it meets a standard: code written, tests pass, CI green, PR merged. Not just "I wrote the code."

---

## How is Agile Methodology Used in Our Context?

This project uses GitHub's native tooling to run a real Agile sprint — no external tools needed. The workflow maps directly to Agile concepts:

```
Agile Concept          →  Our Implementation
─────────────────────────────────────────────────────
Sprint scope           →  Codacy Sprint 1 (Milestone)
Backlog                →  GitHub Issues
Priority order         →  Critical → High → Medium → Minor
Task branch            →  fix/#1-nosql-injection
Definition of Done     →  Codacy CI passes + PR merged
Task closure           →  "closes #1" in commit auto-closes issue
Progress tracking      →  Milestone % (0% → 100%)
```

### The Full Sprint Workflow

```
1. Scan produces findings (Codacy report)
        ↓
2. Create Milestone → "Codacy Sprint 1"
        ↓
3. Create GitHub Issues for each finding/group
   tag with labels: security | best-practice | dependency | error-prone
   assign to milestone
        ↓
4. Pick highest priority open issue → move to "In Progress"
        ↓
5. Create a feature branch
   git checkout -b fix/#1-nosql-injection
        ↓
6. Make the fix, commit with issue reference
   git commit -m "fix: resolve NoSQL injection in Database.js - closes #1"
        ↓
7. Push → CI pipeline triggers (Codacy runs)
        ↓
8. CI passes → open Pull Request → merge into main
        ↓
9. "closes #1" → GitHub auto-closes the issue
   Milestone progress bar advances
        ↓
10. Repeat until Milestone = 100%
```

---

## GitHub Issues

Issues are the unit of work in GitHub's Agile workflow. Each issue represents one bug, feature, or task.

### Anatomy of a Good Issue

```
Title:   [CRITICAL] NoSQL Injection in Database.js
Labels:  security
Milestone: Codacy Sprint 1

Description:
  File: backend/app/Database.js
  Lines: 33, 45, 64, 85

  Untrusted user input passed directly into findOne() without sanitization.
  This allows an attacker to inject MongoDB operators (e.g. { $gt: "" })
  and bypass authentication or access unauthorized data.

  Fix: validate and sanitize all inputs before passing to MongoDB queries.

  Codacy severity: CRITICAL
```

### Labels

Labels categorize issues for filtering and reporting:

```
security       → vulnerabilities, CVEs, injection risks
best-practice  → code style, ESM imports, linting
dependency     → insecure or outdated npm/pip packages
error-prone    → patterns likely to cause runtime bugs
ci-cd          → pipeline, GitHub Actions, Docker config
```

### Milestones

A milestone groups issues into a sprint with a due date and progress bar.

```
Milestone: Codacy Sprint 1
Due: March 10, 2026
Progress: 12/47 issues closed = 25%
```

The milestone gives a single view of sprint health — how much is done, what's left.

---

## Branch Protection + Feature Branches

### Why Branch Protection on Main?

Direct commits to `main` are dangerous — one bad push can break production. Branch protection rules enforce a quality gate:

```
main (protected)
  → no direct pushes allowed
  → changes only enter via Pull Request
  → PR requires: CI to pass (Codacy green)
```

This means every change to `main` has been reviewed and tested. It's the same rule used on professional engineering teams.

### Feature Branch Naming Convention

```
fix/#[issue-number]-[short-description]

Examples:
  fix/#1-nosql-injection-database
  fix/#2-pin-github-actions-sha
  fix/#3-esm-import-migration
  fix/#4-update-insecure-dependencies
```

The issue number in the branch name creates a clear trail: branch → commit → PR → issue → milestone.

### Branch Lifecycle

```
git checkout main
git pull origin main                          
# always start from latest main
git checkout -b fix/#1-nosql-injection        
# create feature branch

# make your changes...

git add .
git commit -m "fix: resolve NoSQL injection in Database.js - closes #1"
git push origin fix/#1-nosql-injection        
# push triggers CI
# open PR on GitHub
# CI runs → Codacy analyzes the diff
# CI passes → merge PR → issue #1 auto-closes
# delete branch
```

---

## CI/CD with GitHub Actions + Codacy

### What is CI/CD?

**CI (Continuous Integration)** — automatically build and test every push. Catch breaks immediately, before they reach main.

**CD (Continuous Deployment)** — automatically deploy passing builds. This pipeline currently covers CI only; CD would add a deploy stage gated to `main`.

### Pipeline Overview

This project runs **3 parallel jobs** on every push and pull request to `master`:

```
git push / pull_request
        ↓
GitHub Actions triggers ci.yml
        ↓
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  node-test      │  │  python-test    │  │ codacy-analysis │
│                 │  │                 │  │                 │
│ npm ci          │  │ pip install     │  │ ESLint via      │
│ Jest + coverage │  │ pytest +coverage│  │ Codacy CLI      │
│ upload to Codacy│  │ upload to Codacy│  │                 │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         └───────────────────→┴←───────────────────┘
                              ↓
                   All 3 pass → PR mergeable
                   Any fail   → PR blocked
```

Jobs run in parallel — they don't wait for each other. All three must be green before branch protection allows a merge into `main`.

---

### Job 1: Node.js Tests (`node-test`)

```yaml
node-test:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4

    - name: Set up Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20'
        cache: 'npm'
        cache-dependency-path: backend/app/package-lock.json

    - name: Install dependencies
      run: npm ci --prefix backend/app

    - name: Run Jest tests with coverage
      working-directory: backend/app
      run: npm run test:coverage -- --forceExit

    - name: Upload coverage to Codacy
      uses: codacy/codacy-coverage-reporter-action@v1
      with:
        project-token: ${{ secrets.CODACY_PROJECT_TOKEN }}
        coverage-reports: backend/app/coverage/lcov.info
```

**Step by step:**

`actions/checkout@v4` — clones the repo into the CI runner. Without this, there's no code to work with.

`actions/setup-node@v4` — installs Node 20 on the runner and enables npm caching. The `cache-dependency-path` points to the lock file so GitHub knows when to invalidate the cache (if `package-lock.json` changes, cache is busted and deps reinstall fresh).

`npm ci --prefix backend/app` — installs dependencies from the lock file exactly. `--prefix` tells npm where `package.json` lives without needing to `cd` first.

```bash
# Why npm ci and not npm install?
npm install   # resolves from package.json, may update lock file, non-deterministic
npm ci        # installs exactly what's in package-lock.json, fails if out of sync
              # always use npm ci in CI 
```

`npm run test:coverage -- --forceExit` — runs Jest and generates a coverage report in `lcov` format under `coverage/`. `--forceExit` kills the process after tests complete even if async handles (like open DB connections) haven't closed — common in CI to prevent hangs.

`codacy-coverage-reporter-action` — reads `coverage/lcov.info` (the coverage report Jest generated) and ships it to Codacy. This is how Codacy knows what percentage of your code is covered by tests and can flag regressions.

```
lcov.info = line-by-line coverage map
  → which lines were executed during tests
  → which were never hit (untested code)
Codacy reads this and shows coverage % per file
```

---

### Job 2: Python Tests (`python-test`)

```yaml
python-test:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4

    - name: Set up Python
      uses: actions/setup-python@v5
      with:
        python-version: '3.12'
        cache: 'pip'
        cache-dependency-path: backend/requirements.txt

    - name: Install dependencies
      run: |
        python -m pip install --upgrade pip
        pip install pytest pytest-mock pytest-cov

    - name: Run pytest with coverage
      working-directory: backend/ml
      env:
        PYTHONPATH: ${{ github.workspace }}/backend/ml/sentiment_analysis
      run: pytest sentiment_analysis/tests -v --disable-warnings --cov=sentiment_analysis --cov-report=xml:coverage.xml

    - name: Upload coverage to Codacy
      uses: codacy/codacy-coverage-reporter-action@v1
      with:
        project-token: ${{ secrets.CODACY_PROJECT_TOKEN }}
        coverage-reports: backend/ml/coverage.xml
```

**Step by step:**

`actions/setup-python@v5` — installs Python 3.12 and caches pip packages keyed to `requirements.txt`. Same principle as Node caching — only reinstalls when the dependency file changes.

`pip install pytest pytest-mock pytest-cov` — installs only the test dependencies needed in CI, not the full `requirements.txt` (which includes heavy ML packages like Rasa). Keeps CI fast.

```bash
# pytest flags explained:
-v                          # verbose — shows each test name as it runs
--disable-warnings          # suppress deprecation noise in CI output
--cov=sentiment_analysis    # measure coverage for this module
--cov-report=xml:coverage.xml  # output in Cobertura XML format (Codacy reads this)
```

`PYTHONPATH: ${{ github.workspace }}/backend/ml/sentiment_analysis` — tells Python where to look for module imports. Without this, `import sentiment_analysis` fails because Python doesn't know the project root.

```
github.workspace = the root of the checked-out repo on the runner
  e.g. /home/runner/work/repo-name/repo-name
```

`coverage.xml` vs `lcov.info` — Node generates lcov format, Python generates Cobertura XML. Both are standard coverage formats. Codacy accepts both.

---

### Job 3: Codacy Static Analysis (`codacy-analysis`)

```yaml
codacy-analysis:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4

    - name: Run Codacy Analysis CLI
      uses: codacy/codacy-analysis-cli-action@v4
      with:
        project-token: ${{ secrets.CODACY_PROJECT_TOKEN }}
        tool: eslint
        run-docker-tools: false
```

**This job is different from the coverage jobs.** Coverage reporters tell Codacy *how much* of your code is tested. The analysis CLI actually *runs the linter* (ESLint here) and reports code quality issues — the findings you see in the Codacy dashboard.

`tool: eslint` — runs only ESLint, not the full Codacy toolchain. Keeps it focused and fast.

`run-docker-tools: false` — Codacy can run some analysis tools inside Docker containers. Disabled here to avoid Docker-in-Docker complexity on the runner.

```
Two separate Codacy feedback loops:
  coverage-reporter  → "X% of your code has tests"
  analysis-cli       → "These lines have quality/security issues"
Both feed the same Codacy dashboard.
```

---

### Triggers

```yaml
on:
  push:
    branches: [master]
  pull_request:
    branches: [master]
```

The pipeline runs in two situations:

`push` to `master` — runs after a merge. Validates the merged state of main is still green.

`pull_request` targeting `master` — runs on the feature branch *before* merge. This is the gate. If any job fails here, branch protection blocks the PR from merging.

```
Feature branch push   → no pipeline (just your code)
PR opened/updated     → pipeline runs → must pass to merge
Merge to master       → pipeline runs again → confirms main is healthy
```

---

### Secrets

```yaml
project-token: ${{ secrets.CODACY_PROJECT_TOKEN }}
```

The Codacy token authenticates your repo to Codacy's API. It's stored in GitHub's encrypted secrets store (`Settings → Secrets → Actions`), never hardcoded in the YAML. If it were in the YAML, it would be committed to version history and anyone with repo access could use it.

```
${{ secrets.NAME }}  →  GitHub injects the value at runtime
                         it never appears in logs or diffs
```

---

### Why Pin GitHub Actions to a Full Commit SHA

One of our Codacy findings flags this pattern:

```yaml
# UNSAFE — "v1" is a mutable tag, can be changed by the action author
uses: codacy/codacy-coverage-reporter-action@v1

# SAFE — full SHA is immutable, pinned to an exact commit forever
uses: codacy/codacy-coverage-reporter-action@89d6c85cfafaec52c1b88d71cd0f86bf301a5491
```

A mutable tag like `@v1` means a third-party repo could push malicious code to that tag and your CI would silently run it on the next trigger. Pinning to a full SHA means you always run exactly the code you reviewed — it cannot change without you updating the SHA manually.

### Pinning the Mongo Docker Image

```dockerfile
# UNSAFE — mongo:latest changes every release, breaks reproducibility
FROM mongo:latest

# SAFE — pinned to a specific release
FROM mongo:7.0.5
```

`latest` causes non-deterministic builds. Your container might work today and silently break tomorrow when `latest` points to a new major version. Pinning ensures every environment — local, CI, production — runs identical infrastructure.

---

## Commit Message Convention

Good commit messages make `git log` readable and enable automation (like auto-closing issues).

```
Format:
  type: short description - closes #[issue]

Types:
  fix      → bug fix
  feat     → new feature
  chore    → dependency updates, config changes
  refactor → code restructure, no behavior change
  docs     → documentation only
  ci       → CI/CD changes

Examples:
  fix: resolve NoSQL injection in Database.js - closes #1
  chore: pin GitHub Actions to full commit SHA - closes #2
  refactor: convert require() to ESM imports in server.js - closes #3
  chore: update qs to 6.14.1, minimatch to 10.2.1 - closes #4
```

The `closes #1` keyword is parsed by GitHub — when the PR merges into `main`, issue #1 is automatically closed and the milestone progress bar advances.

---

## Grouping Issues for Efficiency

Not every finding needs its own branch and PR. Smart grouping reduces overhead while keeping changes logical and reviewable.

```
Issue #1 — [CRITICAL/HIGH] Security Vulnerabilities
  → NoSQL injection x4 (Database.js)
  → One branch: fix/#1-security-nosql-injection

Issue #2 — [HIGH] Insecure Dependencies
  → qs, minimatch, uglify-js, atob, rasa CVEs
  → One branch: fix/#2-dependency-updates
  → One commit per package, or one bulk npm/pip update

Issue #3 — [HIGH/MEDIUM] CI/CD & Docker Hardening
  → Pin GitHub Actions SHA x2
  → Pin mongo:latest → version tag
  → apt-get --no-install-recommends + version pin
  → One branch: fix/#3-cicd-docker-hardening

Issue #4 — [MEDIUM] ESM Import Migration
  → 31 require() → import conversions across all files
  → Can batch by directory or file
  → One branch: fix/#4-esm-import-migration

Issue #5 — [HIGH] Numeric Literal Runtime Error
  → Database.test.js line 207
  → One branch: fix/#5-numeric-literal-test
```

This gives you 5 clean PRs instead of 47, while keeping each PR focused on a logical change that's easy to review and roll back if needed.

---

## Key Concepts Summary

| Concept | What It Is |
|---|---|
| Sprint | Fixed time-box of prioritized work with a defined scope |
| Milestone | GitHub's sprint container — groups issues, tracks % complete |
| Issue | One unit of work — bug, task, or feature |
| Label | Category tag for filtering (security, best-practice, etc.) |
| Feature branch | Isolated branch per issue — keeps main stable |
| Branch protection | Enforces CI pass + PR review before merging to main |
| `closes #N` | Magic keyword — auto-closes linked issue on PR merge |
| Commit SHA pin | Immutable reference to exact code in a GitHub Action |
| `npm ci` | Deterministic install from lock file — always used in CI |
| `--forceExit` | Kills Jest after tests complete — prevents CI hangs from open async handles |
| `lcov.info` | Node/Jest coverage format — line-by-line map of what tests hit |
| `coverage.xml` | Python/pytest coverage format (Cobertura XML) — same idea, different format |
| `PYTHONPATH` | Tells Python where to find modules — required for pytest to resolve imports |
| `github.workspace` | GitHub Actions variable — absolute path to the checked-out repo on the runner |
| Coverage reporter | Ships test coverage data to Codacy — tracks % covered over time |
| Analysis CLI | Runs ESLint via Codacy — produces the issue findings in the dashboard |
| `${{ secrets.X }}` | GitHub encrypted secret — injected at runtime, never exposed in logs or diffs |
| Definition of Done | CI green + PR merged = task complete, not just "code written" |