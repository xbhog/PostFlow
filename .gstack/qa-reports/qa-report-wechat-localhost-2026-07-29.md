# DraftDock WeChat Draft Sync QA Report

- Date: 2026-07-29
- Branch: `agent/wechat-draft-sync`
- Target: `http://127.0.0.1:4173`
- Mode: fix and regression QA
- Framework: React SPA in Vite, with Electron desktop bridge
- Health score: 100/100
- Merge gate: PASS

## Summary

The browser Mock account and draft flows now pass end to end. Both dialogs are
rendered through `document.body`, stay inside the viewport, support Escape and
backdrop closing, and expose dialog semantics. The ambiguous failure locator
was replaced by a dedicated test id.

The review also found and fixed security and reliability defects below:

- untrusted renderer navigation could retain access to privileged Electron IPC;
- regex HTML cleanup could be bypassed with encoded JavaScript URLs and SVG;
- remote image validation was vulnerable to DNS rebinding and buffered a body
  before enforcing the 10 MB limit;
- testing edited credentials could overwrite the cached Token for a saved
  account;
- concurrent or retried requests could create duplicate remote drafts;
- a remote success followed by a local write error could be reported as failed;
- interrupted and unknown draft creation had no explicit recovery workflow;
- account file mutations could lose concurrent updates;
- publishing inferred save state by parsing rendered Chinese status text.

All issues have regression coverage.

## Fixed issues

| ID | Severity | Result | Evidence |
| --- | --- | --- | --- |
| ISSUE-001 Dialogs clipped inside editor footer | Critical | Fixed | `screenshots/wechat-account-modal-fixed.png`, `screenshots/wechat-publish-modal-fixed.png` |
| ISSUE-002 Ambiguous failure-path locator | Medium | Fixed | `pnpm test:e2e`, 14/14 passed |
| ISSUE-003 Untrusted renderer retained privileged IPC | Critical | Fixed | sender-frame validation plus external-navigation interception |
| ISSUE-004 HTML sanitizer bypasses | Critical | Fixed | parser-based allowlist and malicious-input unit tests |
| ISSUE-005 Remote image DNS rebinding and unbounded buffering | Critical | Fixed | pinned dispatcher, redirect revalidation, streaming byte limit |
| ISSUE-006 Token cache pollution and refresh race | High | Fixed | cache-free connection test, cache-only invalidation, request timeouts |
| ISSUE-007 Duplicate/uncertain remote drafts | Critical | Fixed | single-flight, unresolved-record gate, remote commit point, manual resolution |

## Rendered browser verification

- Viewport: 1440x920.
- Account dialog bounds: x=117, y=22.64, width=1024, height=520.72.
- Publish dialog bounds: x=117, y=16.98, width=1024, height=532.03.
- Both dialogs are fully within the viewport and scroll their own content.
- Escape closes each dialog.
- Account save shows an explicit success message.
- Browser `localStorage` stores `hasAppSecret: true` but not the entered secret.
- Mock success, failure, unknown, manual-confirmation and outdated-version flows pass.
- No browser page errors or application console errors were observed.

Before/after evidence:

- `screenshots/wechat-account-modal-clipped.png`
- `screenshots/wechat-account-modal-fixed.png`
- `screenshots/wechat-publish-modal-clipped.png`
- `screenshots/wechat-publish-modal-fixed.png`

## Automated gate results

| Gate | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS |
| `pnpm lint` | PASS, zero warnings |
| `pnpm build` | PASS, existing bundle-size warning only |
| `pnpm test` | PASS, 63/63 |
| `pnpm test:e2e` | PASS, 14/14 |
| `pnpm dev:desktop` | PASS, Electron launches |
| `pnpm build:desktop` | PASS, NSIS and Portable generated |

## Not executed

Real WeChat credential, material, image upload, and draft creation tests were
not run because no authorized test account credentials were provided. Mock and
deterministic security tests do not make requests to WeChat.
