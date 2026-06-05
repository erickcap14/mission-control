# Claude Context Blueprint - File Organizer CLI Tool

Purpose: This is the main context file that tells the AI which documents to read, how to interpret their contents, and how to resolve conflicting instructions between them.
It also ensures the AI understands the **beads-based workflow architecture**, where work items are tracked using beads (`bd`) for issue management with priorities, dependencies, and status tracking.

---

## Required Context Files

To fully understand the project requirements, my operating instructions, and the development plan, I must read the following files in this directory:

- **`prd.md`**: The Product Requirements Document, which details the features, user stories, and command-line specifications for the file organization CLI tool. It identifies initial features to be tracked as beads issues.
- **`workflow.md`**: The development workflow, which includes beads-based issue tracking, branching strategy, and sequential task execution for implementing the Python CLI application with proper testing and distribution.
- **`infra.md`**: The infrastructure documentation, which describes the Python development setup, packaging with Poetry, and distribution via PyPI.
- **`security.md`**: The security documentation, which details file system security, input validation, and safe file operations.
- **`sbom.md`**: The Software Bill of Materials, which provides a comprehensive inventory of all Python dependencies and CLI libraries used in the project.
- **`tests.md`**: The testing documentation, which outlines pytest strategies, file operation test cases, and quality assurance procedures for the CLI functionality.

I will always consult these files to ensure I have the most up-to-date information before proceeding with any implementation or plan execution.

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
| `feature` | New CLI commands or functionality (e.g., file sorting, metadata extraction) |
| `bug` | Defects or crashes |
| `task` | General work items |
| `chore` | Maintenance, docs, config updates |

**Example Issues for This Project:**

```bash
bd create "Implement file sorting by type" --type feature
bd create "Add date-based organization" --type feature
bd create "Create custom rules config parser" --type feature
bd create "Add undo functionality" --type feature
bd create "Write CLI help documentation" --type chore
```

This ensures independent tracking and execution for each component of the CLI tool.

---

## Changelog Usage

- **`changelog.md`**: The project changelog, which tracks version history, feature additions, bug fixes, and CLI improvements throughout the development lifecycle.
  Significant completed beads issues should be logged with their issue ID, type, and summary (e.g., `feat: implement file sorting (Closes: FS-42)`).

---

## Conflict Resolution Matrix

When instructions in different context files conflict, you **MUST** follow this order of precedence:

- **Priority 1 - Safety & Supply Chain:** **`security.md`** and **`sbom.md`** (File system safety & approved Python libraries) — **Override all other documents.**
- **Priority 2 - Runtime Environment:** **`infra.md`** (Python/Poetry/PyPI setup) — **Override** feature requests that are incompatible with the tech stack.
- **Priority 3 - Global Conventions:** **`claude.md`** (This file - coding standards and workflow authority) — Defines core rules for multi-feature management.
- **Priority 4 - Feature Requirements:** **`prd.md`** (CLI features, commands, and feature definitions) — May refine global rules but **must not violate** higher-level constraints.
- **Priority 5 - Process & Workflow:** **`workflow.md`** (Development and testing process) — Governs beads issue management, branching strategy, and changelog updates.

---

### Conflict Resolution Process

If a conflict arises, you **MUST**:

1. **State the conflict clearly** — Identify the specific conflicting instructions and their source files.
2. **Apply precedence** — Use the matrix above to determine which rule or instruction governs.
3. **Recommend minimal edits** — Suggest changes to harmonize lower-priority documents first (e.g., `workflow.md` or `prd.md`), keeping the project's structure consistent.
4. **Update affected issues** — If the conflict affects a specific issue, mark it as `blocked` with `bd update <id> --status blocked` and add a comment explaining the conflict.
