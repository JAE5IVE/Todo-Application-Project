# TodoFlow

A full-featured, production-grade Todo application built with React 19. Connects to a live REST API, supports real-time updates, offline caching, authentication, protected routes, dark and light themes, and full CRUD operations — all in a single-file component architecture with no build configuration required beyond a standard Vite setup.

---

## Table of Contents

- [Project Description](#project-description)
- [Features](#features)
- [Setup Instructions](#setup-instructions)
- [Available Scripts](#available-scripts)
- [Technology Choices and Reasoning](#technology-choices-and-reasoning)
- [Project Structure](#project-structure)
- [Known Issues and Future Improvements](#known-issues-and-future-improvements)

---

## Project Description

TodoFlow is a task management application that demonstrates modern React engineering patterns. It integrates with the [api.oluwasetemi.dev](https://api.oluwasetemi.dev) REST API to persist tasks, uses JWT authentication to identify users, and filters all task data client-side by ownership so each user only sees and manages their own tasks.

The project was built as a single JSX file to keep the architecture transparent and portable, while still implementing every feature expected of a production application: error boundaries, suspense, protected routes, WebSocket notifications, offline caching, accessibility, and responsive design.

---

## Features

### Authentication and User Management

- Register and login with email and password
- JWT token stored in localStorage and attached to every API request as a Bearer token
- Automatic redirect to login for any protected route
- User profile page showing account details fetched from the `/auth/me` endpoint
- Sign out clears all stored credentials and redirects to login

### Task Management (CRUD)

- Create tasks using a modal form with title and description fields
- Edit existing tasks with a pre-filled form showing current values
- Delete tasks with a confirmation dialog to prevent accidental removal
- Toggle tasks between TODO and DONE with a single click on the status circle
- All mutations send the field names the API requires: `name` and `status`

### Task List and Display

- Paginated list showing 10 tasks per page
- Only shows tasks owned by the currently authenticated user, filtered client-side by matching the `owner` field in each task against the `userId` decoded from the JWT
- Search tasks by title using React `startTransition` so typing never blocks the UI
- Filter tasks by status: All, Complete, or Incomplete
- Each card shows the task title, status badge, and creation date
- Edit and delete controls are hidden on any task the current user does not own

### Routing

- Client-side routing built on the History API with no full page reloads
- Routes: `/`, `/todos/:id`, `/login`, `/register`, `/profile`, `/test-error`
- Custom 404 page rendered for any undefined route
- Protected routes redirect unauthenticated users to `/login`

### Error Handling

- React `ErrorBoundary` class component catches all render errors and shows a recovery UI
- Visit `/test-error` to trigger the error boundary intentionally
- API errors are displayed as toast notifications with the exact message returned by the server
- All error values are safely serialized to strings before display

### Real-Time Notifications

- WebSocket connection to `wss://api.oluwasetemi.dev/ws/tasks`
- Automatic reconnection with a 5-second backoff when the connection drops
- Incoming events trigger a toast notification and a cache-busting refetch of the task list
- Notification center in the navbar shows all received events with timestamps and a clear-all button
- WebSocket errors are caught silently so they never interrupt the main UI

### Offline Support

- Two-layer cache combining an in-memory store for the current session with localStorage for persistence across page refreshes
- Cached data is served immediately while a fresh network request runs in the background
- An offline banner appears automatically when `navigator.onLine` is false

### Theme

- Dark and light mode toggle button in the navbar on every page
- Defaults to the operating system color scheme preference on first visit
- Preference is saved to localStorage and restored on every return visit
- Sun icon is shown in dark mode; moon icon is shown in light mode
- Light mode is applied by toggling a class on the `html` element and overriding Tailwind color tokens via CSS

### Accessibility

- Skip-to-content link at the top of every page for keyboard-only users
- Semantic HTML throughout: `header`, `main`, `article`, `nav`, `dl`, `dt`, `dd`
- All interactive elements show a visible focus ring on keyboard navigation using `focus-visible`
- Modals trap focus within the dialog, close on the Escape key, and prevent body scroll while open
- ARIA attributes used: `role="dialog"`, `aria-modal`, `aria-label`, `aria-live`, `aria-pressed`, `aria-current`, `aria-expanded`, `aria-required`, `aria-invalid`, `aria-describedby`
- Toast notifications use `role="alert"` and `aria-live="polite"` so screen readers announce them
- Color contrast meets WCAG AA in both dark and light themes

### SEO

- `document.title` is updated on every route change
- A meta description tag is created and updated on each navigation

### Design

- Dark-first design with a violet accent color
- DM Sans for all body text, DM Mono for technical values like task IDs
- Mobile-first responsive layout
- Toast notifications animate in with a slide-up entrance
- Hover and focus transitions on all interactive elements
- Favicon embedded as an inline SVG data URI so no extra asset file is needed

---

## Setup Instructions

### Prerequisites

- Node.js 18 or later
- npm 9 or later

### Installation

```bash
# 1. Create a new Vite React project
npm create vite@latest todoflow -- --template react
cd todoflow

# 2. Install dependencies
npm install

# 3. Replace src/App.jsx with the provided App.jsx file

# 4. Clear the default Vite styles
#    Open src/index.css and delete all content inside, leaving the file empty

# 5. Open index.html and add the Tailwind CDN script inside the <head> tag:
#    <script src="https://cdn.tailwindcss.com"></script>

# 6. Start the development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Expected index.html head section

```html
<head>
  <meta charset="UTF-8" />
  <link rel="icon" type="image/svg+xml" href="/vite.svg" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>TodoFlow</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
```

### Deploying to Netlify

```bash
npm run build
```

Create a `public/_redirects` file containing this single line to support client-side routing:

```
/*  /index.html  200
```

Create a `netlify.toml` file in the project root:

```toml
[build]
  command = "npm run build"
  publish = "dist"
```

Then either drag the `dist/` folder into the Netlify dashboard or connect the GitHub repository for automatic deploys on every push to main.

### Deploying to Vercel

```bash
npm run build
npx vercel --prod
```

Create a `vercel.json` file in the project root:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/" }]
}
```

---

## Available Scripts

| Script            | Description                                                                     |
| ----------------- | ------------------------------------------------------------------------------- |
| `npm run dev`     | Start the Vite development server at localhost:5173 with hot module replacement |
| `npm run build`   | Bundle the application into the `dist/` folder for production                   |
| `npm run preview` | Serve the production build locally to verify output before deploying            |
| `npm run lint`    | Run ESLint across all source files                                              |

---

## Technology Choices and Reasoning

### React 19 with Functional Components and Hooks

React 19 is used throughout. All components are functional and use hooks including `useState`, `useEffect`, `useCallback`, `useReducer`, `useMemo`, `useRef`, and `startTransition`. The only class component is `ErrorBoundary`, which must remain a class because React has not yet released a hook-based API for catching render errors.

`React.Suspense` wraps the entire route tree so any future async components or lazy-loaded routes have a loading fallback without additional configuration.

### Custom Router

A lightweight client-side router is implemented from scratch using `window.history.pushState` and the `popstate` event. This keeps the routing logic fully visible and avoids a large dependency for a demonstration context. In a production codebase, TanStack Router would be the right choice for its type-safe route definitions, search parameter management, and built-in data loader patterns.

### Custom Data Fetching Hook

A minimal `useQuery` hook manages loading, error, and cached data states. It reads from and writes to a two-layer cache for offline support. In production, TanStack Query would replace this entirely, providing automatic background refetching, deduplication of concurrent requests, optimistic updates, and a browser devtools panel for inspecting the cache.

### Tailwind CSS via CDN

Tailwind is loaded via the Play CDN script tag. The CDN version scans the DOM at runtime and injects utility classes without any build step. In a production project, Tailwind would be installed as a PostCSS plugin with a content configuration array to enable tree-shaking, which reduces the CSS payload from several hundred kilobytes to a few kilobytes.

### Single File Architecture

The entire application lives in one `App.jsx` file. This was a deliberate choice to make the project easy to review and understand without navigating multiple directories. The internal structure mirrors what a well-organized multi-file project would look like, with constants, contexts, utilities, hooks, shared components, page components, and the root export clearly separated by comment banners.

### JWT Decoded Client-Side for Ownership Filtering

The API at `api.oluwasetemi.dev` is a shared public endpoint and does not filter tasks by the authenticated user on the server. Every authenticated request returns tasks from all registered users. To solve this, the `userId` is decoded from the JWT payload client-side using `atob` and `JSON.parse`, then used to filter the task list by matching against the `owner` field in each task. Edit, delete, and toggle controls are hidden on any task where `owner` does not match the current `userId`.

### DM Sans and DM Mono

DM Sans was chosen for its geometric clarity and strong legibility at small sizes. DM Mono pairs naturally with it for technical values such as task IDs and code. Both are loaded from Google Fonts with a `preconnect` hint to reduce font load latency.

---

## Project Structure

```
todoflow/
  src/
    App.jsx         Full application: all components, hooks, contexts, and pages
    main.jsx        React DOM entry point
    index.css       Empty file — Tailwind is loaded via CDN in index.html
  public/
    _redirects      Netlify SPA routing rule (/* to /index.html with 200)
  index.html        HTML shell with Tailwind CDN script tag in the head
  netlify.toml      Netlify build configuration
  vercel.json       Vercel rewrite rules for SPA routing
  package.json      Project metadata and scripts
  vite.config.js    Vite configuration (default from template)
```

### Sections inside App.jsx

```
Constants              BASE_URL, WS_URL, PAGE_SIZE
normalizeTask          Maps API shape (name, status) to UI shape (title, completed)
AuthProvider           JWT auth context: login, logout, token, user, isAuthed
NotifProvider          Toast queue and notification center context
cache                  In-memory and localStorage cache utility with TTL
apiFetch               Fetch wrapper with Bearer token injection and error serialization
useQuery               Data fetching hook with loading, error, and cache states
ErrorBoundary          Class component catching render errors with fallback UI
Router                 History API router providing path and navigate
Link                   Anchor that calls navigate instead of causing a full reload
Routes                 Matches path to route config and renders the component
matchRoute             Supports static segments and :param segments
ThemeProvider          Dark/light mode with system preference detection and persistence
Spinner                Accessible loading indicator with size variants
Badge                  Colored status label with variant system
Button                 Button with primary, secondary, ghost, danger, and success variants
Input                  Labeled input with error message and full ARIA wiring
Modal                  Focus-trapping accessible dialog with Escape key support
ConfirmDialog          Delete confirmation built on Modal
TodoForm               Create and edit form with client-side validation
TodoCard               Task list item with ownership-aware controls
Pagination             Page controls with ellipsis collapsing for large page counts
useWebSocket           WebSocket hook with automatic reconnection and backoff
Navbar                 Top bar with theme toggle, notification bell, and user menu
NotifPanel             Dropdown showing all notification history
Layout                 Page shell combining Navbar and main content area
HomePage               Task list with search, filter, pagination, and CRUD modals
TodoDetailPage         Full detail view for a single task with edit support
AuthForm               Shared login and register form with validation
ProfilePage            Account information from the /auth/me endpoint
ErrorPage              Error boundary fallback with retry and home navigation
NotFoundPage           Custom 404 page
ThrowPage              Route at /test-error that throws to demonstrate ErrorBoundary
Protected              Higher-order component redirecting unauthenticated users
ROUTES                 Array of route objects mapping paths to components
SEO                    Manages document.title and meta description per route
App                    Root export wrapping everything in providers
```

---

## Known Issues and Future Improvements

### Known Issues

**Pagination counts are inaccurate for the current user.** The API returns all tasks from all users and the `meta.total` count reflects the full dataset. Client-side ownership filtering reduces the visible list correctly, but the pagination controls may show more pages than the user actually has tasks.

**API status values are partially exposed.** The API supports four status values: `TODO`, `IN_PROGRESS`, `DONE`, and `CANCELLED`. The application maps task completion to `DONE` and incompletion to `TODO` only. The `IN_PROGRESS` and `CANCELLED` states cannot be set through the UI.

**WebSocket connection is intermittent.** The `wss://api.oluwasetemi.dev/ws/tasks` endpoint occasionally refuses connections depending on server state. Errors are caught silently so the UI continues to work, but real-time notifications may not always fire.

**Token expiry is not handled automatically.** When the JWT expires, API calls fail with 401 errors shown as toast messages. The user must manually sign out and sign back in. There is no automatic token refresh or redirect to login on expiry.

**Light mode is implemented with CSS overrides.** Because Tailwind is loaded via CDN without a config file, the `dark:` variant prefix is not available. Light mode works by overriding Tailwind slate color classes with `!important` rules scoped to `html:not(.dark)`. This is functional but less maintainable than a proper Tailwind configuration.

**Tailwind CDN adds unoptimized CSS payload.** The Play CDN injects all utility classes and adds approximately 350 kilobytes to the page. This is acceptable for development and demonstration but would not meet production performance budgets.

### Future Improvements

**Migrate to TanStack Router.** Type-safe route definitions, URL search parameter management, route loaders that resolve data before rendering, and route actions for mutations would all simplify the codebase significantly.

**Migrate to TanStack Query.** Replacing the custom `useQuery` hook would provide automatic background refetching, request deduplication, optimistic updates, infinite scroll support, and a devtools panel for inspecting cache state.

**Install Tailwind as a PostCSS plugin.** This enables tree-shaking, the `dark:` variant prefix for proper dark mode, arbitrary value support, and significantly smaller production CSS.

**Expose all API status values.** Add a status dropdown to the task form allowing `IN_PROGRESS` and `CANCELLED` in addition to `TODO` and `DONE`. Show distinct badge colors and icons for each state.

**Add task priority selection.** The API already stores `LOW`, `MEDIUM`, and `HIGH` priority values. Expose a priority picker in the form and display a priority indicator on each task card.

**Add due dates.** Include a date input in the task form and highlight overdue tasks with a distinct color and label.

**Implement a service worker.** Use Workbox to cache API responses and queue mutations made while offline, replaying them automatically when the connection is restored.

**Add keyboard shortcuts.** Press `n` to open the create task modal, `/` to focus the search input, and `?` to open a shortcut reference panel.

**Add bulk task operations.** Checkboxes on each card with a contextual toolbar for bulk complete, bulk delete, and bulk status change when one or more tasks are selected.

**Implement automatic token refresh.** Call `/auth/refresh` before the JWT expires and redirect to login only if the refresh itself fails, eliminating the current manual sign-out requirement.

**Write automated tests.** Unit tests with Vitest and React Testing Library covering form validation, auth context behavior, the custom router, and the cache utility. End-to-end tests with Playwright for the full register, login, create, edit, delete, and theme toggle flows.

**Split into multiple files.** Organize the codebase into feature folders once the single-file approach becomes a maintenance burden: `contexts/`, `hooks/`, `components/`, `pages/`, and `utils/`.

**Add task search on the detail page.** Allow deep linking to a task and showing related tasks from the same user in a sidebar.

**Support task hierarchies.** The API has a `parentId` field and a children endpoint at `/tasks/:id/children`. A nested task UI with collapsible subtask lists would expose this capability.
