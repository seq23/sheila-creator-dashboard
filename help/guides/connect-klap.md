---
title: "Connect Klap (optional)"
group: getting_started
screen: connect
last_checked: 2026-09-25
target: "role=textbox[name=\"Editor · Klap key\"]"
fix: reconnect-klap
---

Klap cuts your dumps into clips, or adds captions, instead of the built-in editor, using your Klap credits. Everything works
without it.

## Open Klap

![Step 1](/help/screenshots/connect-klap-1.png)
<!-- route: external -->

Go to [klap.app](https://klap.app) and log in. Open **REST API**.

## Create a key and copy it

![Step 2](/help/screenshots/connect-klap-2.png)
<!-- route: external -->

Create a key, name it **Sheila Studio**, and copy it.

## Paste it and tap Check key

![Step 3](/help/screenshots/connect-klap-3.png)
<!-- route: /settings/connections -->
<!-- target: role=textbox[name="Editor · Klap key"] -->

In the dashboard open **Settings**, then **Connections**, **Editing apps**. Paste the key in the
**Klap** card and tap **Check key**.

## Pick it under Who edits

![Step 4](/help/screenshots/connect-klap-4.png)
<!-- route: /settings -->
<!-- target: section[aria-label="Editing"] -->

Open **Settings**, then **Editing**, **Who edits**, and pick **Klap**.

## Did this work?

The card says **Connected**. If it says the key is not valid, copy the whole key again. If your
plan has no API access, Klap says so; the built-in editor keeps working.
