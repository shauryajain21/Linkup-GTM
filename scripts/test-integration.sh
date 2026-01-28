#!/bin/bash

# Integration test script for Slack Automation Service
# Usage: ./scripts/test-integration.sh

BASE_URL="${BASE_URL:-http://localhost:3001}"

echo "Testing Slack Automation Service at $BASE_URL"
echo "=============================================="
echo ""

# Test 1: Health check (endpoint exists)
echo "1. Testing POST /automations/new-user endpoint..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/automations/new-user" \
  -H "Content-Type: application/json" \
  -d '{
    "user": { "id": "test-user-123", "email": "test@example.com", "name": "Test User" },
    "organization": { "id": "test-org-123", "name": "Test Organization" }
  }')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n1)

if [ "$HTTP_CODE" = "200" ]; then
  echo "   ✓ Endpoint responded with 200 OK"
  echo "   Response: $BODY"
else
  echo "   ✗ Expected 200, got $HTTP_CODE"
  echo "   Response: $BODY"
fi
echo ""

# Test 2: Slack webhook verification
echo "2. Testing POST /slack/events (URL verification challenge)..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/slack/events" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "url_verification",
    "challenge": "test-challenge-token-123"
  }')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n1)

if [ "$HTTP_CODE" = "200" ] && echo "$BODY" | grep -q "test-challenge-token-123"; then
  echo "   ✓ URL verification works correctly"
  echo "   Response: $BODY"
else
  echo "   ✗ URL verification failed"
  echo "   HTTP Code: $HTTP_CODE"
  echo "   Response: $BODY"
fi
echo ""

# Test 3: Slack member_joined_channel event
echo "3. Testing POST /slack/events (member_joined_channel event)..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/slack/events" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "event_callback",
    "event": {
      "type": "member_joined_channel",
      "user": "U12345",
      "channel": "C12345"
    }
  }')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n1)

if [ "$HTTP_CODE" = "200" ]; then
  echo "   ✓ Event callback accepted"
  echo "   Response: $BODY"
else
  echo "   ✗ Event callback failed"
  echo "   HTTP Code: $HTTP_CODE"
  echo "   Response: $BODY"
fi
echo ""

# Test 4: Banned domain should not create channel
echo "4. Testing banned domain filter..."
echo "   (Check server logs - should NOT attempt Slack API call for blocked-domain.com)"
curl -s -X POST "$BASE_URL/automations/new-user" \
  -H "Content-Type: application/json" \
  -d '{
    "user": { "id": "test-user-456", "email": "test@blocked-domain.com", "name": "Blocked User" },
    "organization": { "id": "test-org-456", "name": "Blocked Org" }
  }' > /dev/null

echo "   ✓ Request sent (check server logs for 'banned domain' handling)"
echo ""

echo "=============================================="
echo "Tests complete!"
echo ""
echo "For full Slack integration testing:"
echo "1. Set real SLACK_USERS_CONNECT_BOT_TOKEN in .env"
echo "2. Run the service: npm run start:dev"
echo "3. Call POST /automations/new-user with a real email"
echo "4. Check Slack for the created channel"
