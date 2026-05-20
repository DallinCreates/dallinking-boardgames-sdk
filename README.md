# dallinking-boardgames-sdk

Board game SDK for writing jackbox party-style games for boardgames.dallinking.com

## Packages

This monorepo contains the following packages:

### @dallinking/boardgame-server
Server-side utilities, middleware, and helpers for building game backends.

- [packages/server](packages/server)

### @dallinking/boardgame-client
Client-side utilities and components for building game UIs.

- [packages/client](packages/client)

### @dallinking/boardgame-devkit
Development tools, utilities, and CLI for building and testing games.

- [packages/devkit](packages/devkit)

### create-dallinking-boardgame
Scaffolding tool to quickly create a new boardgame project.

- [packages/create-dallinking-boardgame](packages/create-dallinking-boardgame)

## Quick Start

### Prerequisites

- Node.js 16+
- npm 8+

### Installation

```bash
# Clone the repository
git clone https://github.com/DallinCreates/dallinking-boardgames-sdk.git
cd dallinking-boardgames-sdk

# Install dependencies for all packages
npm install
```

### Development

```bash
# Build all packages
npm run build

# Run tests for all packages
npm run test

# Work with a specific package
cd packages/server
npm run dev
```

### Creating a New Game

```bash
npx create-dallinking-boardgame my-awesome-game
cd my-awesome-game
npm install
npm run dev
```

## Workspace Commands

Since this is a monorepo using npm workspaces, run commands from the root:

```bash
# Install a package dependency
npm install lodash -w packages/client

# Run a package script
npm run build -w packages/server

# Lint a specific package
npm run lint -w packages/devkit
```

## Project Structure

```
dallinking-boardgames-sdk/
├── packages/
│   ├── server/              # Server utilities
│   ├── client/              # Client utilities
│   ├── devkit/              # Development tools
│   └── create-dallinking-boardgame/  # Scaffolding tool
├── package.json             # Root workspace config
└── README.md
```

## Contributing

All packages follow a consistent structure. When adding a new package:

1. Create a directory under `packages/`
2. Add a `package.json` with proper metadata
3. Create `src/` and `dist/` directories
4. Implement your utilities
5. Add a `README.md` with usage examples

Each package should:
- Follow semantic versioning
- Export ESM, CommonJS, and TypeScript types
- Include documentation and examples
- Have comprehensive tests

## License

MIT
