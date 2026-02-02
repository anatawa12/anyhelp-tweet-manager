# AnyHelp tweet manager bot

## Features 

### Retweet Detection and remove VXT reply

When a tweet is posted by the corresponding webhook and VXT replied, the bot should detect if the message is retweets or not.
If the tweet is retweet, the bot should react with 1467831704046670080 emoji for original tweet message,
and react with :x: emoji for VXT reply message to let VXT to delete the reply message.

We detect the tweet is retweet or not by comparing tweet id on URL on author part of OGP embed and the tweet id on URL in embed root URL.
If those two tweet ids are different, the tweet is retweet. If they are same, the tweet is not retweet.
If the tweet id is not found, we cannot determine retweet or not, so we do report error with link to VXT message for manual check.

### Thread Creation

When some user reacts VXT messages on the listed channel with `:eyes:` emoji, the bot should:
1. create new thread. The thread name should be the name of user get from embed author part.
2. Send initial message with VXT tweet link.
3. Send @reaction_user on thread to invite the user to the thread.

## Configuration file

settings.json at root. (comments are not allowed in pure JSON files, but shown here for clarity)

```json5
{
  // The user id of the bot that applies 'fxtwitter'
  "vxtBot": "1015497909925580830",
  "guild": "966897185297944629",
  // The cannel id to send error messages. Can be null to disable error reporting.
  "errorChannel": "112233445566778899",
  "channels": {
    "1235990408207536151": {
      // The id of the user (webhook) that sends the tweets ifttt found
      "sender": "1235990484459982919"
    }
  }
}
```

## The examples the ifttt webhook sends

The common part is URL of the tweet surrounded by angle brackets.
Optionally, the tweet author and some text may be included.
Those tweets are sent by webhook users specified in the configuration file.

```
<https://twitter.com/AsbjornAsu41384/status/2018145437413183610>
```

```
<https://twitter.com/salmonIKR_VRC/status/2018135766711534001> by salmonIKR_VRC
```

## The reply VXT bot sends

The reply VXT bot sends includes copy of the message content, replacing twitter (or X) URL with fxtwitter URL,
and removes '>' if exists.

```
<https://fxtwitter.com/i/status/2018057141567861228/
```

The message content itself does not have any additional context.
However, the fxtwitter will provide discord preview of the tweet as OGP, which will be converted to embed by discord automatically.
The contents of OGP (transformed to embed) will be like below:

```json
{
  "type": "rich",
  "url": "https://fxtwitter.com/i/status/2018057141567861228/",
  "description": "[@ShellyShellz_03](https://x.com/ShellyShellz_03) [@jasrifootball](https://x.com/jasrifootball) [@ALCOM](https://x.com/ALCOM) if you think ty simpson was a bum imma just assume you didnt watch a single game lmao he was in the heisman convos untim he started getting hurt later in the year\\.\n\n**👁️ 1 **",
  "color": 6513919,
  "timestamp": "2026-02-01T20:21:30+00:00",
  "reference_id": "1467617188994220153",
  "author": {
    "name": "Conner (@SMDConner)",
    "url": "https://x.com/SMDConner/status/2018057141567861228",
    "icon_url": "https://pbs.twimg.com/profile_images/1581856291957481472/MtdNtnlz_200x200.jpg",
    "proxy_icon_url": "https://images-ext-1.discordapp.net/external/U-m6Dp-j-RB7pdvzshQEpWqWcoOzsK0-495hw_ivPXk/https/pbs.twimg.com/profile_images/1581856291957481472/MtdNtnlz_200x200.jpg"
  },
  "footer": {
    "text": "FxTwitter",
    "icon_url": "https://assets.fxembed.com/logos/fxtwitter64.png",
    "proxy_icon_url": "https://images-ext-1.discordapp.net/external/gFi3EIEMfICdEDMLFVTF3ob0J1xkZnKdnkq0-xEsgGc/https/assets.fxembed.com/logos/fxtwitter64.png"
  }
}
```

Please note that the time the reply message is received through websocket (gateway API), embed is not included yet because no OGP fetch is done at that time.
The embed is added later by discord automatically.
This update does not trigger "messageUpdate" event, so we should forcibly get with `chan.messages.fetch({ message: "1467738450311647326", force: true })` instead.
We should initially wait for 5 secs and try, and then 10 secs if fail with 5 sec. if no embed after 10 secs, we should ignore the message.

## implementation helps

You should split commits as needed
