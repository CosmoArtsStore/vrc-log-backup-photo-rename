# Official Guide: Fundamentals & Planning

Source: *The Complete Guide to Building Skills for Claude* (Anthropic, 2026) — Chapter 1 & 2

---

## Chapter 1: Fundamentals

### What is a Skill?

A skill is a folder containing:
- `SKILL.md` (required): Instructions in Markdown with YAML frontmatter
- `scripts/` (optional): Executable code (Python, Bash, etc.)
- `references/` (optional): Documentation loaded as needed
- `assets/` (optional): Templates, fonts, icons used in output

### Core Design Principles

**Progressive Disclosure** — Three-level loading system:
1. **YAML frontmatter**: Always loaded in Claude's system prompt (~100 words). Provides just enough for Claude to know when to use the skill.
2. **SKILL.md body**: Loaded when Claude decides the skill is relevant. Full instructions and guidance.
3. **Linked files**: Additional bundled files Claude navigates only as needed.

This minimizes token usage while maintaining specialized expertise.

**Composability** — Claude can load multiple skills simultaneously. Your skill should work well alongside others, not assume it's the only capability available.

**Portability** — Skills work identically across Claude.ai, Claude Code, and API. Create once, works everywhere — provided the environment supports any dependencies.

### For MCP Builders: Skills + Connectors

| MCP (Connectivity) | Skills (Knowledge) |
|---|---|
| Connects Claude to your service | Teaches Claude how to use your service effectively |
| Provides real-time data access and tool invocation | Captures workflows and best practices |
| What Claude *can* do | How Claude *should* do it |

**Without skills:**
- Users connect your MCP but don't know what to do next
- Support tickets: "how do I do X with your integration?"
- Each conversation starts from scratch
- Inconsistent results because users prompt differently each time

**With skills:**
- Pre-built workflows activate automatically when needed
- Consistent, reliable tool usage
- Best practices embedded in every interaction
- Lower learning curve for your integration

---

## Chapter 2: Planning and Design

### Start with Use Cases

Before writing any code, identify 2-3 concrete use cases.

```
Use Case: Project Sprint Planning
Trigger: User says "help me plan this sprint" or "create sprint tasks"
Steps:
  1. Fetch current project status from Linear (via MCP)
  2. Analyze team velocity and capacity
  3. Suggest task prioritization
  4. Create tasks in Linear with proper labels and estimates
Result: Fully planned sprint with tasks created
```

Ask yourself:
- What does a user want to accomplish?
- What multi-step workflows does this require?
- Which tools are needed (built-in or MCP)?
- What domain knowledge or best practices should be embedded?

### Common Skill Use Case Categories

**Category 1: Document & Asset Creation**
- Used for: Creating consistent, high-quality output (documents, presentations, apps, designs, code)
- Real example: `frontend-design` skill
- Key techniques: embedded style guides, template structures, quality checklists, no external tools required

**Category 2: Workflow Automation**
- Used for: Multi-step processes that benefit from consistent methodology
- Real example: `skill-creator` skill
- Key techniques: step-by-step workflow with validation gates, templates, built-in review suggestions, iterative refinement loops

**Category 3: MCP Enhancement**
- Used for: Workflow guidance on top of MCP tool access
- Real example: `sentry-code-review` skill (from Sentry)
- Key techniques: coordinates multiple MCP calls in sequence, embeds domain expertise, provides context users would otherwise specify, error handling for common MCP issues

### Define Success Criteria

**Quantitative metrics** (rough benchmarks, not precise thresholds):
- Skill triggers on **90%** of relevant queries — measure by running 10-20 test queries
- Completes workflow in X tool calls — compare same task with and without skill
- 0 failed API calls per workflow — monitor MCP server logs during test runs

**Qualitative metrics:**
- Users don't need to prompt Claude about next steps
- Workflows complete without user correction
- Consistent results across sessions (new user succeeds on first try)

### Technical Requirements

**File structure:**
```
your-skill-name/
├── SKILL.md               # Required
├── scripts/               # Optional
│   ├── process_data.py
│   └── validate.sh
├── references/            # Optional
│   ├── api-guide.md
│   └── examples/
└── assets/                # Optional
    └── report-template.md
```

**Critical rules:**
- `SKILL.md` must be exactly this casing (case-sensitive; `skill.md`, `SKILL.MD` etc. will fail)
- Folder naming: kebab-case only (`notion-project-setup` ✅, `Notion Project Setup` ❌, `notion_project_setup` ❌)
- No `README.md` inside the skill folder — all docs go in `SKILL.md` or `references/`

### YAML Frontmatter Reference

**Minimal required format:**
```yaml
---
name: your-skill-name
description: What it does. Use when user asks to [specific phrases].
---
```

**All optional fields:**
```yaml
---
name: skill-name
description: Required description (max 1024 chars, no XML angle brackets)
license: MIT
allowed-tools: "Bash(python:*) Bash(npm:*) WebFetch"
metadata:
  author: Company Name
  version: 1.0.0
  mcp-server: server-name
  category: productivity
  tags: [project-management, automation]
  documentation: https://example.com/docs
  support: support@example.com
---
```

**Security restrictions — forbidden in frontmatter:**
- XML angle brackets (`<` `>`) — frontmatter appears in Claude's system prompt; malicious content could inject instructions
- Skill names containing `claude` or `anthropic` (reserved)

### Writing the Main Instructions

**Recommended template:**
```markdown
---
name: your-skill
description: [description]
---

# Your Skill Name

## Step 1: [First Major Step]
Clear explanation of what happens.

Example:
\```bash
python scripts/fetch_data.py --project-id PROJECT_ID
\```
Expected output: [describe what success looks like]

## Examples

### Example 1: [common scenario]
User says: "Set up a new marketing campaign"
Actions:
1. Fetch existing campaigns via MCP
2. Create new campaign with provided parameters
Result: Campaign created with confirmation link

## Troubleshooting
**Error:** [Common error message]
**Cause:** [Why it happens]
**Solution:** [How to fix]
```

**Best practices for instructions:**

Be specific and actionable:
```
✅ Good:
Run `python scripts/validate.py --input {filename}` to check data format.
If validation fails, common issues include:
- Missing required fields (add them to the CSV)
- Invalid date formats (use YYYY-MM-DD)

❌ Bad:
Validate the data before proceeding.
```

Include error handling, reference bundled resources clearly, use progressive disclosure (keep SKILL.md focused, move detail to `references/`).
