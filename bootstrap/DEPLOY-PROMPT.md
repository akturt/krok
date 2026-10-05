---
schema: 1
id: krok-deploy-prompt
type: guide
kind: onboarding
status: active
date: 2026-10-04
owners: [krok-team]

entity_refs: [agentic-layer]
tags: [bootstrap, deploy, prompt, agent, onboarding, krok]
priority: P0
---

# Prompt for an AI agent: install or update Krok

The procedure itself lives in one place, the canonical runbook [`INSTALL.md`](../INSTALL.md). This file is only the text to hand to an agent. It carries no steps of its own, so it cannot drift from the runbook.

Hand the agent this prompt:

```
You are in a consumer repository. Update Krok to the current v3.

Follow INSTALL.md (the canonical runbook):
- if docs/.control/INSTALL.md exists, read it there;
- otherwise read https://raw.githubusercontent.com/akturt/krok/master/INSTALL.md

First determine the mode: run the detection in its section "For an AI coding
agent" and take INSTALL or UPDATE from its output. Execute only that
flow, step by step. Do not edit files inside the submodule. Do not invent a
path. If the detection prints STOP, change nothing and report why. Do not push.
When done, report the verification results and every manual action that remains.
```

For a fresh install without an agent there is also the one-liner `bash <(curl -s https://raw.githubusercontent.com/akturt/krok/master/bootstrap/install.sh)`; it performs steps 1–2 of flow A of the runbook.
