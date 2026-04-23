# Dev Epic Stories Workflow

**Goal:** Implement every `ready-for-dev` story in a single epic by iteratively running the `bmad-dev-story` workflow against each, in sprint-status file order, under one upfront confirmation.

**Your Role:** Batch orchestrator. You enumerate the target stories and delegate each implementation to the existing `bmad-dev-story` workflow. You do NOT duplicate its logic — you reuse it.

- Communicate all responses in `{communication_language}` and generate documents in `{document_output_language}`.
- **Halt on the first story that does not reach `review` status.** Do not silently continue; dev-story failures cascade (later stories depend on earlier ones).
- No per-story prompts after initial approval. If a user wants single-step control, they should invoke `/bmad-dev-story` directly.
- Preserve `sprint-status.yaml` file order when enumerating. The downstream skill depends on it.

---

## INITIALIZATION

### Configuration Loading

Load config from `{project-root}/_bmad/bmm/config.yaml` and resolve:

- `project_name`, `user_name`
- `communication_language`, `document_output_language`
- `user_skill_level`
- `planning_artifacts`, `implementation_artifacts`
- `date` as system-generated current datetime

### Paths

- `sprint_status` = `{implementation_artifacts}/sprint-status.yaml`
- `epics_file` = `{planning_artifacts}/epics.md`
- `dev_story_workflow` = `{project-root}/.claude/skills/bmad-dev-story/workflow.md`

---

## EXECUTION

<workflow>

<step n="1" goal="Resolve target epic">
  <action>Check if sprint_status file exists</action>
  <check if="sprint_status file does NOT exist">
    <output>🚫 No sprint-status.yaml found at {{sprint_status}}</output>
    <output>Run `/bmad-sprint-planning` then `/bmad-create-epic-stories N` first to prepare stories for implementation.</output>
    <action>HALT</action>
  </check>

  <action>Load FULL {{sprint_status}} file — read every line from top to bottom to preserve order</action>
  <action>Parse the `development_status` section completely into an ordered list of (key, status) pairs</action>

  <check if="user provided an epic argument (e.g., '1', 'epic-2', 'epic 3')">
    <action>Normalize argument to {{epic_num}} as an integer (strip 'epic-' prefix, trim whitespace)</action>
    <action>Locate the entry keyed `epic-{{epic_num}}` in development_status</action>
    <check if="epic-{{epic_num}} not found">
      <output>🚫 ERROR: `epic-{{epic_num}}` not found in sprint-status.yaml</output>
      <output>Available epics: {list all `epic-N` keys found, in order}</output>
      <action>HALT</action>
    </check>
  </check>

  <check if="user did NOT provide an epic argument">
    <action>Scan development_status in file order. Select the FIRST `epic-{N}` whose status is `in-progress` AND which has ≥1 child entry matching `^{N}-\d+-.+` with status `ready-for-dev`.</action>
    <check if="no such epic found">
      <output>📋 No epic has `ready-for-dev` stories remaining.</output>
      <output>Either all stories are already in-progress/review/done, or no epic has been prepped via `/bmad-create-epic-stories`.</output>
      <action>HALT</action>
    </check>
    <action>Set {{epic_num}} to the selected epic's number</action>
  </check>

  <action>Read status of `epic-{{epic_num}}` → {{epic_status}}</action>
  <check if="{{epic_status}} == 'done'">
    <output>🚫 ERROR: epic-{{epic_num}} is marked `done`. All stories are already completed.</output>
    <action>HALT</action>
  </check>
  <check if="{{epic_status}} == 'backlog'">
    <output>🚫 ERROR: epic-{{epic_num}} is `backlog`. Stories haven't been prepped yet.</output>
    <output>Run `/bmad-create-epic-stories {{epic_num}}` first to generate the story files and flip stories to `ready-for-dev`.</output>
    <action>HALT</action>
  </check>
  <check if="{{epic_status}} not in ['backlog', 'in-progress', 'done']">
    <output>🚫 ERROR: Invalid status `{{epic_status}}` on epic-{{epic_num}}. Expected: backlog, in-progress, or done.</output>
    <action>HALT</action>
  </check>
</step>

<step n="2" goal="Enumerate target stories">
  <action>Walk development_status in file order. Collect keys matching regex `^{{epic_num}}-\d+-.+` whose status is exactly `ready-for-dev`. Exclude any key starting with `epic-`.</action>
  <action>Store the ordered list as {{story_keys}}. Set {{total}} = length of {{story_keys}}.</action>

  <check if="{{total}} == 0">
    <output>📋 Epic-{{epic_num}} has no `ready-for-dev` stories left.</output>
    <output>Current story statuses for this epic:</output>
    <output>{for each `{{epic_num}}-*-*` entry: print `  - {{key}}: {{status}}`}</output>
    <output>💡 If stories are in `in-progress` or `review`, either finish them manually or run `/bmad-code-review` to advance `review` stories to `done`.</output>
    <action>HALT</action>
  </check>
</step>

