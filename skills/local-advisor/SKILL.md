---
name: local-advisor
argument-hint: [decision or question]
allowed-tools: mcp__ollama__consult
description: Get an on-demand independent second opinion from the local Ollama model on a significant technical decision, design, or piece of code, to surface blind spots the primary model may share. Invoke explicitly, or when a deliberate gut-check is warranted — never automatically on routine decisions. Frames the consultation adversarially to beat sycophancy, then presents the advisor's raw take plus a critical synthesis.
---

# Local advisor — independent second opinion

Consult the local Ollama model via the `mcp__ollama__consult` tool as an independent
advisor. Its value is **not** capability — it is well below the primary model — but
**independence**: it has not seen your reasoning, so its blind spots do not overlap with
yours. Use it to pressure-test a decision, not to answer the question for you.

## When to use

- Explicitly, when you want a second opinion on a technical decision, design,
  architecture, or piece of code.
- On-demand only. Do **not** invoke automatically on routine decisions — reserve it for
  choices where an independent check is worth the round-trip.

## Procedure

1. **Identify the subject.** Requested subject, if any: `$ARGUMENTS`. Otherwise,
   take the decision/design currently under discussion. State in one line what you are
   getting a second opinion on.

2. **Pick the consultation mode:**
   - **Adversarial validation** — *you already have a conclusion.* This is the default and
     the most valuable mode. Give the advisor your conclusion and key reasoning, then
     command it to **assume your conclusion is wrong and identify the single most likely
     flawed assumption or failure point.** Framing it as a failure-search rather than a
     "review" is what stops a smaller model from simply agreeing with you.
   - **Open consultation** — *no conclusion yet.* Pose the decision and the real
     constraints, but do **not** state your preferred answer. Ask for its independent
     recommendation and reasoning.

3. **Shape the context deliberately.** Pass real constraints and any relevant code/facts
   in `context`. In adversarial mode include your conclusion; in open mode withhold any
   answer you are leaning toward, so you do not anchor it.

   **Neutralize platform terms before calling the tool (required).** The advisor has no
   knowledge of Claude Code or your stack and silently reinterprets jargon through its own
   training, where the same word may name a different feature — so a weak model fails
   *quietly*, returning a fluent answer grounded in the wrong concept. Scan the `question`
   and `context` and remove every platform term, two ways depending on the term:

   - **Fixed-meaning terms — substitute verbatim** (their neutral form does not vary):
     - MCP / MCP tool → "an external tool the agent can call"
     - hook → "a script the platform runs automatically on an event"
     - subagent → "a separate agent instance spawned for a sub-task"
     - plan mode → "a read-only mode where the agent plans before acting"
   - **Context-loaded terms — derive per question, not a lookup** (skill, memory, agent
     each have several salient properties; surface the one this decision turns on).
     Illustration: for a question about whether to duplicate a skill's rationale into
     memory, "skill" becomes "an instruction file whose one-paragraph description is
     auto-loaded every session." A different question about the same term would surface a
     different property.

   If a platform term reaches the tool undefined, that is a defect — fix it before sending.

4. **Call the tool.** Invoke `mcp__ollama__consult` with a sharp, specific `question` and
   the shaped `context`. Let the model default stand unless there is a reason to override
   (`model`).

5. **Present, then synthesize.**
   - First, show the advisor's response, clearly attributed (e.g., **"Advisor (local
     model):"**), close to verbatim — trim only filler — so the unfiltered take is visible.
   - Then add **your synthesis:** where it agrees, where it diverges from your direction,
     and — for each divergence — whether it is a real blind spot worth acting on or
     model-weakness noise. The divergences are the signal.

6. **Adjudicate, do not defer.** It is a weaker model; false positives are expected. Treat
   its findings as candidate blind spots to evaluate, never as verdicts that override your
   reasoning.

## Notes

- The advisor is consulted, not in command. If its take is noise, say so and move on.
- This skill does not pin a model tag; it uses the tool's default. If
  `mcp__ollama__consult` is unavailable or the backend is down, report that rather than
  proceeding.
