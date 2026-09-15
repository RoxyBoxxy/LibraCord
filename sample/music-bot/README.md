# LibraCord sample music bot

This example shows how to authenticate a bot, read voice-channel chat commands, import media through the server media pipeline, and post a queued attachment back to the channel.

## Run

1. Create an application and bot token in **User Settings → Developer apps**.
2. Register commands for the app (replace the app ID and token):

```sh
curl -X PUT "$LIBRACORD_URL/api/v1/developer/apps/APP_ID/commands/play" -H "Authorization: Bot $LIBRACORD_BOT_TOKEN" -H "content-type: application/json" -d '{"description":"Play a URL","options":[{"name":"url","type":"string","required":true}]}'
```

3. Create a bot invite from the Developer apps area/API and accept it for the target community.
4. Copy `.env.example` to `.env` and set the server URL, token, and a voice-channel ID.
5. From this directory run:

```sh
npm install
npm start
```

Commands: `!help`, `!play <URL>`, `!skip`, and `!stop`.

The bot token is only read from the environment. Do not commit `.env`. `!play` requires the server’s development media importer/yt-dlp configuration. This sample intentionally posts a queued media attachment; synchronized LiveKit playback controls should be implemented in the server playback queue before using it in production.
