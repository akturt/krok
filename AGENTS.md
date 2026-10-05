# Krok: instructions for an AI agent

Krok is a control layer that a project mounts as a git submodule at `docs/.control`.

Whatever the request (install, update, "update Underboss to Krok"), the whole procedure is in [`INSTALL.md`](INSTALL.md). Read it first and run its detection snippet before any other command. A project that still has the old name (Underboss or an older name such as naprolom-docs) gets the verdict `MOVE` and is handled by [`playbook/move-from-underboss.md`](playbook/move-from-underboss.md). Do not ask the user for decisions that these two files already make.
