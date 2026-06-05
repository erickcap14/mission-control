# Product Requirements Document - File Organizer CLI Tool

Purpose: This file defines what we are building and for whom, focusing on the project's features, goals, and user experience.

---

## 1. The Big Picture (What are we making?)

* **Project Name:** FileSort - Intelligent File Organization CLI Tool
* **One-Sentence Summary:** A command-line tool that automatically organizes files in directories by type, date, or custom rules to help users maintain clean and structured file systems.
* **Who is this for?** Developers, system administrators, and power users who work with lots of files and need to keep their directories organized efficiently from the command line.
* **What this app will NOT do:** We will not modify file contents, provide a GUI interface, or sync files to cloud services. This is purely for local file organization.

---

## 2. The Features (What can it do?)

* **Story 1:** As a developer, I want to organize my Downloads folder by file type so that I can easily find documents, images, and archives in separate folders.
* **Story 2:** As a photographer, I want to organize my photos by creation date (year/month) so that I can browse my pictures chronologically.
* **Story 3:** As a system admin, I want to define custom organization rules in a config file so that I can standardize file organization across multiple directories.
* **Story 4:** As a cautious user, I want to preview what changes will be made before executing them so that I can avoid accidentally moving important files.
* **Story 5:** As a CLI user, I want detailed help documentation and examples so that I can learn how to use all the features effectively.
* **Story 6:** As someone who makes mistakes, I want to undo my last organization operation so that I can revert changes if something goes wrong.
* **Story 7:** As a user with large directories, I want to see progress indicators during long operations so that I know the tool is working.
* **Story 8:** As a power user, I want to exclude certain files or patterns from organization so that I can protect system files and important documents.

---

## 3. The Look and Feel (How should it vibe?)

* **Overall Style:** Clean, informative command-line interface with clear output and helpful messages. Think "modern Unix tool" - powerful but approachable.
* **Main Colors:** Green for success messages, yellow for warnings, red for errors, blue for information. Use colored output that can be disabled with --no-color flag.
* **Key Commands:**
    * **Command 1: `filesort organize [directory]`**
        * Organizes files by type into subdirectories
        * Shows progress bar and file count
        * Supports --dry-run flag for preview
    * **Command 2: `filesort date [directory]`**
        * Organizes files by creation/modification date
        * Creates Year/Month folder structure
        * Supports custom date formats
    * **Command 3: `filesort custom [directory] --config [file]`**
        * Uses custom rules from configuration file
        * Supports pattern matching and complex organization logic
        * Validates config before execution
    * **Command 4: `filesort undo`**
        * Reverses the last organization operation
        * Shows what will be undone before proceeding
        * Maintains operation history
    * **Command 5: `filesort --help`**
        * Comprehensive help with examples
        * Shows all available options and flags
        * Includes common use cases and patterns