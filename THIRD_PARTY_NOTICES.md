# Third-Party Notices

## Raphael Publish

DraftDock is based on and contains modified portions of the open-source project **Raphael Publish**.

- Upstream repository: https://github.com/liuxiaopai-ai/raphael-publish
- Upstream project name: Raphael Publish
- Upstream license: MIT License
- Upstream copyright notice: Copyright (c) 2024 Raphael Editor Contributors

The upstream project provides the original foundation for Markdown rendering, rich-text-to-Markdown conversion, theme rendering, WeChat-compatible formatting, preview modes, clipboard export, and HTML/PDF export.

DraftDock retains the upstream MIT license and copyright notice in the repository `LICENSE` file. Modifications and new modules developed for DraftDock are also distributed under the MIT License unless a file explicitly states otherwise.

## Modification Summary

DraftDock currently changes or extends the upstream project in the following areas:

- Project name, package metadata, documentation, and application branding
- Product positioning as a local-first writing and publishing workspace
- Local article management and Electron desktop packaging
- Cloudflare R2 image hosting, image optimization, deduplication, and recovery
- Secure local credential management with Electron safeStorage
- WeChat Official Account configuration, media upload, and draft synchronization
- Local publish snapshots, progress reporting, and version history
- Planned AI-assisted title, digest, and publishing checks
