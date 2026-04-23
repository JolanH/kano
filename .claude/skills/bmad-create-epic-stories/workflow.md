# Create Epic Stories Workflow

**Goal:** Prep one entire epic by iteratively running the `bmad-create-story` workflow against every `backlog` story belonging to that epic in `sprint-status.yaml`, under a single upfront confirmation.

**Your Role:** Batch orchestrator. You enumerate the target stories, get one approval, then delegate each per-story creation to the existing `bmad-create-story` workflow. You do NOT duplicate `bmad-create-story`'s story-authoring logic — you reuse it.

- Communicate all responses in `{communication_language}` and generate documents in `{document_output_language}`.
- No per-story prompts after initial approval. If a story fails, halt and report — do NOT silently continue.
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
- `create_story_workflow` = `{project-root}/.claude/skills/bmad-create-story/workflow.md`

---

## EXECUTION

<workflow>

<step n="1" goal="Resolve target epic">
  <action>Check if sprint_status file exists</action>
  <check if="sprint_status file does NOT exist">
    <output>🚫 No sprint-status.yaml found at {{sprint_status}}</output>
    <output>Run `/bmad-sprint-planning` first to initialize sprint tracking, then retry.</output>
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
    <action>Scan development_status in file order. Select the FIRST `epic-{N}` whose status is `backlog` or `in-progress` AND which has ≥1 child entry matching `^{N}-\d+-.+` with status `backlog`.</action>
    <check if="no such epic found">
      <output>📋 No epic has backlog stories remaining.</output>
      <output>Either all stories are prepped, or run `/bmad-sprint-planning` to refresh.</output>
      <action>HALT</action>
    </check>
    <action>Set {{epic_num}} to the selected epic's number</action>
  </check>

  <action>Read status of `epic-{{epic_num}}` → {{epic_status}}</action>
  <check if="{{epic_status}} == 'done'">
    <output>🚫 ERROR: Cannot prep epic-{{epic_num}} — it is marked `done`.</output>
    <output>All stories in this epic are complete. If you need to add more work, either:</output>
    <output>  1. Manually change epic status back to `in-progress` in sprint-status.yaml</output>
    <output>  2. Create a new epic for additional work</output>
    <action>HALT</action>
  </check>
  <check if="{{epic_status}} not in ['backlog', 'contexted', 'in-progress', 'done']">
    <output>🚫 ERROR: Invalid status `{{epic_status}}` on epic-{{epic_num}}. Expected: backlog, in-progress, or done.</output>
    <output>Fix sprint-status.yaml manually or run `/bmad-sprint-planning` to regenerate.</output>
    <action>HALT</action>
  </check>
</step>

<step n="2" goal="Enumerate target stories">
  <action>Walk development_status in file order. Collect keys matching regex `^{{epic_num}}-\d+-.+` whose status is exactly `backlog`. Exclude any key starting with `epic-`.</action>
  <action>Store the ordered list as {{story_keys}}. Set {{total}} = length of {{story_keys}}.</action>

  <check if="{{total}} == 0">
    <output>📋 Epic-{{epic_num}} has no `backlog` stories left.</output>
    <output>Current story statuses for this epic:</output>
    <output>{for each `{{epic_num}}-*-*` entry: print `  - {{key}}: {{status}}`}</output>
    <action>HALT</action>
  </check>
</step>

<step n="3" goal="Display plan and get single confirmation">
  <output>📦 About to prep **{{total}}** stor{{'y' if total==1 else 'ies'}} for epic-{{epic_num}}:</output>
  <output>{for i, key in enumerate(story_keys, 1): print `  {{i}}. {{key}}`}</output>
  <output></output>
  <output>Each story will be created via the `bmad-create-story` workflow (writing files to `{{implementation_artifacts}}/`) and its sprint-status entry will flip from `backlog` → `ready-for-dev`. Epic-{{epic_num}} will be auto-promoted to `in-progress` after the first story.</output>
  <output></output>
  <ask>Proceed? [y] yes, prep all / [n] cancel / [list] show me the epic section from epics.md first</ask>

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

<step n="4" goal="Iterate create-story inline">
  <action>Initialize {{created}} = [] and {{index}} = 0</action>

  <for each="story_key" in="{{story_keys}}">
    <action>Increment {{index}}</action>
    <output>▶ [{{index}}/{{total}}] Creating {{story_key}}</output>

    <critical>Delegate story creation to the existing create-story workflow. Do NOT reimplement its logic.</critical>
    <action>Read the FULL file at {{create_story_workflow}} (path: `.claude/skills/bmad-create-story/workflow.md`).</action>
    <action>Execute that workflow end-to-end exactly as if the user had invoked `/bmad-create-story` with `{{story_key}}` as the explicit story argument. Bind `{{story_path}} = {{story_key}}` so step 1 routes directly to step 2a (user-provided branch) — do NOT enter the auto-discover branch.</action>
    <action>Proceed through all steps of the delegated workflow (context gathering, template population, sprint-status update, etc.) to completion.</action>

    <action>Re-load {{sprint_status}} and look up development_status[{{story_key}}]</action>
    <check if="development_status[{{story_key}}] != 'ready-for-dev'">
      <output>🚫 ERROR: create-story for {{story_key}} did not flip status to `ready-for-dev`. Observed: `{{observed_status}}`.</output>
      <output>Succeeded so far: {{created}}</output>
      <output>Failed on: {{story_key}}</output>
      <output>Remaining (not attempted): {list of story_keys after current index}</output>
      <output>Halting to prevent partial / inconsistent state. Inspect the failed story, fix, then re-run `/bmad-create-epic-stories {{epic_num}}` — already-prepped stories will be skipped (they're no longer `backlog`).</output>
      <action>HALT</action>
    </check>

    <action>Append {{implementation_artifacts}}/{{story_key}}.md to {{created}}</action>
    <output>✓ [{{index}}/{{total}}] {{story_key}} → ready-for-dev</output>
  </for>
</step>

<step n="5" goal="Final summary">
  <output>🎉 Epic-{{epic_num}} prep complete — {{total}} stor{{'y' if total==1 else 'ies'}} ready for dev:</output>
  <output>{for path in created: print `  - {{path}}`}</output>
  <output></output>
  <output>Sprint status:</output>
  <output>  - epic-{{epic_num}}: in-progress (auto-promoted by first story)</output>
  <output>  - all listed stories: ready-for-dev</output>
  <output></output>
  <output>Next steps:</output>
  <output>  - `/bmad-dev-story` to start implementing the first story</output>
  <output>  - `/bmad-sprint-status` to review the current board</output>
</step>

</workflow>
