# Security Blueprint

Purpose: This file establishes the security rules and best practices to keep the application and its user data safe.

> Use this file to outline the security practices for your project. Thinking about security early helps prevent problems later. This guide is for you and your AI assistant to understand the rules of the road for keeping your application and its data safe.

## 0. Baseline Best Practices

Here are a few universal rules that apply to every application and product we will build.

- **Never Hardcode Secrets:** Never write API keys, passwords, or other secrets directly in your source code.
- **Use a `.gitignore` file:** Your project's `.gitignore` file **must** include entries for any files that contain secrets, such as `.env`, `.env.local`, or `*.pem`. This prevents them from ever being committed to Git.
- **Use Environment Variables:** Load secrets from environment variables. For local development, use a `.env` file to store these variables. In production, your hosting provider (like Vercel, AWS, or GCP) will have a secure way to set them.
- **Apply the Principle of Least Privilege:** Create API keys and credentials with the minimum permissions they need to function. For example, if a key only needs to read data, do not give it permission to write or delete data.

<!--
NOTE PLEASE **Get Customized Advice** FOR YOUR PROJECT BY CONSULTING WITH EXPERTS OR ASKING AI TO HELP YOU MAKE THEM!

The best practices can vary based on your specific tools. Ask your AI assistant for recommendations tailored to your project. For example, say: "Please give me a list of security best practices that I can add to my Claude Code claude.md file for a Next.js application that uses Vercel for hosting and Supabase for its database."
-->

<!-- THE REST OF THIS DOCUMENT IS OPTIONAL, BUT HIGHLY RECOMMENDED, BASED ON THE NEEDS OF YOUR PROJECT-->

---

## 1. Data Sensitivity Level

> First, let's classify the kind of data your application will handle. This helps determine how strict our security measures need to be.

- **My Project's Data is:** [e.g., Public, Internal, Confidential, Sensitive/PII]

  - **_Example 1 (Local Python App):_**
    **My Project's Data is: Internal.** The script only processes local text files on my laptop for personal use. It does not handle any personal identifiable information (PII).

  - **_Example 2 (Next.js + Supabase App):_**
    **My Project's Data is: Sensitive/PII.** The application will store user email addresses, names, and user-generated content, which must be protected.

---

## 2. Authentication & Authorization (Who are you & what can you do?)

> **Authentication** is about verifying who a user is (like logging in). **Authorization** is about what an authenticated user is allowed to do (like viewing a specific page).

- **Authentication Method:** [e.g., None, Simple Password, OAuth, Supabase Auth]
- **Authorization Rules:** [e.g., All users can do everything, Only logged-in users can see content, Users can only edit their own data]

  - **_Example 1 (Local Python App):_**
    **Authentication Method: None.** The script is run manually by me on my personal computer. There are no "users" to authenticate.
    **Authorization Rules: N/A.**

  - **_Example 2 (Next.js + Supabase App):_**
    **Authentication Method: Supabase Auth.** Users will sign up and log in using email/password and potentially Google OAuth, managed by Supabase.
    **Authorization Rules: Users can only edit their own data.** We will use Supabase's Row-Level Security (RLS) policies to ensure a user can only query and modify data that they own (e.g., `(auth.uid() = user_id)`).

---

## 3. Dependency & Supply Chain Security

> Your project uses code from other developers (dependencies). We need a plan to make sure those dependencies are safe.

- **How We Check Dependencies:** [e.g., Manual review, `npm audit`, GitHub Dependabot]
- **Rule for Adding New Dependencies:** [e.g., Any developer can add them, Must be approved by the project lead]

  - **_Example 1 (Local Python App):_**
    **How We Check Dependencies: Manual review.** I will only use well-known libraries like `pandas` or `requests` from PyPI and will review their documentation before installing.
    **Rule for Adding New Dependencies: I will add them as needed.**

  - **_Example 2 (Next.js + Supabase App):_**
    **How We Check Dependencies: GitHub Dependabot.** Dependabot will be enabled on the repository to automatically scan for vulnerabilities in our `npm` dependencies and create pull requests to fix them. We will also run `npm audit` before deploying.
    **Rule for Adding New Dependencies: Must be approved by the project lead.** All new dependencies must be reviewed for security, maintenance status, and bundle size before being added.

---

## 4. Secrets Management & Best Practices

> "Secrets" are sensitive pieces of information like API keys, database passwords, or access tokens. We must **never** write them directly in our code or commit them to version control.

- **Where Secrets are Stored:** [e.g., In a local `.env` file, Vercel Environment Variables, AWS Secrets Manager]
- **Who Has Access to Secrets:** [e.g., Only me, The development team]

  - **_Example 1 (Local Python App):_**
    **Where Secrets are Stored: In a local `.env` file.** This file is listed in `.gitignore` so it is never committed to version control. The script loads the keys from this file at runtime.
    **Who Has Access to Secrets: Only me.**

  - **_Example 2 (Next.js + Supabase App):_**
    **Where Secrets are Stored: Supabase Project Settings & Vercel Environment Variables.** The Supabase `anon` and `service_role` keys are stored as environment variables in our Vercel project for deployment. For local development, we use a `.env.local` file, which is git-ignored.
    **Who Has Access to Secrets: The development team** has access to the Vercel project settings.
