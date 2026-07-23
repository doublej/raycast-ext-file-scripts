# File Scripts

A Raycast extension

## Requirements

- [Bun](https://bun.sh/) (or npm)
- [Raycast](https://raycast.com/) (the `ray` CLI ships with the app)

## Getting Started

```bash
bun install
bun run dev    # ray develop — registers + hot-reloads in Raycast
```

## Common Commands

| Command | Description |
|---------|-------------|
| `bun install` | Install dependencies |
| `bun run dev` | ray develop (hot reload in Raycast) |
| `bun run build` | ray build |
| `bun run lint` | ray lint |
| `bun run fix-lint` | ray lint --fix |

## Project Structure

```
src/
  hello.tsx      # Starter view command
  lib/prefs.ts   # Typed preferences + PATH builder
assets/
  command-icon.png
package.json     # Raycast manifest (commands, preferences)
```
