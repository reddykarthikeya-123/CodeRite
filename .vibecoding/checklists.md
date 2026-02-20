# Pre-Flight Checklist

## Backend
- [ ] **Validation**: Pydantic models for ALL inputs.
- [ ] **Security**: No SQL injection (ORM used). Auth checks in Service layer.
- [ ] **Error Handling**: Structured error responses. No 500s exposed.
- [ ] **Performance**: N+1 queries prevented. Async used correctly.
- [ ] **Testing**: Unit tests for logic. Integration tests for API.
- [ ] **Linting**: No `ruff`/`mypy` errors.
- [ ] **Verification**: Run `uvicorn` or build command after edits to catch syntax errors immediately.

## Frontend
- [ ] **Types**: No `any`. Strict interface definitions.
- [ ] **State**: React Query for API data. No redundant `useEffect`.
- [ ] **Forms**: Zod validation connected to inputs.
- [ ] **A11y**: Keyboard accessible. Semantic HTML.
- [ ] **UX**: Loading skeletons + Error retries handled.
- [ ] **Security**: No XSS risks. Input sanitization.

## General
- [ ] ** Secrets**: No keys in code/commit history.
- [ ] **Logs**: No sensitive data logged (PII/Tokens).
- [ ] **Clean**: No debug prints, TODOs, or dead code.
- [ ] **Dependencies**: `requirements.txt` or `package.json` updated for ALL new imports.
- [ ] **Port Check**: Verify port availability before starting dev servers.
- [ ] **Learnings Review**: Check `learnings.md` for relevant past mistakes.
