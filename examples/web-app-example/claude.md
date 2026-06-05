# Claude Context Blueprint - Task Manager Web App

Purpose: This is the main context file that tells the AI which documents to read, how to interpret their contents, and how to resolve conflicting instructions between them.
It also ensures the AI understands the **beads-based workflow architecture**, where each feature (e.g., authentication, task management, notifications) is tracked using beads (`bd`) for issue management with priorities, dependencies, and status tracking.

> Use this file as the central reference point for understanding project requirements, operating instructions, and work item tracking.

---

## Required Context Files

To fully understand the project requirements, my operating instructions, and the development plan, I must read the following files in this directory:

* **`prd.md`**: The Product Requirements Document, which details the features, UI/UX, and functional specifications for the task management web application. It identifies initial features to be tracked as beads issues (e.g., auth flow, task API, notifications UI).
* **`workflow.md`**: The development workflow, which outlines beads-based issue tracking, branching strategy, and sequential implementation of React/Firebase modules. It includes PR workflows, issue management, and integration with Git.
* **`infra.md`**: The infrastructure documentation, which describes the React + Firebase architecture, deployment to Vercel, coding standards, and operational infrastructure requirements.
* **`security.md`**: The security documentation, which defines user authentication, session handling, data protection, and security best practices for handling user tasks and personal information.
* **`sbom.md`**: The Software Bill of Materials, which provides a complete list of React libraries, Firebase services, and external dependencies used in the project.
* **`tests.md`**: The testing documentation, which outlines Jest and React Testing Library strategies, component-level test cases, and QA standards for each feature plan.

I will always consult these files to ensure I have the most accurate and current project context before performing any planning or implementation action.

---

## Issue Tracking with Beads

This project uses **beads (`bd`)** for issue tracking and work management.

**Key Commands:**

```bash
bd quickstart            # Initialize beads in the project
bd create "title" --type feature   # Create a new issue
bd list --status open    # View open issues
bd ready --json          # Get unblocked work
bd update <id> --status in_progress   # Claim work
bd close <id>            # Complete an issue
```

**Issue Types:**

| Type | Use For |
|------|---------|
| `feature` | New app modules (e.g., auth flow, task CRUD, notifications) |
| `bug` | Defects or UI issues |
| `task` | General work items |
| `chore` | Maintenance, docs, config updates |

**Example Issues for This Project:**

```bash
bd create "Implement user authentication flow" --type feature
bd create "Build task CRUD operations" --type feature
bd create "Add notification UI components" --type feature
bd create "Create dashboard layout" --type feature
bd create "Set up Firebase integration" --type task
```

**Using Dependencies:**

```bash
# Auth must be done before task management
bd create "Build task CRUD operations" --type feature --blocks TF-01
```

This allows independent tracking and deployment of distinct app modules.  

---

## Changelog Usage

* **`changelog.md`**: The project changelog tracks feature releases, version updates, and deployment summaries.
  Significant completed beads issues should be logged with their issue ID, type, and summary (e.g., `feat: implement auth flow (Closes: TF-12)`).

---

## Conflict Resolution Matrix

When instructions in different context files conflict, you **MUST** follow this order of precedence to ensure stable, safe, and consistent decision-making.

* **Priority 1 - Safety & Supply Chain:** **`security.md`** and **`sbom.md`** (User data protection & approved React/Firebase dependencies) — **Override all other documents.**
* **Priority 2 - Runtime Environment:** **`infra.md`** (React/Firebase/Vercel setup) — **Override** feature requests that conflict with architectural constraints.
* **Priority 3 - Global Conventions:** **`claude.md`** (This file - coding standards, workflow authority, and issue tracking governance) — Defines baseline project and work management rules.
* **Priority 4 - Feature Requirements:** **`prd.md`** (App features, UI/UX goals, and feature definitions) — May refine rules but **must not violate** higher-level constraints.
* **Priority 5 - Process & Workflow:** **`workflow.md`** (Beads issue management, branching strategy, and testing routines) — Governs issue execution order, error handling, and changelog updates.

---

### Conflict Resolution Process

If a conflict arises, you **MUST**:

1. **State the conflict clearly** — Identify the conflicting instructions and their source files.
2. **Apply precedence** — Resolve according to the hierarchy above.
3. **Recommend minimal edits** — Suggest the smallest viable change to harmonize instructions, starting with `prd.md` or `workflow.md`.
4. **Flag impacted issues** — If the conflict affects a specific issue, mark it as `blocked` with `bd update <id> --status blocked` and add a comment explaining the conflict.
5. **Communicate changes** — Log any resulting rule adjustments in `changelog.md` for auditability.