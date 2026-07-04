# Admin Panel Core — Specification

**Change**: admin-panel-core
**Project**: whatsapp-business-base
**Phase**: Spec
**Date**: 2026-07-04

---

## Overview

Deliver the core admin panel UI for whatsapp-business-base. Backend (DB, Auth, WhatsApp, AI Agent) is complete from Changes 1-3. This change wires the frontend: auth-protected layout, navigation, dashboard with live stats/actions, conversation inbox, and login page.

**10 modules**, 1 existing file modification (`src/app/page.tsx`).

**Branding note**: This is a neutral business platform, NOT Mrs Muzzarella. No gold gradients, no italian identity. Dark theme with accent color from CSS variables (`oklch` palette in `globals.css`).

---

## 1. Admin Layout (`src/app/(admin)/layout.tsx`)

### Purpose
Route group layout that wraps all admin pages. Server component that checks authentication and renders the shared shell (sidebar + topbar + page content).

### Requirement: Auth guard

The layout MUST:
- Import and call `auth()` from `@/auth`
- If `session` is falsy, return `redirect("/login")` (uses Next.js `redirect()`, not `useRouter`)
- Import and render `<Toaster />` from `sonner` (position top-right, richColors, closeButton, duration 4000)
- Wrap page content with `<AdminSidebar />` and `<AdminTopbar />`
- Use `dark` background via TW class `bg-[#0a0a0a]` on the container

#### Scenario: Authenticated user

- GIVEN the user has a valid session
- WHEN the layout renders
- THEN the layout MUST render the admin shell (sidebar + topbar + children content)
- AND `<Toaster />` MUST be available for toast notifications

#### Scenario: Unauthenticated user

- GIVEN there is no valid session
- WHEN the layout renders
- THEN a redirect to `/login` MUST be triggered

#### Scenario: Loading state

- GIVEN `auth()` is resolving
- THEN Next.js streaming MUST show a loading state via the nearest `loading.tsx`
- AND no flash of unauthenticated content is shown

#### Scenario: Admin layout structure

- GIVEN the user is authenticated
- WHEN the layout renders
- THEN the DOM structure MUST be:
  - Full-height flex container (`min-h-screen`)
  - Sidebar on the left (hidden on mobile by default, `lg:block`)
  - Main content area: Topbar at top, then scrollable page content with `PageTransition`

#### Edge case: Session expired mid-session

- GIVEN the session was valid at render time but expires during navigation
- THEN the next page navigation within the admin panel will re-check in the new layout render
- AND the user will be redirected to `/login`

---

## 2. Admin Sidebar (`src/components/admin/sidebar.tsx`)

### Purpose
Desktop sidebar with navigation links for all admin sections. Client component for interactivity (active state tracking, collapse toggle).

### Requirement: Navigation links

The sidebar MUST render the nav items defined in `nav-items.ts`:
| Label | Icon | href |
|-------|------|------|
| Dashboard | `LayoutDashboard` | `/admin` |
| Conversations | `MessageSquare` | `/admin/conversations` |
| Leads | `Users` | `/admin/leads` |
| Products | `Package` | `/admin/products` |
| Orders | `ShoppingCart` | `/admin/orders` |
| Agent | `Bot` | `/admin/agent` |
| Analytics | `BarChart3` | `/admin/analytics` |

#### Scenario: Active state highlighting

- GIVEN the current pathname is `/admin/conversations`
- WHEN the sidebar renders
- THEN the "Conversations" nav item MUST have an active indicator
- AND the active indicator MUST use the `accent` background color (`bg-accent`)
- AND the active text MUST use `text-accent-foreground`

#### Scenario: Inactive nav items

- GIVEN a nav item does NOT match the current pathname
- WHEN the sidebar renders
- THEN the item MUST use muted styling (`text-muted-foreground`)
- AND `hover:text-foreground` on hover

#### Scenario: Collapsed/expanded support

- GIVEN the sidebar is in expanded state
- THEN each nav item MUST show the icon + label text
- GIVEN the sidebar is in collapsed state
- THEN each nav item MUST show only the icon (tooltip on hover shows label)
- AND the collapsed width MUST be `w-16` (icon-only)

