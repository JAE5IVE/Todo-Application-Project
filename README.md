# TodoFlow v4.1

A professional, high-performance task management application re-engineered for the modern web. TodoFlow combines **React 19**, **TypeScript**, and the cutting-edge **Tailwind CSS v4** engine to deliver a seamless, accessible, and ultra-fast user experience.

---

##  The Upgrade: From Prototype to Production
Originally a JavaScript prototype, TodoFlow has been fully migrated to a robust **TypeScript** architecture. This update introduces full type safety, optimized build pipelines, and advanced accessibility (A11y) features, moving far beyond the original single-file CDN setup.

---

##  Features

###  Type-Safety & Security
- **Full TypeScript Integration**: End-to-end type safety for tasks, categories, and authentication states.
- **Hardened Env Config**: Secure handling of API keys and environment variables via Vite's loadEnv to prevent client-side leaks.
- **Data Integrity**: Safe `localStorage` parsing with `try/catch` guards and validation to prevent boot-time crashes.

###  Modern Design & Experience
- **Tailwind CSS v4**: Built with the latest zero-runtime CSS engine for hardware-accelerated performance.
- **Monochrome Dark-First UI**: A sleek aesthetic using **DM Sans** for legibility and **DM Mono** for technical data.
- **Dynamic SVG Favicon**: A crisp, custom-branded favicon embedded directly in the HTML for zero-latency loading.

### ♿ Accessibility (A11y) & Usability
- **CodeRabbit-Approved A11y**: Full ARIA wiring (`role="dialog"`, `aria-modal`, `aria-label`) on all interactive elements.
- **Keyboard Mastery**: Enhanced modal navigation with **Escape-to-close** support and targeted `autoFocus`.
- **Responsive & Real-time**: Mobile-first design with a live network status indicator (Online/Offline detection).

---

##  Technology Stack

| Tech | Role |
| :--- | :--- |
| **React 19** | Modern functional UI with Hooks & Transitions |
| **TypeScript** | Strict-mode type safety and documentation |
| **Tailwind CSS v4** | Next-generation utility-first styling engine |
| **Vite** | Lightning-fast build tool and dev server |
| **Lucide React** | Consistent, high-quality iconography |

---

##  Setup Instructions

### Prerequisites
- Node.js 18 or later
- npm 9 or later

### Installation

1. **Clone and Install**
   ```bash
   git clone https://github.com/JAE5IVE/Todo-Application-Project.git
   cd Todo-Application-Project
   npm install
   ```

2. **Configure Environment**
   Create a `.env` file in the root for any non-sensitive variables. Note that the project is hardened to only expose variables prefixed with `VITE_`.

3. **Launch Project**
   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000) (default port).

---

##  Project Structure

```text
todoflow/
├── src/
│   ├── lib/
│   │   └── utils.ts       # Performance-optimized cn() helper
│   ├── types.ts           # Centralized TypeScript definitions
│   ├── App.tsx            # Main application logic & UI
│   ├── main.tsx           # React entry point
│   ├── index.css          # Tailwind v4 directives & theme variables
│   └── vite-env.d.ts      # TypeScript client-side declarations
├── index.html             # HTML Shell with dynamic SVG favicon
├── vite.config.ts         # Hardened build configuration
└── package.json           # Dependencies and build scripts
```

---

##  Available Scripts

| Script | Description |
| :--- | :--- |
| `npm run dev` | Start Vive dev server at port 3000 |
| `npm run build` | Compiles an optimized, tree-shaken production build to `/dist` |
| `npm run lint` | Runs `tsc` to verify type safety across the project |
| `npm run preview` | Serves the production build locally for final verification |

---

##  Code Review & Quality
This project is continuously monitored by **CodeRabbit AI**. All PRs undergo an automated security and accessibility audit.
- **Latest Audit Status**: All Accessibility and Security findings addressed (v4.1.0).
- **Design Pattern**: Functional components with functional state updates (`prev => ...`) used everywhere to ensure state consistency.

---

##  Metadata
- **Owner**: JAE5IVE
- **Version**: 4.1.0-TS-STABLE

