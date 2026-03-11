# Official Guide: Patterns & Troubleshooting

Source: *The Complete Guide to Building Skills for Claude* (Anthropic, 2026)

---

## Writing Effective Descriptions

The description field is the **#1 factor** determining whether a skill triggers. It must contain both:
- **What** the skill does
- **When** to use it (trigger phrases)

### Good examples

```yaml
# Specific + actionable
description: Analyzes Figma design files and generates developer handoff documentation.
  Use when user uploads .fig files, asks for "design specs", "component documentation",
  or "design-to-code handoff".

# Includes trigger phrases
description: Manages Linear project workflows including sprint planning, task creation,
  and status tracking. Use when user mentions "sprint", "Linear tasks", "project
  planning", or asks to "create tickets".

# Clear value proposition
description: End-to-end customer onboarding workflow for PayFlow. Handles account
  creation, payment setup, and subscription management. Use when user says
  "onboard new customer", "set up subscription", or "create PayFlow account".
```

### Bad examples

```yaml
# Too vague
description: Helps with projects.

# Missing trigger conditions
description: Creates sophisticated multi-page documentation systems.

# Too technical, no user triggers
description: Implements the Project entity model with hierarchical relationships.
```

### Debugging undertriggering

Ask Claude: *"When would you use the [skill name] skill?"*
Claude will quote the description back. Adjust based on what's missing.

---

## 5 Workflow Patterns

### Pattern 1: Sequential Workflow Orchestration

**Use when**: Users need multi-step processes in a specific order.

```markdown
# Workflow: Onboard New Customer

## Step 1: Create Account
Call MCP tool: `create_customer`
Parameters: name, email, company

## Step 2: Setup Payment
Call MCP tool: `setup_payment_method`
Wait for: payment method verification

## Step 3: Create Subscription
Call MCP tool: `create_subscription`
Parameters: plan_id, customer_id (from Step 1)

## Step 4: Send Welcome Email
Call MCP tool: `send_email`
Template: welcome_email_template
```

Key techniques: explicit step ordering, dependencies between steps, validation at each stage, rollback instructions for failures.

---

### Pattern 2: Multi-MCP Coordination

**Use when**: Workflows span multiple services.

```markdown
# Design-to-Development Handoff

## Phase 1: Design Export (Figma MCP)
1. Export design assets from Figma
2. Generate design specifications
3. Create asset manifest

## Phase 2: Asset Storage (Drive MCP)
1. Create project folder in Drive
2. Upload all assets
3. Generate shareable links

## Phase 3: Task Creation (Linear MCP)
1. Create development tasks
2. Attach asset links to tasks
3. Assign to engineering team

## Phase 4: Notification (Slack MCP)
1. Post handoff summary to #engineering
2. Include asset links and task references
```

Key techniques: clear phase separation, data passing between MCPs, validation before moving to next phase, centralized error handling.

---

### Pattern 3: Iterative Refinement

**Use when**: Output quality improves with iteration.

> ⚠️ **Antigravity**: `scripts/` ディレクトリは使用不可。validation stepは「エージェントに項目を口頭でチェックさせる」か、MCP経由の外部ツールで代替すること。

```markdown
# Iterative Report Creation

## Initial Draft
1. Fetch data via MCP
2. Generate first draft report
3. Save to temporary file

## Quality Check
1. Check for issues: missing sections, inconsistent formatting, data validation errors
   (In Antigravity: have the agent review these criteria explicitly rather than running a script)

## Refinement Loop
1. Address each identified issue
2. Regenerate affected sections
3. Re-validate
4. Repeat until quality threshold met

## Finalization
1. Apply final formatting
2. Generate summary
3. Save final version
```

Key techniques: explicit quality criteria, iterative improvement, validation scripts, know when to stop iterating.

---

### Pattern 4: Context-Aware Tool Selection

**Use when**: Same outcome, different tools depending on context.

```markdown
# Smart File Storage

## Decision Tree
1. Check file type and size
2. Determine best storage location:
   - Large files (>10MB): Use cloud storage MCP
   - Collaborative docs: Use Notion/Docs MCP
   - Code files: Use GitHub MCP
   - Temporary files: Use local storage

## Execute Storage
Based on decision:
- Call appropriate MCP tool
- Apply service-specific metadata
- Generate access link

## Provide Context to User
Explain why that storage was chosen
```

Key techniques: clear decision criteria, fallback options, transparency about choices.

---

### Pattern 5: Domain-Specific Intelligence

**Use when**: Your skill adds specialized knowledge beyond tool access.

```markdown
# Payment Processing with Compliance

## Before Processing (Compliance Check)
1. Fetch transaction details via MCP
2. Apply compliance rules:
   - Check sanctions lists
   - Verify jurisdiction allowances
   - Assess risk level
3. Document compliance decision

## Processing
IF compliance passed:
  - Call payment processing MCP tool
  - Apply appropriate fraud checks
  - Process transaction
ELSE:
  - Flag for review
  - Create compliance case

## Audit Trail
- Log all compliance checks
- Record processing decisions
- Generate audit report
```

