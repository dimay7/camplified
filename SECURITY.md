# Security

camplified mods run inside Claude Code, on the machine of everyone who installs them, and they see what Claude Code sees. A flaw in one can matter, so reports are welcome and taken seriously.

## Reporting a vulnerability

Please report it privately, not in a public issue or pull request:

1. Go to the repository's **Security** tab.
2. Choose **Report a vulnerability**.

Include which mod and version, what an attacker could do, and the steps to show it. You'll get a reply within a week.

## What the mods do

So you can judge them before installing:

- They observe Claude Code's events and draw panes. They do not block or change tool calls.
- The only network request any mod makes is the daily update check: two `GET` requests to `raw.githubusercontent.com/dimay7/camplified`, carrying nothing about you or your work. It can be turned off in each mod's settings.
- They read no files outside their own folder.

Only reviewed pull requests reach `main`, and an update reaches you only when you run `claude plugin update`.
