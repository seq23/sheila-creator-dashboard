---
title: "Connect ElevenLabs for the premium voice (optional)"
group: getting_started
screen: connect
last_checked: 2026-09-25
target: "role=textbox[name=\"Voice · ElevenLabs (premium) key\"]"
fix: reconnect-elevenlabs
---

Your narrations always work with the free built-in voice: good quality, a few minutes each.
Connect your own ElevenLabs account for the premium voice: best quality, seconds each, paid
from your ElevenLabs credits. The dashboard shows how many you have used on this card.

## Open ElevenLabs

![Step 1](/help/screenshots/connect-elevenlabs-1.png)
<!-- route: external -->

Go to [elevenlabs.io](https://elevenlabs.io) and log in. Starter and above include instant
voice cloning; on a plan without it the built-in voice is used.

## Find your API keys

![Step 2](/help/screenshots/connect-elevenlabs-2.png)
<!-- route: external -->

Tap your profile at the bottom left, then **API keys**.

## Create a key and copy it

![Step 3](/help/screenshots/connect-elevenlabs-3.png)
<!-- route: external -->

Tap **Create API key**, name it **Sheila Studio** and leave the access as it is. Tap
**Create**, then copy the key. ElevenLabs shows it only once.

## Paste it in the dashboard

![Step 4](/help/screenshots/connect-elevenlabs-4.png)
<!-- route: /settings/connections -->
<!-- target: role=textbox[name="Voice · ElevenLabs (premium) key"] -->

In the dashboard open **Settings**, then **Connections**. Scroll to **Voice · premium**, and
paste the key into the **ElevenLabs** box.

## Tap Check key

![Step 5](/help/screenshots/connect-elevenlabs-5.png)
<!-- route: /settings/connections -->
<!-- target: .card:has-text("ElevenLabs") >> role=button[name="Check key"] -->

Tap **Check key**. You see your plan, the characters you have used this month, and whether
voice cloning is on your plan. Your premium voice is made from the voice you saved on
**Voice**, in about a minute.

## Did this work?

If it says the key is not valid, copy it again from **API keys** and paste the whole key. If
it says your plan does not include voice cloning, everything still works with the built-in
voice; changing to Starter or above under **Subscription** turns the premium voice on.