#### Scenario: Logo/brand at top

- GIVEN the sidebar renders
- THEN the top MUST show the brand logo/name
- AND it SHALL link to `/admin`
- AND it SHALL show "WBB" text in expanded state, only icon in collapsed

#### Scenario: Collapse toggle button

- GIVEN the sidebar renders
- THEN a collapse toggle button MUST be at the bottom of the sidebar
- AND clicking it MUST toggle between collapsed/expanded state
- AND the state MUST be persisted in `localStorage`

#### Scenario: Mobile sidebar

- GIVEN the viewport is below `lg` breakpoint
- THEN the sidebar MUST be hidden (`hidden lg:flex`)
- AND a mobile sheet/drawer variant is triggered from the topbar hamburger menu

#### Edge case: Unknown route

- GIVEN the current pathname does not match any nav item
- WHEN the sidebar renders
- THEN no nav item is marked active
- AND the sidebar renders without error

#### Edge case: localStorage not available

- GIVEN `localStorage` is not available (SSR, private browsing restriction)
- WHEN the collapse state is toggled
- THEN the sidebar MUST still toggle
- AND the state MUST default to expanded on next render (graceful degradation)

### Layout constraint

The sidebar MUST be part of the main flex layout, NOT a fixed/overlay element on desktop. This ensures the main content area naturally resizes when the sidebar collapses.

---

## 3. Admin Topbar (`src/components/admin/topbar.tsx`)

### Purpose
Top navigation bar showing current user info and mobile sidebar trigger. Client component.

### Requirement: User display

The topbar MUST:
- Show the current user's name (or email fallback) on the left of the right-aligned section
- Show user avatar initials (first letter of name, or first letter of email as fallback) inside an `<Avatar>` component
- Show the user email in muted text below the name in a dropdown or tooltip

#### Scenario: User has name

- GIVEN the session user has a `name` value
- WHEN the topbar renders
- THEN the user's name MUST be displayed
- AND the avatar MUST show the first letter of the name

#### Scenario: User has no name

- GIVEN the session user has no `name` (null)
- WHEN the topbar renders
- THEN the user's email MUST be displayed instead of the name
- AND the avatar MUST show the first letter of the email

#### Scenario: Logout button

- GIVEN the topbar renders
- THEN a logout button MUST be present (could be inside a `<DropdownMenu>` with "Cerrar sesión" option)
- WHEN the logout button is clicked
- THEN `signOut()` from `@/auth` MUST be called
- AND the user MUST be redirected to `/login`

#### Scenario: Mobile hamburger menu

- GIVEN the viewport is below `lg` breakpoint
- THEN a hamburger button (Menu icon from lucide-react) MUST be visible on the left side of the topbar
- WHEN clicked
- THEN a `<Sheet>` component (from shadcn/ui) MUST slide in from the left
- AND the sheet MUST contain the same nav items as the desktop sidebar (reuse `<SidebarContent />`)
- AND the sheet MUST have a close button

#### Scenario: Desktop topbar

- GIVEN the viewport is `lg` and above
- THEN the hamburger menu MUST be hidden
- AND no mobile sheet is shown

#### Scenario: Loading state

- GIVEN the session data is not yet available (SSR streaming)
- THEN the topbar MUST render a `<Skeleton>` placeholder for the avatar and name
- AND the component MUST NOT throw or show empty state

#### Edge case: Logout error

- GIVEN `signOut()` fails (network error)
- WHEN the user clicks logout
- THEN a toast notification MUST show the error
- AND the user MUST remain on the page (no redirect)

---

## 4. Nav Items (`src/components/admin/nav-items.ts`)

### Purpose
Centralized navigation item definitions. Pure data, no JSX. Separated for easy modification by non-React developers.

### Requirement: Nav item array

The module MUST export `ADMIN_NAV_ITEMS` as a typed array:

```typescript
export interface AdminNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  disabled?: boolean;
}
```

The default export or named export MUST contain exactly these items:

