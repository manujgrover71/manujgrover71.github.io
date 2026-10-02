# blogs

My site, built with [Hugo](https://gohugo.io) (extended, v0.149+). No Node dependencies.

```bash
hugo server        # or: npm run dev   → http://localhost:1313
hugo --minify --gc # or: npm run build → public/
```

Pushing to `master` deploys to GitHub Pages (`.github/workflows/deploy.yml`).

## Writing a post

```bash
hugo new blog/my-post/index.md
```

This creates `content/blog/my-post/index.md` with `draft: true`. Put images in the same folder and reference them as `![alt](diagram.png)`. Set `draft: false` to publish; the newest post gets the NEW badge automatically.

Front matter: `title`, `date`, `slug` (the URL, `/blog/<slug>/`), `summary` (RSS + meta description), `tags`, and an optional `image` (hero shown above the post).

### A post published elsewhere

```bash
hugo new --kind external blog/my-medium-post.md
```

Fill in `title`, `date`, `externalUrl` and `source` (e.g. `Medium`). It shows up under Writing with a "Medium ↗" tag and links out; no page is built for it.

### Markdown extras

- Code: ` ```go {title="server.go" lineNos=true hl_lines=[3,"5-7"]} `
- Tabs: `{{< tabs "id" >}}{{< tab "a.go" >}}...{{< /tab >}}{{< /tabs >}}`
- Diagrams: ` ```mermaid ` (follows light/dark) or ` ```goat ` (ASCII art)
- Light/dark image pair: `{{< themed-img light="/images/x-light.svg" dark="/images/x-dark.svg" alt="..." >}}`

## Home page

- Bio: `content/_index.md`. `{{< more >}}…{{< /more >}}` adds a `[?]` that reveals text inline (`confetti=true`, `photos="images/a.jpg,images/b.jpg"`).
- Name, role, avatar, email, call link, socials, work history: `data/profile.yaml`.
- Writing subtitle: `content/blog/_index.md`.

## Where things live

| Path | What |
|---|---|
| `layouts/` | Templates: `home.html`, `section.html` (Writing list), `page.html` (post) |
| `layouts/_markup/` | Markdown render hooks (code blocks, images, links, headings, tables, diagrams) |
| `layouts/_shortcodes/` | `more`, `tabs`/`tab`, `themed-img` |
| `assets/css/main.css` | All styles; colour tokens at the top |
| `assets/css/syntax.css` | Code colours (generated, see its header) |
| `assets/js/main.js` | Theme toggle, copy buttons, `[?]` toggles, tabs |
| `assets/icons/` | SVG icons ([Tabler](https://tabler.io/icons), MIT) |
