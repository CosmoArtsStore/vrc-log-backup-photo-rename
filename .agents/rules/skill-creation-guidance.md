# Skill Creation Guidance

## Activation: Model Decision

This rule provides guidance when the user is working on creating, editing, or improving
an Antigravity or Claude skill (`.agent/skills/`, `SKILL.md` files, or Agent Skills format).

---

## When the user asks to create or improve a skill

Skills in this workspace follow the **Anthropic Agent Skills open standard** — the same format
used by Claude.ai, Claude Code, and Antigravity. This format is portable across all three platforms.

### Key principles to apply

1. **Description is everything.** The `description` YAML field is the primary trigger mechanism.
   It must include BOTH what the skill does AND specific phrases that should trigger it.
   Claude/Gemini undertrigger skills by default — write descriptions that are slightly "pushy".

2. **Progressive Disclosure.** Keep `SKILL.md` focused and under ~500 lines.
   Move detailed docs to `references/` and link to them. The three levels are:
   - Frontmatter (always loaded) → SKILL.md body (loaded when relevant) → References (on demand)

3. **Workflow patterns.** Match the skill to the appropriate pattern:
   - Sequential, Multi-MCP, Iterative Refinement, Context-Aware, or Domain-Specific
   - See `.agent/skills/skill-creator/references/official-guide-patterns.md` for templates

4. **File structure rules.**
   - Folder name: kebab-case only (`my-skill` ✅, `My Skill` ❌, `my_skill` ❌)
   - File: must be exactly `SKILL.md` (case-sensitive)
   - No `README.md` inside the skill folder
   - No XML angle brackets in frontmatter

5. **In Antigravity context**, skills placed in `.agent/skills/<skill-name>/SKILL.md` are
   workspace-local and activate automatically. No upload or packaging needed.

### Where to find detailed guidance

The `skill-creator` skill in `.agent/skills/skill-creator/` contains the full methodology.
Relevant reference files:
- `references/official-guide-fundamentals.md` — YAML fields, file structure, design principles
- `references/official-guide-patterns.md` — Workflow patterns, description examples, troubleshooting
- `references/official-guide-distribution.md` — Sharing, API usage, distribution options