Key techniques: domain expertise embedded in logic, compliance before action, comprehensive documentation, clear governance.

---

## Testing Approach

### Area 1: Triggering Tests

Goal: Ensure your skill loads at the right times.

```
Should trigger:
- "Help me set up a new ProjectHub workspace"
- "I need to create a project in ProjectHub"
- "Initialize a ProjectHub project for Q4 planning"

Should NOT trigger:
- "What's the weather in San Francisco?"
- "Help me write Python code"
- "Create a spreadsheet" (unless this skill handles sheets)
```

### Area 2: Functional Tests

Goal: Verify the skill produces correct outputs.

```
Test: Create project with 5 tasks
Given: Project name "Q4 Planning", 5 task descriptions
When: Skill executes workflow
Then:
  - Project created
  - 5 tasks created with correct properties
  - All tasks linked to project
  - No API errors
```

### Area 3: Performance Comparison

Goal: Prove the skill improves results vs. baseline.

```
Without skill:
  - User provides instructions each time
  - 15 back-and-forth messages
  - 3 failed API calls requiring retry
  - 12,000 tokens consumed

With skill:
  - Automatic workflow execution
  - 2 clarifying questions only
  - 0 failed API calls
  - 6,000 tokens consumed
```

### Success Criteria (rough benchmarks)

- Skill triggers on **90%** of relevant queries
- **0** failed API calls per workflow
- Users don't need to redirect or clarify mid-workflow
- Consistent results across sessions (new user succeeds on first try)

---

## Troubleshooting

### Skill Won't Upload

**Error: "Could not find SKILL.md in uploaded folder"**
- Cause: File not named exactly `SKILL.md` (case-sensitive)
- Fix: Rename to `SKILL.md`. Verify with `ls -la`.

**Error: "Invalid frontmatter"**
```yaml
# Wrong - missing delimiters
name: my-skill
description: Does things

# Wrong - unclosed quotes
name: my-skill
description: "Does things

# Correct
---
name: my-skill
description: Does things
---
```

**Error: "Invalid skill name"**
```yaml
# Wrong
name: My Cool Skill

# Correct
name: my-cool-skill
```

---

### Skill Doesn't Trigger

Quick checklist:
- Is the description too generic? ("Helps with projects" won't work)
- Does it include trigger phrases users would actually say?
- Does it mention relevant file types if applicable?

---

### Skill Triggers Too Often

1. **Add negative triggers**
   ```yaml
   description: Advanced data analysis for CSV files. Use for statistical modeling,
     regression, clustering. Do NOT use for simple data exploration
     (use data-viz skill instead).
   ```

2. **Be more specific** - "Processes PDF legal documents for contract review" vs. "Processes documents"

3. **Clarify scope** - "PayFlow payment processing for e-commerce. Use specifically for online payment workflows, not for general financial queries."

---

### MCP Connection Issues

1. Verify MCP server is connected (Settings > Extensions > should show "Connected")
2. Check authentication - API keys valid, proper permissions, OAuth tokens refreshed
3. Test MCP independently: "Use [Service] MCP to fetch my projects" — if this fails, the issue is MCP, not the skill
4. Verify tool names are case-sensitive and match MCP server documentation

---

### Instructions Not Followed

1. **Instructions too verbose** - Keep concise, use bullets/numbered lists, move detail to `references/`
2. **Critical instructions buried** - Put them at the top, use `## Critical` headers
3. **Ambiguous language**
   ```
   # Bad
   Make sure to validate things properly

   # Good
   CRITICAL: Before calling create_project, verify:
   - Project name is non-empty
   - At least one team member assigned
   - Start date is not in the past
   ```
4. **Model "laziness"** - Consider bundling a validation script in `scripts/`. Code is deterministic; language interpretation isn't.

---

### Large Context / Slow Responses

- Move detailed docs to `references/` and link to them
- Keep SKILL.md under 5,000 words
- If user has 20–50+ skills enabled simultaneously, recommend selective enablement

---

## Iteration Based on Feedback (Ch.3)

Skills are living documents. Plan to iterate based on these signals:

**Undertriggering signals** — skill doesn't load when it should:
- Users manually invoking it every time
- Support questions: "when should I use this skill?"
- Skill loads for explicit invocations but not natural conversation

Solution: Add more detail and nuance to the `description` field, including keywords and specific technical terms users would actually say.

**Overtriggering signals** — skill loads for unrelated queries:
- Users disabling the skill
- Confusion about what the skill is for
- Skill fires on adjacent topics it shouldn't handle

Solution: Add negative triggers ("Do NOT use for..."), be more specific in scope, clarify with competing skill names if relevant.

**Execution issues** — skill loads but results are inconsistent:
- User needs to redirect or correct mid-workflow
- API call failures
- Different outputs for the same input

Solution: Improve instructions with more specificity, add error handling, include concrete examples, move ambiguous steps to explicit numbered lists.