<step n="3" goal="Display plan and get single confirmation">
  <output>🚧 About to implement **{{total}}** stor{{'y' if total==1 else 'ies'}} for epic-{{epic_num}} via `bmad-dev-story`:</output>
  <output>{for i, key in enumerate(story_keys, 1): print `  {{i}}. {{key}}`}</output>
  <output></output>
  <output>Each story will be implemented end-to-end (code written, tests run) and its sprint-status entry will flip `ready-for-dev` → `in-progress` → `review`.</output>
  <output></output>
  <output>⚠️ **Cost warning:** `bmad-dev-story` is significantly heavier than `bmad-create-story`. It writes real code, runs real tests, and can fail in ways that block later stories (story N+1 depends on story N's merged code). For epics with >5 stories, running in a single session is tight — consider:</output>
  <output>  - Run 2-3 stories per session with `/clear` + `/bmad-dev-epic-stories {{epic_num}}` between batches (skill will pick up where it left off)</output>
  <output>  - Or run `/bmad-dev-story` one-at-a-time for per-story control and commit between each</output>
  <output></output>
  <output>📝 **Code-review is a separate step.** This workflow leaves stories at `review`. Run `/bmad-code-review` (ideally in a fresh context per BMAD convention) to advance `review` → `done`.</output>
  <output></output>
  <ask>Proceed? [y] yes, implement all sequentially / [n] cancel / [list] show me the epic section from epics.md first</ask>

  <check if="user chooses 'n' or anything not in {'y','list'}">
    <output>Cancelled. No changes made.</output>
    <action>HALT</action>
  </check>

  <check if="user chooses 'list'">
    <action>Load {{epics_file}}, extract the `## Epic {{epic_num}}:` section through the next `## Epic` heading (or EOF), and display it.</action>
    <ask>Proceed now? [y] yes / [n] cancel</ask>
    <check if="user does not choose 'y'">
      <output>Cancelled. No changes made.</output>
      <action>HALT</action>
    </check>
  </check>
</step>

<step n="4" goal="Iterate dev-story inline">
  <action>Initialize {{completed}} = [] and {{index}} = 0</action>

  <for each="story_key" in="{{story_keys}}">
    <action>Increment {{index}}</action>
    <output>▶ [{{index}}/{{total}}] Implementing {{story_key}}</output>

    <critical>Delegate implementation to the existing dev-story workflow. Do NOT reimplement its logic.</critical>
    <action>Resolve the story file path: `{{implementation_artifacts}}/{{story_key}}.md`</action>
    <action>Read the FULL file at {{dev_story_workflow}} (path: `.claude/skills/bmad-dev-story/workflow.md`).</action>
    <action>Execute that workflow end-to-end exactly as if the user had invoked `/bmad-dev-story` with the story file path as the explicit argument. Bind `{{story_path}}` = the resolved story file path so step 1 routes directly to the explicit-path branch (skipping auto-discover).</action>
    <action>Proceed through all steps of the delegated workflow (context loading, task execution, test runs, sprint-status updates, etc.) to completion.</action>

    <action>Re-load {{sprint_status}} and look up development_status[{{story_key}}]</action>
    <check if="development_status[{{story_key}}] != 'review'">
      <output>🚫 ERROR: dev-story for {{story_key}} did not flip status to `review`. Observed: `{{observed_status}}`.</output>
      <output></output>
      <output>**Progress so far:**</output>
      <output>  - Completed (status=review): {{completed}}</output>
      <output>  - Failed: {{story_key}} (status={{observed_status}})</output>
      <output>  - Remaining (not attempted): {list of story_keys after current index}</output>
      <output></output>
      <output>**Why the hard halt:** later stories in this epic likely depend on {{story_key}}'s merged code. Continuing risks cascading failures that are harder to diagnose than a single clean break.</output>
      <output></output>
      <output>**Next steps:**</output>
      <output>  1. Inspect the failed story's dev log / test output</output>
      <output>  2. Fix the blocker (manual code edits, fix a failing test, or roll back)</output>
      <output>  3. If the story is partially done and in `in-progress` status, resume via `/bmad-dev-story` to finish it (it'll detect the in-progress state and continue)</output>
      <output>  4. Once {{story_key}} reaches `review`, re-run `/bmad-dev-epic-stories {{epic_num}}` — already-completed stories will be skipped (they're no longer `ready-for-dev`)</output>
      <action>HALT</action>
    </check>

    <action>Append {{story_key}} to {{completed}}</action>
    <output>✓ [{{index}}/{{total}}] {{story_key}} → review</output>
  </for>
</step>

<step n="5" goal="Final summary">
  <output>🎉 Epic-{{epic_num}} implementation batch complete — {{total}} stor{{'y' if total==1 else 'ies'}} at `review` status:</output>
  <output>{for key in completed: print `  - {{key}}`}</output>
  <output></output>
  <output>**Sprint status:**</output>
  <output>  - epic-{{epic_num}}: in-progress (unchanged — epic advances to `done` only when all its stories are `done`)</output>
  <output>  - all listed stories: review</output>
  <output></output>
  <output>**Next steps:**</output>
  <output>  - `/bmad-code-review` to review each `review` story (fresh context per story recommended per BMAD convention; the code-review workflow handles the `review` → `done` transition)</output>
  <output>  - `/bmad-sprint-status` to inspect the board</output>
  <output>  - Commit the implementation work (this workflow does not auto-commit — leaves that to human judgment after code-review)</output>
</step>

</workflow>