| label | href | icon |
|-------|------|------|
| Dashboard | `/admin` | `LayoutDashboard` |
| Conversations | `/admin/conversations` | `MessageSquare` |
| Leads | `/admin/leads` | `Users` |
| Products | `/admin/products` | `Package` |
| Orders | `/admin/orders` | `ShoppingCart` |
| Agent | `/admin/agent` | `Bot` |
| Analytics | `/admin/analytics` | `BarChart3` |

#### Scenario: Adding a new nav item

- GIVEN a developer adds a new entry to the array
- WHEN the sidebar renders
- THEN the new item automatically appears in the navigation
- AND no other component code needs modification

#### Scenario: Disabling a nav item

- GIVEN a nav item has `disabled: true`
- WHEN the sidebar renders
- THEN the item MUST be rendered with reduced opacity (`opacity-50`)
- AND clicking it MUST NOT navigate
- AND the cursor MUST be `not-allowed`

#### Scenario: Empty array

- GIVEN the array is empty
- WHEN the sidebar renders
- THEN the sidebar MUST show no navigation items
- AND the component MUST NOT crash

#### Edge case: Duplicate href values

- GIVEN two items have the same href
- WHEN the sidebar renders
- THEN both items render (design choice — developer responsibility)

---

## 5. Dashboard (`src/app/(admin)/admin/page.tsx` + `dashboard-client.tsx`)

### Purpose
Server component that fetches dashboard statistics from the database, then delegates rendering to a client wrapper for animations.

### Server component (`page.tsx`)

#### Requirement: Stats queries

The server component MUST execute the following queries in parallel using `Promise.all()`:
1. **Total orders**: `count(*)` from `orders`
2. **Orders today**: `count(*)` from `orders` where `createdAt >= today_start`
3. **New clients (7d)**: `count(*)` from `leads` where `createdAt >= 7_days_ago`
4. **Total leads**: `count(*)` from `leads`

#### Requirement: Recent activity feed

The server component MUST fetch the 10 most recent "activities" combining:
- Last 5 orders (with customerName, status, createdAt)
- Last 5 leads (with name, phone, status, createdAt)

Both arrays sorted by `createdAt` descending, merged, and limited to 10 total.

The type returned MUST be:
```typescript
interface ActivityItem {
  type: "order" | "lead";
  id: number;
  label: string; // customer name or lead name/phone
  detail: string; // status or description
  timestamp: Date;
}
```

#### Requirement: Action cards

The server component MUST compute 5 action card values:

| Card | Query | Label |
|------|-------|-------|
| Ready orders | Orders WHERE status = "ready" | Pedidos listos para entregar |
| Stuck preparing | Orders WHERE status = "preparing" AND updatedAt < 30min ago | En preparación (+30min) |
| Unpaid orders | Orders WHERE paymentStatus = "pending" AND paymentMethod IS NOT NULL | Pendientes de pago |
| Stale chats | Conversations WHERE status = "active" AND lastMessageAt < 24h ago AND no human override | Chats sin respuesta |
| Fresh leads | Leads WHERE status = "new" AND createdAt > 24h ago | Leads nuevos |

#### Scenario: All data available

- GIVEN the database has orders, leads, and conversations
- WHEN the dashboard renders
- THEN 4 stat cards show correct counts
- AND the activity feed shows 10 items
- AND action cards show counts for each category

#### Scenario: Empty database

- GIVEN no orders, no leads, no conversations exist
- WHEN the dashboard renders
- THEN all stat cards MUST show `0`
- AND the activity feed MUST show "No hay actividad reciente"
- AND action cards MUST show `0` for all

#### Scenario: Activity feed partial data (only orders)

- GIVEN 5 orders and 0 leads exist
- WHEN the activity feed fetches
- THEN all 5 orders MUST appear
- AND no placeholder for missing leads is shown

#### Scenario: Action card with zero count

