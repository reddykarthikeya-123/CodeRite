# Prompt Templates

## 🔹 Feature Request
```
**Task**: Create [FEATURE]
**Stack**: [Backend/Frontend/Full]
**Requirements**:/
- Inputs: [List fields/types]
- Logic: [Business rules]
- Output: [Response format]
**Constraints**: Strict adherence to `backend.md`/`frontend.md`.
**Deliverables**: Full code, tests (unit/integration), schemas.
```

## 🔹 Refactor/Fix
```
**Task**: Refactor/Fix [FILE/COMPONENT]
**Goal**: [Improve performance/Fix bug/Clean code]
**Current Issue**: [Describe problem]
**Constraints**: Maintain API contract. Improve adherence to `system.md` standards.
**Output**: Optimized, verified code block.
```

## 🔹 Code Review
```
**Task**: Review this code.
**Checklist**:
1. Security (Auth, Injection, XSS)
2. Performance (N+1, Re-renders)
3. Quality (Typing, Naming, Tests)
**Output**: Critical issues list + fixed code blocks.
```