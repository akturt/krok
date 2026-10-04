---
schema: 1
id: underboss-deploy-prompt
type: guide
kind: onboarding
status: active
date: 2026-10-04
owners: [underboss-team]

entity_refs: [agentic-layer]
tags: [bootstrap, deploy, prompt, agent, onboarding, underboss]
priority: P0
---

# Prompt for an AI agent: install or update Underboss

The procedure itself lives in one place, the canonical runbook [`INSTALL.md`](../INSTALL.md). This file is only the text to hand to an agent. It carries no steps of its own, so it cannot drift from the runbook.

Hand the agent this prompt:

<!-- migration-source:start -->
```
You are in a consumer repository. Update Underboss to the current v3.

Follow INSTALL.md (the canonical runbook):
- if docs/.control/INSTALL.md exists, read it there;
- if docs/.runtime/underboss/INSTALL.md exists, read it there;
- otherwise read https://raw.githubusercontent.com/akturt/underboss/master/INSTALL.md

First determine the mode: run the detection in its section "For an AI coding
agent" and take INSTALL, UPDATE or MIGRATE from its output. Execute only that
flow, step by step. Do not edit files inside the submodule. Do not invent a
migration path. If the detection prints STOP, change nothing and report why.
Do not pass --implemented unless I gave you the Spec ids. Do not push.
When done, report the verification results and every manual action that remains.
```
<!-- migration-source:end -->

For a fresh install without an agent there is also the one-liner `bash <(curl -s https://raw.githubusercontent.com/akturt/underboss/master/bootstrap/install.sh)`; it performs steps 1–2 of flow A of the runbook.
