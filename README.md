# Slack Automation Service

Standalone service for Slack channel automation - creates support channels for new organizations and sends personalized welcome messages.

## Features

- **Automatic Channel Creation**: Creates a Slack channel when a new user onboards
- **External User Invites**: Invites the user via email to the shared channel
- **Welcome Messages**: Sends a branded welcome message
- **Internal Team Invites**: Automatically invites support team (Phil, Sasha, Boris) when external user joins
- **Scheduled Messages**: Sends personalized messages from team members at timed intervals (30s, 90s, 120s)

## API Endpoints

### POST /automations/new-user

Triggers Slack channel creation for a new user/organization.

**Request Body:**
```json
{
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "name": "User Name"
  },
  "organization": {
    "id": "org-uuid",
    "name": "Organization Name"
  }
}
```

**Response:**
```json
{ "ok": true }
```

### POST /slack/events

Webhook endpoint for Slack events. Handles:
- `url_verification` - Slack webhook setup verification
- `member_joined_channel` - Triggers internal user invites when external user joins

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.sample` to `.env` and fill in the values:

```bash
cp .env.sample .env
```

### 3. Slack App Setup

1. Create a Slack App at https://api.slack.com/apps
2. Enable **Event Subscriptions**:
   - Request URL: `https://your-domain/slack/events`
   - Subscribe to workspace events: `member_joined_channel`
3. Add **OAuth Scopes** (Bot Token):
   - `channels:manage` - Create channels
   - `channels:write.invites` - Invite users
   - `chat:write` - Send messages
   - `users:read.email` - Read user emails for invites
4. Install the app to your workspace
5. Copy tokens to `.env`

### 4. Run the Service

```bash
# Development
npm run start:dev

# Production
npm run start:prod
```

## Architecture

```
POST /automations/new-user (from linkup-api)
         ↓
AutomationsService.triggerNewUser()
         ↓
SlackService.createSupportChannel()
         ├── Check email domain (not banned)
         ├── Check org is new (via LinkupApiClient → linkup-api)
         ├── Create Slack channel: {org-name}-linkup
         ├── Invite external user via email
         └── Send welcome message

POST /slack/events (webhook from Slack)
         ↓
SlackEventsController.handleEvent()
         ↓
SlackService.handleExternalUserJoined()
         ├── Invite Phil, Sasha, Boris to channel
         └── Schedule personalized messages (30s, 90s, 120s)
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 3001) |
| `LINKUP_API_URL` | URL of linkup-api for org lookup |
| `SLACK_USERS_CONNECT_BOT_TOKEN` | Slack bot OAuth token |
| `SLACK_USERS_CONNECT_BANNED_DOMAINS` | Comma-separated banned email domains |
| `SLACK_PHIL_USER_ID` | Phil's Slack user ID |
| `SLACK_PHIL_TOKEN` | Phil's user OAuth token |
| `SLACK_PHIL_MESSAGE` | Phil's personalized message |
| `SLACK_SASHA_USER_ID` | Sasha's Slack user ID |
| `SLACK_SASHA_TOKEN` | Sasha's user OAuth token |
| `SLACK_SASHA_MESSAGE` | Sasha's personalized message (supports `{{user}}` placeholder) |
| `SLACK_BORIS_USER_ID` | Boris's Slack user ID |
| `SLACK_BORIS_TOKEN` | Boris's user OAuth token |
| `SLACK_BORIS_MESSAGE` | Boris's personalized message |

## Message Placeholders

- `{{user}}` - Replaced with Slack mention (`<@userId>`)
- `{{organization}}` - Replaced with organization name

## Future: Connecting to linkup-api

To fully integrate with linkup-api, the following changes are needed in linkup-api:

1. **Add org lookup endpoint**: `GET /organizations/by-name/:name`
2. **Modify UsersService.onboarding()**: Replace internal `automationsService.triggerNewUser()` with HTTP call to this service
3. **Add env var**: `SLACK_AUTOMATION_SERVICE_URL`

Until then, this service can be triggered manually or from any system via the HTTP endpoint.
