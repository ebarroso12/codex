```markdown
# codex Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches the core development patterns and conventions used in the `codex` TypeScript codebase. You'll learn how to structure files, write imports and exports, and understand the repository's approach to testing. This guide is ideal for contributors aiming for consistency and best practices within the project.

## Coding Conventions

### File Naming
- Use **PascalCase** for all file names.
  - Example: `UserProfile.ts`, `DataService.ts`

### Import Style
- Use **relative imports** for referencing modules.
  - Example:
    ```typescript
    import { fetchData } from './DataService';
    ```

### Export Style
- Use **named exports** rather than default exports.
  - Example:
    ```typescript
    // In DataService.ts
    export function fetchData() { /* ... */ }

    // In another file
    import { fetchData } from './DataService';
    ```

### Commit Patterns
- Commit messages are **freeform** and do not follow a strict prefix convention.
- Average commit message length is around 28 characters.

## Workflows

### Adding a New Module
**Trigger:** When you need to introduce a new feature or utility.
**Command:** `/add-module`

1. Create a new file using PascalCase, e.g., `NewFeature.ts`.
2. Implement your logic using named exports.
3. Use relative imports to include dependencies.
4. Add or update tests in a corresponding `*.test.*` file.

### Refactoring Existing Code
**Trigger:** When improving or restructuring code.
**Command:** `/refactor-code`

1. Identify the target file(s).
2. Maintain PascalCase naming if renaming files.
3. Ensure all imports remain relative.
4. Update named exports as needed.
5. Run or update tests to ensure no regressions.

### Writing Tests
**Trigger:** When adding or updating functionality.
**Command:** `/write-test`

1. Create or update a test file matching the pattern `*.test.*` (e.g., `UserProfile.test.ts`).
2. Write tests for each exported function or component.
3. Use the project's chosen (unknown) testing framework.

## Testing Patterns

- Test files follow the `*.test.*` pattern, such as `Feature.test.ts`.
- Each test file should correspond to a source file and cover all named exports.
- The specific testing framework is not detected; follow existing test file patterns for consistency.

## Commands
| Command        | Purpose                                      |
|----------------|----------------------------------------------|
| /add-module    | Scaffold a new module with proper conventions|
| /refactor-code | Refactor code while maintaining conventions  |
| /write-test    | Create or update tests for a module          |
```