- GIVEN no orders are "ready"
- WHEN the action card renders
- THEN the card MUST show "0" prominently
- AND no CTA button is rendered (or it's disabled)

#### Scenario: Activity feed with mixed types

- GIVEN 3 orders and 3 leads in the time window
- WHEN the activity feed renders
- THEN items MUST be sorted by timestamp descending
- AND each item MUST correctly identify its type and content

#### Edge case: DB query error

- GIVEN the database is unreachable
- WHEN the dashboard server component tries to fetch stats
- THEN the component MUST catch the error and render an error state
- AND a toast notification with "Error al cargar estadísticas" MUST appear via `dashboard-client.tsx`

### Client wrapper (`dashboard-client.tsx`)

#### Scenario: Stagger animation

- GIVEN the dashboard client renders
- THEN stat cards MUST enter with a stagger animation (`staggerChildren: 0.1`)
- AND each card MUST fade up from below (`y: 20` → `y: 0`, `opacity: 0` → `1`)
- AND the animation MUST use Framer Motion

#### Scenario: Activity feed interactivity

- GIVEN the activity feed renders
- THEN clicking an order item MUST navigate to the orders page (placeholder or `/admin/orders` eventually)
- AND clicking a lead item MUST navigate to the leads page (eventually `/admin/leads`)

#### Scenario: Action card CTA buttons

- GIVEN action cards show non-zero counts
- THEN each action card MUST have a contextual button:
  - Ready orders: "Ver pedidos" → links to `/admin/orders`
  - Stuck preparing: "Ver pedidos" → links to `/admin/orders`
  - Unpaid orders: "Gestionar" → links to `/admin/orders`
  - Stale chats: "Responder" → links to `/admin/conversations`
  - Fresh leads: "Revisar" → links to `/admin/leads`

#### Edge case: Rapid navigation away

- GIVEN the user navigates away while stagger animation is in progress
- THEN the component MUST clean up animation frames
- AND no React state update on unmounted component error

### Loading state (`loading.tsx`)

The admin directory MUST include a `loading.tsx` that renders a skeleton matching the dashboard layout:
- 4 skeleton stat cards in a grid
- 2 skeleton cards (activity feed + action cards) in a row below
- Uses `<Skeleton>` component with pulse animation

---

## 6. Conversations Inbox (`src/app/(admin)/admin/conversations/page.tsx` + `src/components/messages/`)

### Purpose
Full 3-panel conversation inbox for managing customer chats. Client component with React Query polling for real-time updates.

### Requirement: 3-panel layout (desktop)

The conversations page MUST render a 3-column layout:
```
| Conversation List (320px) | Chat Panel (flex-1) | Customer Context (320px) |
```

#### Scenario: Desktop layout

- GIVEN the viewport is `lg` and above
- THEN all 3 panels are visible side by side
- AND the customer context panel is on the right

#### Scenario: Mobile layout

- GIVEN the viewport is below `lg`
- THEN only the chat panel is visible (single panel)
- AND the conversation list is accessible via a back button
- AND the customer context is accessible via an info button (Sheet)

#### Scenario: No conversation selected

- GIVEN the user first opens the page with no selected conversation
- THEN the chat panel MUST show a placeholder: "Seleccioná una conversación"
- AND the customer context panel MUST be hidden or show placeholder

### Conversation List Sidebar

#### Scenario: Conversation list renders

- GIVEN conversations are loaded from the API
- THEN each conversation MUST show:
  - Customer name (or phone number fallback)
  - Last message preview (truncated to 60 chars)
  - Time/date of last message (relative: "hace 5 min", "ayer", "12/06")
  - Status indicator dot (green = active, gray = closed/archived)
  - Channel badge (WhatsApp/Telegram icon)

#### Scenario: Conversation selection

- GIVEN the user clicks a conversation in the list
- THEN the selected conversation MUST be highlighted (accent background)
- AND the chat panel MUST load messages for that conversation
- AND the customer context panel MUST show lead info for that conversation

#### Scenario: Search/filter conversations

- GIVEN the user types in the search box above the conversation list
- THEN the list MUST filter locally by customer name or phone number
- AND the search input MUST have a debounce of 300ms

#### Scenario: Empty conversation list

- GIVEN no conversations exist (fresh install)
- THEN the list MUST show "No hay conversaciones"
- AND a subtle icon/illustration MAY be shown

#### Scenario: Conversation list loading

- GIVEN conversations are being fetched
- THEN 5 skeleton rows MUST show with pulse animation
- AND each skeleton shows a circle (avatar) + two lines (name, preview)

### Chat Panel

#### Scenario: Message bubbles

- GIVEN messages are loaded for a conversation
- THEN messages MUST be displayed as chat bubbles:
  - User messages (role: "user"): right-aligned, primary background
  - Assistant messages (role: "assistant"): left-aligned, muted background
  - Human messages (role: "human"): left-aligned, different accent (green/highlight)
  - System messages (role: "system"): centered, muted, smaller text

#### Scenario: Message display format

- GIVEN a message has `contentAttributes` with media
- THEN the media thumbnail MUST be shown inline
- AND clicking the thumbnail MUST open the image in a new tab or dialog
- AND the text caption (if any) MUST be shown below the media

#### Scenario: Auto-scroll to bottom

- GIVEN the chat panel is loaded with messages
- THEN the scroll position MUST be at the bottom (latest message)
- AND new incoming messages MUST auto-scroll
- UNLESS the user has scrolled up (manual scroll override)

#### Scenario: Message timestamps

- GIVEN messages are rendered
- THEN each message MUST show its timestamp on hover or as a small label
- AND messages grouped by same sender within 5 minutes MUST NOT repeat the timestamp header

#### Scenario: Send message

- GIVEN the user types a message and presses Enter (or clicks Send)
- THEN a reply mutation fires via React Query
- AND the message is optimistically added to the UI
- AND the input is cleared immediately
- AND on success, the message is confirmed in the list
- AND on error, the optimistic message shows an error state with retry option

#### Scenario: Text input states

- GIVEN the input is empty
- THEN the Send button MUST be disabled (grayed out)
- GIVEN the user types text
- THEN the Send button MUST become active (primary color)

#### Scenario: Empty reply (whitespace only)

- GIVEN the user types only whitespace characters
- WHEN the form is submitted
- THEN the input MUST be trimmed
- AND if the result is empty, no message is sent
- AND the input MUST NOT clear

#### Scenario: Very long message

- GIVEN the message exceeds 4096 characters
- WHEN the form is submitted
- THEN the message MUST be split and sent as multiple messages
- OR a warning icon and toast appears: "El mensaje supera el límite de WhatsApp"

### Customer Context Panel

#### Scenario: Lead info display

- GIVEN a conversation has an associated lead
- THEN the customer context panel MUST show:
  - Lead name (or phone number)
  - Lead status badge ("Nuevo", "Contactado", "Convertido", "Perdido" with appropriate colors)
  - Email (if available)
  - Address (if available)
  - Tags (as small pills, if any)
  - Notes (if available, truncated with "Ver más" expand)

#### Scenario: Past orders

- GIVEN the lead has past orders
- THEN each order MUST be shown as a compact card:
  - Order ID, status badge, total items, date
  - Clicking navigates to order detail (eventually)

#### Scenario: No lead associated

- GIVEN the conversation has no linked lead
- THEN the customer context panel MUST show "Sin datos del cliente"
- AND an option to "Crear lead" button

#### Scenario: Actions available

- GIVEN the customer context panel renders
- THEN action buttons MUST be available:
  - "Crear pedido" — placeholder (to be wired in Change 5)
  - "Alternar modo humano" — toggles `humanOverrideUntil` on the conversation

#### Scenario: Human override toggle

- GIVEN the human override is OFF
- THEN the button shows "Activar modo humano"
- WHEN clicked
- THEN `humanOverrideUntil` is set to `now + 30 min` on the conversation
- AND the button changes to "Desactivar modo humano" with danger styling
- AND a toast confirms: "Modo humano activado por 30 minutos"

- GIVEN the human override is ON (not expired)
- THEN the button shows "Desactivar modo humano" with danger styling
- WHEN clicked
- THEN `humanOverrideUntil` is set to `null`
- AND the button reverts to "Activar modo humano"
- AND a toast confirms: "Modo humano desactivado"

- GIVEN `humanOverrideUntil` has expired
- THEN the button MUST show as if OFF (not active)

#### Scenario: Loading context panel

- GIVEN lead data is still fetching
- THEN skeleton placeholders MUST show for each section

#### Scenario: Context panel for unlinked conversations

- GIVEN no lead is linked to this conversation
- THEN the panel shows minimal info (just phone number)
- AND a "Crear lead" button is prominent

### React Query hooks

#### Scenario: Conversations list polling

- GIVEN the conversations page is mounted
- THEN `useQuery` fetches `GET /api/conversations` with `refetchInterval: 15000`
- AND `staleTime: 10000`
- AND the query key is `["conversations"]`

#### Scenario: Messages polling

- GIVEN a conversation is selected
- THEN `useQuery` fetches `GET /api/conversations/[id]/messages` with `refetchInterval: 10000`
- AND the query key is `["conversations", id, "messages"]`
- AND this only runs when a conversation is selected (`enabled: !!selectedId`)

#### Scenario: Send reply mutation

- GIVEN the user sends a reply
- THEN `useMutation` calls `POST /api/conversations/[id]/messages`
- AND on success, invalidates `["conversations", id, "messages"]`
- AND on error, shows a toast with the error message

#### Scenario: Human override mutation

- GIVEN the user toggles human override
- THEN `useMutation` calls `PATCH /api/conversations/[id]` with `{ humanOverrideUntil: new Date(...) }` or `null`
- AND on success, invalidates the conversations list query

#### Scenario: Network reconnection

- GIVEN the network was offline and comes back
- THEN React Query automatic refetch resumes
- AND the conversation list updates with fresh data

#### Edge case: 10+ conversations

- GIVEN there are more than 50 conversations
- THEN the list MUST show the first 50
- AND implement "infinite scroll" or "Load more" pagination
- AND the query MUST accept a cursor/page parameter

#### Edge case: Rapid send

- GIVEN the user clicks Send multiple times quickly
- THEN the mutation `isPending` state MUST disable the button
- AND only one mutation fires at a time

---

## 7. Login Page (`src/app/login/`)

### Purpose
Login page with email/password form, Zod validation, server action, error handling, and session-aware redirect.

### Page structure

```
src/app/login/
├── page.tsx           # Server: check session, redirect to /admin if authenticated
├── login-shell.tsx    # Client: centered card with glow background
├── login-form.tsx     # Client: form with useActionState + Zod
└── actions.ts         # Server: credentials signIn via next-auth
```

### Server component (`page.tsx`)

#### Scenario: Already authenticated

- GIVEN the user has a valid session
- WHEN they visit `/login`
- THEN `redirect("/admin")` MUST be called
- AND the login form is never rendered

#### Scenario: Not authenticated

- GIVEN the user has no session
- WHEN they visit `/login`
- THEN the login shell + form MUST render

### Login form (`login-form.tsx`)

#### Scenario: Email + password form

- GIVEN the form renders
- THEN it MUST show:
  - Email input with type="email", placeholder "correo@ejemplo.com"
  - Password input with type="password", placeholder "••••••••"
  - Submit button "Iniciar sesión"
  - Both inputs are required

#### Scenario: Zod validation — empty fields

- GIVEN the user submits without filling in the email
- THEN the form MUST show validation: "El correo es requerido"
- GIVEN the user submits without filling in the password
- THEN the form MUST show validation: "La contraseña es requerida"

#### Scenario: Zod validation — invalid email

- GIVEN the user types "notanemail"
- THEN the form MUST show validation: "Correo electrónico inválido"
- AND the form MUST NOT submit

#### Scenario: Successful login

- GIVEN valid email and password are submitted
- WHEN `signIn("credentials", { email, password, redirectTo: "/admin" })` succeeds
- THEN the user is redirected to `/admin`

#### Scenario: Invalid credentials

- GIVEN wrong email or password
- WHEN `signIn` fails
- THEN an error message MUST appear: "Credenciales inválidas"
- AND the form MUST remain on the page
- AND no redirect occurs

#### Scenario: Network error

- GIVEN the server is unreachable
- WHEN `signIn` throws
- THEN an error message MUST appear: "Error de conexión. Intentá de nuevo."
- AND the submit button MUST re-enable

#### Scenario: Loading state

- GIVEN the form is submitting
- THEN the submit button MUST show a loading spinner
- AND both inputs MUST be disabled
- AND the button text changes to "Ingresando..."

#### Scenario: Form remembers last input

- GIVEN invalid credentials are submitted
- WHEN the form re-renders with error
- THEN the email input MUST retain its value
- AND the password input MUST be cleared (security)

#### Edge case: Rapid double-click

- GIVEN the user double-clicks the submit button
- THEN the `isPending` state from `useActionState` MUST prevent duplicate submission
- AND only one auth request is made

### Login shell (`login-shell.tsx`)

#### Scenario: Centered card design

- GIVEN the login shell renders
- THEN it MUST be centered both vertically and horizontally
- AND have a subtle card with dark background (`bg-card`)
- AND show the app logo/title "WhatsApp Business Base" above the form
- AND a subtitle "Ingresá a tu panel de administración"

#### Scenario: Background glow

- GIVEN the login shell renders
- THEN there MUST be a subtle glow effect behind the card
- AND it uses a CSS gradient or blur

---

## 8. UI Components (`src/components/ui/`)

### Purpose
Library of reusable UI primitives using `class-variance-authority` + `tailwind-merge` + `tw-animate-css`, following shadcn/ui conventions adapted for Tailwind v4.

### Component list

All 13 components MUST be created:

| Component | File | Key Variants |
|-----------|------|--------------|
| Button | `button.tsx` | default, destructive, outline, secondary, ghost, link; sizes: default, sm, lg, icon |
| Card | `card.tsx` | Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter |
| Input | `input.tsx` | default, file; error state via `aria-invalid` |
| Badge | `badge.tsx` | default, secondary, destructive, outline |
| Table | `table.tsx` | Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableCaption |
| Dialog | `dialog.tsx` | Dialog, DialogTrigger, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription, DialogClose |
| Select | `select.tsx` | SelectTrigger, SelectValue, SelectContent, SelectItem |
| Skeleton | `skeleton.tsx` | default (pulse animation via `tw-animate-css`) |
| Avatar | `avatar.tsx` | Avatar, AvatarImage, AvatarFallback |
| Separator | `separator.tsx` | horizontal, vertical |
| ScrollArea | `scroll-area.tsx` | custom scrollbar (consistent with globals.css) |
| Tooltip | `tooltip.tsx` | TooltipProvider, Tooltip, TooltipTrigger, TooltipContent |
| DropdownMenu | `dropdown-menu.tsx` | DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator |

### Requirement: cn() utility in `src/lib/utils.ts`

A `cn()` utility MUST be created using `clsx` + `tailwind-merge`:

```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### Requirement: CVA + cn pattern

Each component MUST use this pattern:

```typescript
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: { ... },
      size: { ... },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);
