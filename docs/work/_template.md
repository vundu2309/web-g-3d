---
title: <what the change is, in a few words>
state: proposed
opened: <YYYY-MM-DD>
owner: <the lead's session or a name>
agents: <sea-visual-builder, blender-structure, ...>
decision: <docs/decisions/NNNN-...md, or none>
---

# <title>

## Feedback and goal

The user's words, then the numbers that explain them.

## Brief

The spec, written before the first edit. Keep it to one page; a very small change may need one criterion.
A builder's brief is this section plus the paths. The goal is the user's words under "Feedback and goal".

### Acceptance criteria

Each one is something that must be true, with a check that can fail: a test (file and test name or assertion).
Run it before the build and see it fail, then after and see it pass; quote both under "Evidence". A criterion
no test can check (a look, the feel on a phone) says so in the Check column and names who judges it and how.
A **guard** (something that must stay true: a refactor, "nothing else breaks") is marked "guard": it passes
before and after, and names how it was seen to be able to fail (a deliberate break, quoted).

| #   | Must be true | Check (test file: name) | Before | After |
| --- | ------------ | ----------------------- | ------ | ----- |
| 1   |              |                         |        |       |

### What to build

Numbered, with targets in numbers.

### Not to touch, and limits that must hold

### Owners

Which agent or person owns which files (or the table under "Plan and owners").

### How the user will judge it

What they will be shown or asked to try.

## Plan and owners

| Step | Agent | Files owned | State |
| ---- | ----- | ----------- | ----- |

## Evidence

- Checks (format, tsc, lint, unit): the lead's own run, with the numbers.
- Browser tests: which ones, results, reruns.
- Images: folder and file names of before/after and sequences (the images themselves are not committed).
- Not verified: real phone, frame rate, anything else.

## Review

Findings of the reviewer agent and the lead, and what happened to each.

## Approval and publication

- User approval: what was shown, when, what was said.
- Commits: SHA and subject.
- Deploys checked: Vercel, Render, GitHub Actions.

## Follow-ups

Open issues and the next steps, in the user's order.
