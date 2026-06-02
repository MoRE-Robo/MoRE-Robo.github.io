# MORE Anonymous Website

This is a static anonymous project page for MORE, inspired by academic project
pages such as PointWorld. It is ready for GitHub Pages and does not depend on
external fonts, analytics, or third-party scripts.

## Local Preview

Open `index.html` in a browser, or run a tiny local server:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## What To Replace

- `index.html`: replace every `TODO` with your anonymous project content.
- `assets/`: add anonymized figures, videos, PDFs, and result media.
- `styles.css`: adjust colors or spacing if the project needs a different tone.
- `script.js`: replace the demo scene data with real examples and metrics.

## Anonymous GitHub Pages Setup

1. Create a new GitHub account that does not use your name, lab, personal email,
   personal avatar, or personal recovery/public profile details.
2. Choose one GitHub Pages style:
   - User site: if the anonymous username is `ANON_USERNAME`, create a public
     repository named `ANON_USERNAME.github.io`. The URL will be
     `https://ANON_USERNAME.github.io/`.
   - Project site: create a public repository named `more`. The URL will be
     `https://ANON_USERNAME.github.io/more/` after Pages is enabled.
3. On your machine, connect this folder to the new repository:

```bash
git remote add origin https://github.com/ANONYMOUS_USERNAME/REPOSITORY_NAME.git
git add .
git commit -m "Create anonymous MORE project page"
git push -u origin main
```

4. In GitHub, open the repository settings, go to **Pages**, and publish from the
   `main` branch, root folder.
5. Wait for GitHub Pages to publish, then open the Pages URL and verify that no
   author identity appears in the page, source, assets, PDFs, or commit history.

## Anonymity Checklist

- Do not include names, affiliations, personal domains, ORCID, Scholar, Twitter,
  LinkedIn, or personal GitHub links during anonymous review.
- Use an anonymous email if GitHub asks for one, and keep it private.
- Avoid external analytics, external fonts, embedded private videos, and private
  cloud storage URLs.
- Strip metadata from PDFs, images, videos, and slide exports.
- Do not reuse filenames or screenshots that contain local paths, usernames, lab
  names, or institution-specific systems.
- If you need code release during anonymous review, use a separate anonymous
  repository with clean commit history.
