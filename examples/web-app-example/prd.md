# Product Requirements Document - Task Manager Web App

Purpose: This file defines what we are building and for whom, focusing on the project's features, goals, and user experience.

> Use this file to outline what you're building and why. This guide helps you and your AI assistant understand the project goals, features, and user experience. Think of it as your project's blueprint that everyone can reference.

---

## 1. The Big Picture (What are we making?)

* **Project Name:** TaskFlow - Personal Task Management App
* **One-Sentence Summary:** A clean, intuitive web application that helps busy professionals organize their daily tasks and track their productivity.
* **Who is this for?** Working professionals aged 25-45 who need to manage multiple projects and want a simple, distraction-free task management solution.
* **What this app will NOT do:** We will not include team collaboration features, time tracking, invoicing, or complex project management features like Gantt charts. This is focused on personal productivity only.

---

## 2. The Features (What can it do?)

* **Story 1:** As a busy professional, I want to quickly add new tasks with due dates so that I can capture everything I need to do without losing focus.
* **Story 2:** As a user, I want to organize my tasks into categories (Work, Personal, Shopping) so that I can focus on one area of my life at a time.
* **Story 3:** As a productivity-focused person, I want to mark tasks as complete and see my daily progress so that I feel accomplished and motivated.
* **Story 4:** As someone with deadlines, I want to see which tasks are due soon or overdue so that I can prioritize my work effectively.
* **Story 5:** As a user who thinks visually, I want to assign colors to different task categories so that I can quickly identify what type of work I'm looking at.
* **Story 6:** As a mobile user, I want the app to work well on my phone so that I can add tasks and check things off while I'm on the go.
* **Story 7:** As a returning user, I want my tasks to be saved automatically so that I never lose my work when I close the browser.
* **Story 8:** As someone who values privacy, I want to create an account and log in so that my tasks are private and secure.

---

## 3. The Look and Feel (How should it vibe?)

* **Overall Style:** Clean, modern, and minimalist with plenty of white space. Think "Google Keep meets Todoist" - functional but beautiful.
* **Main Colors:** Primary blue (#2563eb), soft gray backgrounds (#f8fafc), green for completed tasks (#10b981), red for overdue tasks (#ef4444).
* **Key Screens:**
    * **Screen 1: Dashboard/Task List**
        * Clean header with app name and user profile
        * Filter buttons for "All", "Work", "Personal", etc.
        * Task cards showing title, due date, and category color
        * Floating "+" button to add new tasks
        * Progress indicator showing daily completion rate
    * **Screen 2: Add/Edit Task Modal**
        * Simple form with task title input
        * Due date picker (optional)
        * Category dropdown (Work, Personal, Shopping, etc.)
        * Color picker for category
        * Save and Cancel buttons
    * **Screen 3: Login/Register Page**
        * Simple email/password form
        * Google sign-in option
        * Clean branding and welcome message
    * **Screen 4: User Profile/Settings**
        * Basic profile information
        * Category management (add/edit/delete categories)
        * Theme preferences (light/dark mode)
        * Account settings and logout