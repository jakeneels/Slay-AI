# Slay-AI

A PIXI.js deck-building game. Play at **[https://jakeneels.github.io/Slay-AI/](https://jakeneels.github.io/Slay-AI/)**

## Deploy to GitHub Pages

From the project root:

```bash
cd client
npx vite build --base /Slay-AI/
npx gh-pages -d dist
```

Or as a one-liner:

```bash
cd client && npx vite build --base /Slay-AI/ && npx gh-pages -d dist
```

**Note:** Use `vite build` directly (not `npm run build`) because the full build runs `tsc` which currently fails. The Vite-only build works and deploys fine.

## Add, Commit & Deploy

```bash
# Add and commit (exclude build artifacts)
git add -A
git restore --staged .cursor node_modules client/slay-ai.zip client/dist

# Commit
git commit -m "Your commit message"

# Build and deploy
cd client
npx vite build --base /Slay-AI/
npx gh-pages -d dist
```

## Dev

```bash
cd client
npm install
npm run dev
```