```

#### Scenario: Button renders with default variant

- GIVEN `<Button>Click me</Button>`
- THEN it MUST render a `<button>` element with `bg-primary text-primary-foreground` classes
- AND `hover:bg-primary/90`

#### Scenario: Button renders with destructive variant

- GIVEN `<Button variant="destructive">Delete</Button>`
- THEN it MUST render with `bg-destructive text-destructive-foreground`
- AND `hover:bg-destructive/90`

#### Scenario: Button rendered as child (asChild)

- GIVEN `<Button asChild><a href="/admin">Dashboard</a></Button>`
- THEN it MUST render an `<a>` element instead of `<button>`
- AND the CVA classes MUST be applied to the anchor

#### Scenario: Card compound component

- GIVEN `<Card><CardHeader><CardTitle>Title</CardTitle></CardHeader><CardContent>Content</CardContent></Card>`
- THEN it MUST render a structured card with proper border, rounded corners, padding
- AND the title is slightly larger and bold

#### Scenario: Skeleton animation

- GIVEN `<Skeleton className="h-4 w-[250px]" />`
- THEN it MUST render a gray animated placeholder with pulse effect
- AND use `animate-pulse` from `tw-animate-css`

#### Scenario: Avatar fallback

- GIVEN `<Avatar><AvatarFallback>JD</AvatarFallback></Avatar>`
- THEN it MUST render a circular avatar with "JD" centered inside
- AND use `bg-muted` background

#### Scenario: Dialog renders with overlay

- GIVEN a Dialog is open
- THEN the overlay MUST cover the full viewport (`inset-0`) with `bg-black/50`
- AND the content MUST be centered with a slide-up entrance animation

#### Edge case: All components dark theme

- GIVEN the page has `.dark` class on `<html>`
- THEN all components MUST use CSS variables from globals.css
- AND render correctly with dark backgrounds and light text

#### Edge case: Empty content

- GIVEN `<Badge></Badge>` or `<Badge>{""}</Badge>`
- THEN it MUST render with zero padding or minimal size
- AND not throw

---

## 9. Page Transition (`src/components/admin/page-transition.tsx`)

### Purpose
Framer Motion wrapper for admin page content that provides smooth entry/exit animations during route transitions.

### Requirement: AnimatePresence wrapper

The component MUST:
- Accept `children` as prop
- Accept a `key` prop (typically `pathname` from `usePathname()`)
- Wrap content with `<AnimatePresence mode="wait">`
- Animate entry: `opacity: 0` → `1`, `y: 8` → `0`, duration 0.2s
- Animate exit: `opacity: 1` → `0`, `y: 0` → `-8`, duration 0.15s

#### Scenario: Route change within admin

- GIVEN the user navigates from `/admin` to `/admin/conversations`
- THEN the current page content fades out slightly upward
- AND the new page content fades in slightly upward
- AND the transition duration is ~200ms

#### Scenario: First load

- GIVEN the user first lands on `/admin`
- THEN the page content fades in with no exit animation
- AND the transition happens once

#### Scenario: Rapid navigation

- GIVEN the user clicks multiple nav items quickly
- THEN the `mode="wait"` ensures the current animation completes before starting a new one
- AND no visual glitch or overlapping elements occur

#### Edge case: Accessibility (reduced motion)

- GIVEN the user has `prefers-reduced-motion: reduce`
- THEN the animation MUST be disabled
- AND content must appear instantly (no transition)

#### Edge case: Missing key prop

- GIVEN no `key` prop is provided
- THEN `AnimatePresence` may not trigger
- AND content renders without animation (no breakage)

---

## 10. Landing/Home Page Update (`src/app/page.tsx`)

### Purpose
Update the existing landing page to include a link to the login page, providing a clear entry point for admin users.

### Existing file

The current `page.tsx` at root already has a basic landing page with a login link. The structure is already correct for this change.

#### Scenario: Landing page renders

- GIVEN a non-authenticated user visits `/`
- THEN the landing page MUST show:
  - "WhatsApp Business Base" as title
  - A short description: "Plataforma de WhatsApp + IA para tu negocio"
  - A prominent "Iniciar sesión" button linking to `/login`

#### Scenario: Login link navigates

- GIVEN the user clicks "Iniciar sesión"
- THEN they navigate to `/login`
- AND the login form renders

#### Edge case: No session check needed

- GIVEN the landing page is a server component
- THEN it MUST NOT check `auth()` — the landing page is public
- AND any user can view it, regardless of auth status

---

## Summary

### Coverage

| Module | Happy Paths | Edge Cases | Error States |
|--------|------------|------------|--------------|
| Admin Layout | 4 | 1 | 0 |
| Admin Sidebar | 7 | 2 | 0 |
| Admin Topbar | 6 | 1 | 0 |
| Nav Items | 3 | 1 | 0 |
| Dashboard | 6 | 1 | 1 |
| Conversations Inbox | 16 | 2 | 2 |
| Login Page | 6 | 1 | 2 |
| UI Components | 8 | 1 | 0 |
| Page Transition | 3 | 2 | 0 |
| Landing Page | 2 | 1 | 0 |
| **Total** | **61** | **13** | **5** |

### Next Step

Ready for design (sdd-design).
