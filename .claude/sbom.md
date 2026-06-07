<!-- PLEASE NOTE: ALL DATA PROVIDED HERE IS AN EXAMPLE! REMOVE AND POPULATE FOR YOUR APPLICATION OR PROJECT! -->

# Software Bill of Materials (SBOM) Blueprint

Purpose: This file lists all the approved technologies, libraries, and dependencies that can be used in the project, including their specific versions.

> Use this file to define the approved technologies and dependencies for your project. This helps ensure consistency and security across your development environment. The AI developer must adhere to this list and the specified versions described.

---

## 0. Technology Stack Overview

This section provides a comprehensive view of all approved technologies, frameworks, and libraries that can be used in this project. Each component has been carefully selected for security, performance, and maintainability.

| Category            | Component Name          | Version   | Rationale / Usage                                           |
| :------------------ | :---------------------- | :-------- | :---------------------------------------------------------- |
| **Language**        | `JavaScript (Node ESM)` | —         | Single language across backend, collector, and frontend.    |
| **Runtime**         | `Node.js`               | `>= 18`   | Backend, collector, and scripts. Requires global `fetch` (Node 18+). |
| **Framework**       | `express`               | `^4.18.2` | HTTP server: ingest, read APIs, static hosting, SSE.        |
| **Database**        | `PostgreSQL`            | `16`      | Persistent store on the host (run via Docker Compose).      |
| **Database Client** | `pg`                    | `^8.13.1` | PostgreSQL driver / connection pool (`lib/db.js`).          |
| **Key Library**     | `chokidar`              | `^3.6.0`  | File watcher for `~/.claude/**/*.jsonl` in the collector.   |
| **UI Library**      | `React`                 | `18.x`    | CDN UMD build, `React.createElement` (no JSX, no bundler).  |
| **Infra**           | `Docker / Compose`      | —         | Runs local PostgreSQL on the host (`docker-compose.yml`).   |
| **Built-ins (no dep)** | `crypto`, `fs`, `readline` | —    | Auth hashing/cookies, `.env` loader, JSONL streaming — used **instead of** `bcrypt`/`express-session`/`dotenv` to keep the dependency surface small. |

---

## 1. Version Management & Updates

To keep the project secure and stable, we'll manage updates carefully.

- **Update Strategy:** Dependencies will be updated manually. Before updating a major version (e.g., from `1.x` to `2.x`), we will test the application to ensure nothing breaks.
- **Security Scanning:** We will periodically run `npm audit` (for Node.js) or a similar command for other languages to check for known security vulnerabilities.

---

## 2. Documentation & Resources

This section provides links to essential documentation and resources for the technologies used in this project.

- **Core Framework Documentation:**

  - **Tailwind CSS Docs:** https://tailwindcss.com/docs
  - **React Testing Library Docs:** https://testing-library.com/docs/react-testing-library/intro/
  - **Next.js Documentation:** https://nextjs.org/docs
  - **Supabase Documentation:** https://supabase.com/docs

- **Development Tools:**
  - **TypeScript Handbook:** https://www.typescriptlang.org/docs/
  - **Node.js Documentation:** https://nodejs.org/docs/
  - **Python Documentation:** https://docs.python.org/

<!-- Add More here as needed! -->
