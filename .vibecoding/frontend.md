# Tech Stack
React 18+, TypeScript (Strict), Vite, TanStack Query, Tailwind, Zod.

# Rules & Standards

## 1. Components & State
- **Structure**: Functional Components. One per file. `PascalCase`.
- **State**: Server -> React Query. Local -> `useState`. Global -> Zustand.
- **Effects**: Avoid `useEffect` for derived state. Use `useMemo`.
- **Props**: Explicit interfaces. No `React.FC`.

## 2. Security & Validation (OWASP)
- **XSS**: Sanitize HTML (DOMPurify). No `dangerouslySetInnerHTML`.
- **Forms**: `React Hook Form` + `Zod`. Validate strings, email, passwords on client.
- **Auth**: Store tokens in httpOnly cookies (preferred) or memory. NOT localStorage.
- **CSP**: Strict Content-Security-Policy headers.

## 3. Performance & A11y
- **Splitting**: `React.lazy` for routes.
- **Images**: Explicit `width`/`height`. Use `WebP`.
- **A11y**: WCAG 2.1 AA. Semantic HTML (`<button>`, not `<div>`). `aria-label` where needed.
- **Keys**: Stable IDs for lists. No array indexes.

## 4. Testing & Quality
- **Unit**: Vitest + RTL. Test behavior, not implementation.
- **E2E**: Playwright for critical flows (Login, Checkout).
- **Strictness**: `noImplicitAny`, `noUncheckedIndexedAccess`.
- **Hooks**: Custom hooks for business logic. Keep components declarative.

## 5. Error Handling
- UI: Error Boundaries for crash protection.
- API: Handle loading/error states in specific components. No silent fails.

---

# Reference Examples

## Component with Props Interface
```tsx
// components/ui/Button.tsx
export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled = false,
  children,
  onClick,
}: ButtonProps) {
  return (
    <button
      className={cn(styles.base, styles[variant], styles[size])}
      disabled={disabled || isLoading}
      onClick={onClick}
      aria-busy={isLoading}
    >
      {isLoading ? <Spinner /> : children}
    </button>
  );
}
```

## React Query Hook
```tsx
// hooks/useUsers.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getUsers, createUser } from '@/api/users';
import type { User, CreateUserPayload } from '@/types/user';

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createUser,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}
```

## API Client
```tsx
// api/users.ts
import { api } from '@/lib/axios';
import type { User, CreateUserPayload } from '@/types/user';

interface APIResponse<T> {
  success: boolean;
  data: T;
}

export async function getUsers(): Promise<User[]> {
  const res = await api.get<APIResponse<User[]>>('/users');
  return res.data.data;
}

export async function createUser(payload: CreateUserPayload): Promise<User> {
  const res = await api.post<APIResponse<User>>('/users', payload);
  return res.data.data;
}
```

## Form with Zod Validation
```tsx
// components/UserForm.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Min 8 characters').regex(/[A-Z]/, 'Need uppercase'),
  name: z.string().min(1, 'Required').max(100),
});

type FormData = z.infer<typeof schema>;

export function UserForm({ onSubmit }: { onSubmit: (data: FormData) => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('email')} aria-invalid={!!errors.email} />
      {errors.email && <span role="alert">{errors.email.message}</span>}
      
      <input type="password" {...register('password')} aria-invalid={!!errors.password} />
      {errors.password && <span role="alert">{errors.password.message}</span>}
      
      <input {...register('name')} />
      <button type="submit">Submit</button>
    </form>
  );
}
```

## Page with Loading/Error/Empty States
```tsx
// pages/UsersPage.tsx
import { useUsers } from '@/hooks/useUsers';
import { UserCard } from '@/components/UserCard';
import { Skeleton, ErrorMessage, EmptyState } from '@/components/ui';

export default function UsersPage() {
  const { data: users, isLoading, error, refetch } = useUsers();

  if (isLoading) return <Skeleton count={3} />;
  if (error) return <ErrorMessage error={error} onRetry={refetch} />;
  if (!users?.length) return <EmptyState message="No users found" />;

  return (
    <div>
      {users.map((user) => (
        <UserCard key={user.id} user={user} />
      ))}
    </div>
  );
}
```
