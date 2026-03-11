# Official Guide: Distribution, API Usage & Resources

Source: *The Complete Guide to Building Skills for Claude* (Anthropic, 2026) — Chapter 4 & 6

---

## Chapter 4: Distribution and Sharing

### Current Distribution Model (as of January 2026)

**How individual users get skills:**
1. Download the skill folder
2. Zip the folder
3. Upload to Claude.ai via Settings > Capabilities > Skills
4. Or place in Claude Code skills directory

**Organization-level skills:**
- Admins can deploy skills workspace-wide (shipped December 18, 2025)
- Automatic updates
- Centralized management

### An Open Standard

Anthropic has published Agent Skills as an open standard. Skills are designed to be portable across tools and platforms — the same skill should work whether using Claude or other AI platforms. Authors can note platform-specific requirements in the `compatibility` field.

### Using Skills via API

For programmatic use cases (applications, agents, automated workflows):

**Key capabilities:**
- `/v1/skills` endpoint for listing and managing skills
- Add skills to Messages API requests via the `container.skills` parameter
- Version control and management through the Claude Console
- Works with the Claude Agent SDK for building custom agents

Note: Skills in the API require the **Code Execution Tool beta**, which provides the secure environment skills need to run.

**When to use which surface:**

| Use Case | Best Surface |
|---|---|
| End users interacting with skills directly | Claude.ai / Claude Code |
| Manual testing and iteration during development | Claude.ai / Claude Code |
| Individual, ad-hoc workflows | Claude.ai / Claude Code |
| Applications using skills programmatically | API |
| Production deployments at scale | API |
| Automated pipelines and agent systems | API |

### Recommended Distribution Approach Today

**1. Host on GitHub**
- Public repo for open-source skills
- Clear README with installation instructions (note: this is the repo README, NOT a README inside the skill folder)
- Example usage and screenshots

**2. Document in Your MCP Repo**
- Link to skills from MCP documentation
- Explain the value of using MCP + skills together
- Provide quick-start guide

**3. Create an Installation Guide**
```markdown
# Installing the [Your Service] Skill

1. Download the skill:
   - Clone repo: `git clone https://github.com/yourcompany/skills`
   - Or download ZIP from Releases

2. Install in Claude:
   - Open Claude.ai > Settings > Capabilities > Skills
   - Click "Upload skill"
   - Select the skill folder (zipped)

3. Enable the skill:
   - Toggle on the [Your Service] skill
   - Ensure your MCP server is connected

4. Test:
   - Ask Claude: "Set up a new project in [Your Service]"
```

### Positioning Your Skill

Focus on outcomes, not features:
```
✅ Good:
"The ProjectHub skill enables teams to set up complete project workspaces in seconds
— including pages, databases, and templates — instead of spending 30 minutes on
manual setup."

❌ Bad:
"The ProjectHub skill is a folder containing YAML frontmatter and Markdown
instructions that calls our MCP server tools."
```

Highlight the MCP + skills story:
> "Our MCP server gives Claude access to your Linear projects. Our skills teach Claude your team's sprint planning workflow. Together, they enable AI-powered project management."

---

## Chapter 6: Resources and References

### Official Documentation

- **Best Practices Guide** — anthropic.com/skills/best-practices
- **Skills Documentation** — anthropic.com/skills
- **API Reference** — anthropic.com/api
- **MCP Documentation** — anthropic.com/mcp

### Blog Posts (Anthropic)
- *Introducing Agent Skills*
- *Engineering Blog: Equipping Agents for the Real World*
- *Skills Explained*
- *How to Create Skills for Claude*
- *Building Skills for Claude Code*
- *Improving Frontend Design through Skills*

### Example Skills
- **Public repository:** `github.com/anthropics/skills`
  - Contains Anthropic-created skills you can customize
  - Document Skills (PDF, DOCX, PPTX, XLSX creation)
  - Example Skills (various workflow patterns)
  - Partner Skills (Asana, Atlassian, Canva, Figma, Sentry, Zapier, and more)

### Tools and Utilities

**skill-creator skill:**
- Built into Claude.ai; available for Claude Code
- Can generate skills from descriptions
- Reviews and provides recommendations
- Usage: "Help me build a skill using skill-creator"
- Note: `skill-creator` helps design and refine skills but does not execute automated test suites or produce quantitative evaluation results

**Validation:**
- Ask skill-creator to assess your skills
- "Review this skill and suggest improvements"

### Getting Support

- **Technical questions:** Claude Developers Discord (community forums)
- **Bug reports:** `github.com/anthropics/skills/issues`
  - Include: Skill name, error message, steps to reproduce
