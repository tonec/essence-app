# Claude Code Project Guardrails

You are working on a greenfield project. You must strictly adhere to Spec-Driven Development (SDD).

## Operational Rules
1. **Spec First:** Before writing or modifying any code, check `specs/features/` for the relevant feature folder.
2. **Task Monogamy:** Work on exactly ONE task inside `tasks.md` at a time. Do not jump ahead.
3. **No Code Without Tasks:** If a task does not exist for a feature, halt and ask the user to update the `tasks.md` or `requirements.md` file first.
4. **State Tracking:** When a task is complete, update the `tasks.md` file by changing `[ ]` to `[x]`. Commit the task update alongside the code changes.
