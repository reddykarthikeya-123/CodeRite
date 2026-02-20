# Tech Stack
Python 3.11+, FastAPI, Pydantic v2, SQLAlchemy 2.0+, Alembic, PostgreSQL.

# Rules & Standards

## 1. API & Architecture
- **Structure**: `Router` (HTTP) -> `Service` (Logic) -> `Repository` (DB).
- **Responses**: Always use `{"success": bool, "data": ..., "error": ...}`.
- **Async**: Use `async def` for I/O. Blocking code goes to threadpool.
- **Naming**: `snake_case` (files/funcs), `PascalCase` (classes).
- **Async SQLAlchemy**: Use `async_engine` + `run_sync` for inspection/reflection. Avoid mixing sync/async.

## 2. Validation & Security (OWASP)
- **Input**: ALL requests must use Pydantic schemas. Validate `min_length`, regex patterns.
- **Auth**: JWT (short-lived) + Refresh Token (httpOnly).
- **DB**: Parameterized queries ONLY (SQLAlchemy). No string concatenation.
- **Secrets**: Load from env via `pydantic-settings`. Never commit secrets.

## 3. Testing & Quality
- **Framework**: `pytest` + `httpx` (async).
- **Coverage**: Service layer (80%+), Integration (Success + Error cases).
- **Mocks**: Mock external services. Use Factories (`factory-boy`) over static fixtures.
- **Linting**: `ruff` (strict), `mypy` (strict).

## 4. Error Handling
- Use `HTTPException` with specific codes (400, 401, 403, 404).
- Never return 500s or stack traces to client. Catch known exceptions in Service layer.
- Log errors with `extra={"context": ...}`.

## 5. Coding Style
- **Docstrings**: Google style. Required for public API.
- **Typing**: Full type hints. `List[str]`, `Optional[int]`.
- **Functions**: Max 50 lines. Single responsibility.

---

# Reference Examples

## Pydantic Schema (Request Validation)
```python
from pydantic import BaseModel, Field, field_validator
import re

class UserCreate(BaseModel):
    email: str = Field(..., min_length=5, max_length=255)
    password: str = Field(..., min_length=8)
    name: str = Field(..., min_length=1, max_length=100)

    @field_validator('email')
    @classmethod
    def validate_email(cls, v: str) -> str:
        if not re.match(r'^[\w\.-]+@[\w\.-]+\.\w+$', v):
            raise ValueError('Invalid email format')
        return v.lower().strip()

    @field_validator('password')
    @classmethod
    def validate_password(cls, v: str) -> str:
        if not re.search(r'[A-Z]', v) or not re.search(r'\d', v):
            raise ValueError('Password must contain uppercase and digit')
        return v
```

## Structured Error Response
```python
# schemas/common.py
class ErrorDetail(BaseModel):
    code: str
    message: str
    details: dict = {}

class APIResponse(BaseModel, Generic[T]):
    success: bool
    data: T | None = None
    error: ErrorDetail | None = None

# Usage in service
from fastapi import HTTPException, status

def get_user(user_id: int) -> User:
    user = repo.get_by_id(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "USER_NOT_FOUND", "message": f"User {user_id} not found"}
        )
    return user
```

## Endpoint Pattern
```python
from fastapi import APIRouter, Depends, status
from app.schemas.user import UserCreate, UserResponse
from app.services.user_service import UserService
from app.api.deps import get_user_service

router = APIRouter(prefix="/users", tags=["users"])

@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreate,
    service: UserService = Depends(get_user_service)
) -> UserResponse:
    """Create a new user."""
    return await service.create(payload)
```

## JWT Auth Dependency
```python
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer
from jose import jwt, JWTError
from app.core.config import settings

security = HTTPBearer()

async def get_current_user(token: str = Depends(security)) -> User:
    try:
        payload = jwt.decode(token.credentials, settings.jwt_secret, algorithms=["HS256"])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail={"code": "INVALID_TOKEN", "message": "Invalid token"})
    except JWTError:
        raise HTTPException(status_code=401, detail={"code": "INVALID_TOKEN", "message": "Token expired or invalid"})
    
    user = await user_repo.get(user_id)
    if not user:
        raise HTTPException(status_code=401, detail={"code": "USER_NOT_FOUND", "message": "User not found"})
    return user
```

## Repository Pattern
```python
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

class UserRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, user_id: int) -> User | None:
        result = await self.session.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    async def create(self, user: User) -> User:
        self.session.add(user)
        await self.session.commit()
        await self.session.refresh(user)
        return user
```
