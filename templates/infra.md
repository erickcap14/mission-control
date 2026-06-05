# Infrastructure Blueprint

Purpose: This file describes the project's technical foundation, including the method of hosting, the programming languages, the coding standards, and how to run the code.

> Use this file to tell your AI assistant about the environment where your application will be built and run. Fill out each section as best you can. Simple, plain English is perfect!

---

## What We're Building

> Think of this like a quick intro for a new team member. What is the app made of?

- **Programming Language:** [e.g., Python, JavaScript, etc.]
- **Main Framework/Tool:** [e.g., None, React, Next.js, Flask, etc.]
- **A Quick Summary:** [Describe the app in one simple sentence. e.g., "A simple website to track my book collection." You can also reference prd.md for full details of the project and its features.]

---

<!-- This Section is optional. Use only if developing locally. -->

## How to Run it on Your Computer

> These are the instructions for getting the app started on a local machine. It helps the AI create setup scripts and give you the right commands.

- **Installation Command:** [The single command to install everything it needs. e.g., `pip install -r requirements.txt` or `npm install`]
- **Startup Command:** [The single command to start the app. e.g., `python app.py` or `npm run dev`]
- **Local Address:** [Where can you see it running in your browser? e.g., `http://localhost:8000`]

---

## Project Architecture & Conventions

> This section outlines the file structure and architectural patterns based on the chosen framework. I've provided an EXAMPLE for Next.js

Note: The following is an example. You MUST replace this with actual information for your codebase/project:

- **Framework:** `Next.js`
- **Directory Structure:**
  - **Static Assets:** All images, fonts, and other static files **must** be placed in the `/public` directory.
  - **UI Components:** Reusable React components are located in `/src/components`.
  - **API Routes:** All server-side API logic is handled in files within the `/src/app/api` directory.
  - **Styling:** Global styles are defined in `/src/app/globals.css`. Component-specific styles should be co-located with the component using CSS Modules.

---

## Code Generation Style Guide

When writing or modifying code, I will adhere to the following standards:

- **Variable Naming:** All variable and function names will use `camelCase`.
- **File Naming:** All filenames will use `PascalCase`.
- **Comments:** I will write clear, concise comments to explain complex logic blocks.
- **Linting:** Before committing, I will run the linter with, for example, `npm run lint -- --fix` to automatically correct style issues.
- **Constants:** Global constants will be written in `UPPER_SNAKE_CASE`.

---

<!-- This Section is optional. Use only if running on a cloud provider or service platform. -->

## Where it Lives on the Internet & Who its Friends Are

> Will this app be online? Does it talk to other services? This helps the AI understand the app's neighborhood.

- **Hosting Provider:** [Where will the app be deployed? e.g., "Just on my local computer," Vercel, Railway, AWS, etc.]
- **Specific Services and Unique identifying details:** [provide the details. Are you running this using Google GKE? if so, what is the container name, cluster details, etc? Is this a static hosted website on S3? If so what is the bucket name, CloudFront distro ID, etc?]
- **External Services (its "Friends"):** [List any other tools it relies on. e.g., "None," Supabase for the database, Stripe for payments, etc.]

---

## Where Your Data is Stored

> This is one of the most important parts! How does your app remember things? This prevents the AI from trying to save files or data in the wrong place.

- **Data Storage Method:** [How is data saved? e.g., "In a CSV file named `data.csv`," "In a Supabase database," "Nowhere, it doesn't save data."]
- **Important Notes:** [Mention any rules. e.g., "User profile pictures are saved with Supabase Storage."]
- **Scheme Details:** [Provide any details about the data scehema to ensure that your ai tool has a complete picture of the data model and data architecture.]
