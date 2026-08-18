# SyncRoom Firefox Media Bridge

This add-on keeps media playback on the user's own Firefox tab and only relays playback state to SyncRoom.

## What it does

- Detects the active `<video>` element on the source page.
- Detects whether an `.m3u8` resource was seen by that page.
- Never sends the M3U8 URL, cookies, headers, or media bytes to SyncRoom.
- Relays play, pause, seek, duration, and playback-rate state.
- Lets SyncRoom send playback commands back to the source tab.
- Uses a background relay so the source tab and SyncRoom tab do not need to share an origin.

## Install in Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**.
3. Select `extension/manifest.json` from this repository.
4. Open SyncRoom in one tab and the video/source site in another tab.
5. Click the extension button on the SyncRoom tab and choose **Use this tab as SyncRoom** if needed.
6. Click the extension button on the source tab and choose **Use this tab as media source**.
7. Put SyncRoom in Video mode. The bridge appears when the source tab has a playable `<video>` element.

## Important limitation

This bridge synchronizes the actual media player already running in Firefox. It does not turn a private HLS stream into a shareable public URL. Each viewer therefore needs their own accessible source/player session, or the host can use SyncRoom's screen-share feature for viewers who cannot open the source themselves.

This is intentional: the server should never receive private stream URLs or session credentials.
