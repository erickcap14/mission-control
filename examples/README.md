# Example Projects

This folder contains complete example projects showing how to use the Claude Code Starter Kit templates for different types of applications.

## Available Examples

### 🌐 Web App Example (`web-app-example/`)

**TaskFlow - Personal Task Management App**

A React-based web application that demonstrates how to use the templates for a modern web app with user authentication and data persistence.

**Key Learning Points:**

- How to specify React + Firebase architecture in `infra.md`
- User story formatting for web applications in `prd.md`
- Security considerations for user data in `security.md`
- Component-based development workflow in `workflow.md`

**Template Highlights:**

- Detailed UI/UX specifications with screen mockups
- Authentication and data protection requirements
- Modern web development stack with specific versions
- Progressive web app considerations

### 🛠️ CLI Tool Example (`cli-tool-example/`)

**FileSort - Intelligent File Organization CLI Tool**

A Python command-line tool that shows how to structure templates for developer tools and system utilities.

**Key Learning Points:**

- Command-line interface design patterns in `prd.md`
- Python development and packaging setup in `infra.md`
- File system security considerations in `security.md`
- CLI testing strategies in `tests.md`

**Template Highlights:**

- Command structure and help documentation requirements
- Cross-platform Python distribution strategy
- Input validation and safe file operations
- User experience design for CLI tools

## How to Use These Examples

### 1. Study the Structure

Each example contains a complete set of populated templates. Compare them to see how the same template framework adapts to different project types.

### 2. Copy and Adapt

Use these as starting points for your own projects:

```bash
# Copy the web app example for your React project
cp -r examples/web-app-example/* /path/to/your/project/.claude

# Copy the CLI example for your Python tool
cp -r examples/cli-tool-example/* /path/to/your/project/.claude
```

### 3. Learn the Patterns

**Web Applications Focus On:**

- User experience and interface design
- Data flow and state management
- Authentication and user data security
- Responsive design and accessibility

**CLI Tools Focus On:**

- Command structure and argument parsing
- Input validation and error handling
- Cross-platform compatibility
- Installation and distribution

### 4. Customize for Your Needs

These examples are starting points. Modify them to match your specific:

- Technology preferences (Vue instead of React, Go instead of Python)
- Project requirements (different features, user types)
- Team workflows (different Git strategies, testing approaches)
- Deployment targets (different hosting, distribution methods)

## Template Comparison

| Aspect           | Web App Example                   | CLI Tool Example                      |
| ---------------- | --------------------------------- | ------------------------------------- |
| **Target Users** | End users via browser             | Developers/power users via terminal   |
| **UI/UX Focus**  | Visual design, responsive layouts | Command structure, help documentation |
| **Security**     | User authentication, data privacy | File system safety, input validation  |
| **Testing**      | User interaction testing          | Command execution testing             |
| **Distribution** | Web deployment (Vercel)           | Package managers (PyPI)               |

## Next Steps

After reviewing these examples:

1. **Choose the closest match** to your project type
2. **Copy the relevant example** to your project directory
3. **Customize the templates** with your specific requirements
4. **Use the interactive setup prompts** from `/prompts/` to refine further
5. **Start building** with Claude Code using your populated templates

## Contributing Examples

Have a great example project using these templates? We'd love to include it!

**Ideal contributions:**

- Different technology stacks (mobile apps, desktop applications)
- Different domains (e-commerce, content management, games)
- Different complexity levels (microservices, monoliths)
- Different deployment strategies (containers, serverless)

Please ensure your example includes:

- Complete template set with realistic, detailed content
- Clear explanation of what makes it unique
- Representative of real-world project requirements

---

**Ready to build something amazing?** Choose your example and start customizing! 🚀
