# /create-skill Workflow

This workflow guides you through creating a new skill for Antigravity (or Claude.ai/Claude Code)
following the Anthropic Agent Skills open standard. Skills are stored at
`.agent/skills/<skill-name>/SKILL.md` in this workspace.

---

## Step 1: Capture Intent

Ask the user the following (you can ask all at once):

1. What should this skill enable you to do?
2. What would you say to trigger it? (specific phrases or file types)
3. What's the expected output format?
4. Does this involve MCP tools, or is it Claude's built-in capabilities only?

Extract any information already present in the conversation before asking.

---

## Step 2: Choose a Workflow Pattern

Based on the use case, identify the best pattern from `.agent/skills/skill-creator/references/official-guide-patterns.md`:

- **Sequential** — multi-step process in a fixed order
- **Multi-MCP** — spans multiple services/tools
- **Iterative Refinement** — output quality improves with loops
- **Context-Aware** — same goal, different tools based on context
- **Domain-Specific** — embeds specialized knowledge beyond tool access

Present the recommendation to the user and confirm before proceeding.

---

## Step 3: Draft SKILL.md

Create `.agent/skills/<skill-name>/SKILL.md` with:

```yaml
---
name: skill-name-in-kebab-case
description: [What it does]. Use when user [specific trigger conditions].
---
```

Followed by the instruction body. Consult `.agent/skills/skill-creator/references/official-guide-fundamentals.md`
for the recommended template structure.

**Description checklist:**
- [ ] Includes WHAT the skill does
- [ ] Includes WHEN to use it (specific trigger phrases)
- [ ] Under 1024 characters
- [ ] No XML angle brackets (`<` `>`)
- [ ] Slightly "pushy" to counteract undertriggering tendency

---

## Step 4: Test (Inline, Antigravity Mode)

No subagents or scripts available in Antigravity — test conversationally.

For each of 2-3 test prompts:
1. Describe the SKILL.md contents to the agent
2. Ask it to complete the test prompt as if the skill were active
3. Evaluate the output qualitatively

Ask the user: "How does this look? Anything you'd change?"

---

## Step 5: Iterate

Based on user feedback:
- If skill isn't triggering → improve the `description` field (see patterns reference for examples)
- If instructions aren't followed → move critical steps to top, add clearer context
- If output is inconsistent → add examples, validation steps, or error handling

Revise `SKILL.md` and rerun test prompts. Repeat until satisfied.

---

## Step 6: Finalize

Confirm the skill is placed at `.agent/skills/<skill-name>/SKILL.md`.

Antigravity workspace-local skills are active automatically — no upload needed.

If the user also wants to use this skill in Claude.ai or Claude Code:
- Zip the `<skill-name>/` folder
- Upload via Claude.ai > Settings > Capabilities > Skills
- See `.agent/skills/skill-creator/references/official-guide-distribution.md` for full distribution options
