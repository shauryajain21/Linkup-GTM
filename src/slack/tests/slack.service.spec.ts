import { createMock } from '@golevelup/ts-jest';
import { WebClient } from '@slack/web-api';
import { LinkupApiClient } from '../../linkup-api/linkup-api.client';
import { SlackService, InternalUserConfig } from '../slack.service';
import { OrganizationPayload, UserPayload } from '../slack.types';

describe('SlackService', () => {
  const linkupApiClient = createMock<LinkupApiClient>();
  const slackProvider = createMock<WebClient>({
    chat: {
      postMessage: jest.fn(),
    },
    conversations: {
      create: jest.fn(),
      invite: jest.fn(),
      inviteShared: jest.fn(),
    },
  });

  const philConfig: InternalUserConfig = {
    userId: 'U_PHIL_123',
    token: 'xoxp-phil-token',
    message: 'Hello from Phil!',
  };

  const sashaConfig: InternalUserConfig = {
    userId: 'U_SASHA_456',
    token: 'xoxp-sasha-token',
    message: 'Hello from Sasha!',
  };

  const borisConfig: InternalUserConfig = {
    userId: 'U_BORIS_789',
    token: 'xoxp-boris-token',
    message: 'Hello from Boris!',
  };

  const underTest = new SlackService(
    ['unauthorized_domain.com'],
    linkupApiClient,
    slackProvider,
    philConfig,
    sashaConfig,
    borisConfig,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createSupportChannel', () => {
    it('should create a welcome channel and send a welcome message (without inviting Phil, Sasha & Boris yet)', async () => {
      linkupApiClient.findOrganizationsByName.mockResolvedValueOnce({ count: 0 });
      (slackProvider.conversations.create as jest.Mock).mockResolvedValueOnce({
        channel: {
          id: 'channel-id',
        },
        ok: true,
      });
      (slackProvider.conversations.inviteShared as jest.Mock).mockResolvedValueOnce({
        ok: true,
      });
      (slackProvider.chat.postMessage as jest.Mock).mockResolvedValue({
        ok: true,
      });

      await underTest.createSupportChannel({
        organization: { id: '1234', name: 'Partner Org' } as OrganizationPayload,
        user: { id: 'user-1', email: 'foo@bar.baz' } as UserPayload,
      });

      expect(slackProvider.conversations.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'partner-org-linkup',
        }),
      );
      expect(slackProvider.conversations.inviteShared).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'channel-id',
          emails: ['foo@bar.baz'],
        }),
      );
      expect(slackProvider.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'channel-id',
        }),
      );
      // Phil, Sasha & Boris should NOT be invited yet
      expect(slackProvider.conversations.invite).not.toHaveBeenCalled();
    });

    it('should not create a channel if the organization already exists (count > 1)', async () => {
      // Count > 1 means there are other orgs with this name
      linkupApiClient.findOrganizationsByName.mockResolvedValueOnce({ count: 2 });

      await underTest.createSupportChannel({
        organization: { id: '1234', name: 'Partner Org' } as OrganizationPayload,
        user: { id: 'user-1', email: 'foo@bar.baz' } as UserPayload,
      });

      expect(slackProvider.conversations.create).toHaveBeenCalledTimes(0);
    });

    it('should not create a channel if the user domain is blacklisted', async () => {
      linkupApiClient.findOrganizationsByName.mockResolvedValueOnce({ count: 0 });

      await underTest.createSupportChannel({
        organization: { id: '1234', name: 'Partner Org' } as OrganizationPayload,
        user: { id: 'user-1', email: 'foo@unauthorized_domain.com' } as UserPayload,
      });

      expect(slackProvider.conversations.create).toHaveBeenCalledTimes(0);
    });

    it('should not create a channel if the sanitized name is invalid', async () => {
      linkupApiClient.findOrganizationsByName.mockResolvedValueOnce({ count: 0 });

      await underTest.createSupportChannel({
        organization: { id: '1234', name: '_' } as OrganizationPayload,
        user: { id: 'user-1', email: 'foo@unauthorized_domain.com' } as UserPayload,
      });

      expect(slackProvider.conversations.create).toHaveBeenCalledTimes(0);
    });

    it('should handle errors gracefully', async () => {
      linkupApiClient.findOrganizationsByName.mockResolvedValueOnce({ count: 0 });

      (slackProvider.conversations.create as jest.Mock).mockResolvedValueOnce({
        ok: false,
      });

      await underTest.createSupportChannel({
        organization: { id: '1234', name: 'Partner Org' } as OrganizationPayload,
        user: { id: 'user-1', email: 'foo@unauthorized_domain.com' } as UserPayload,
      });

      expect(slackProvider.conversations.inviteShared).toHaveBeenCalledTimes(0);
    });
  });

  describe('handleExternalUserJoined', () => {
    it('should invite Phil, Sasha & Boris and schedule messages when external user joins', async () => {
      jest.useFakeTimers();

      // First create a channel to set up pending state
      linkupApiClient.findOrganizationsByName.mockResolvedValueOnce({ count: 0 });
      (slackProvider.conversations.create as jest.Mock).mockResolvedValueOnce({
        channel: { id: 'channel-id' },
        ok: true,
      });
      (slackProvider.conversations.inviteShared as jest.Mock).mockResolvedValueOnce({ ok: true });
      (slackProvider.chat.postMessage as jest.Mock).mockResolvedValue({ ok: true });

      await underTest.createSupportChannel({
        organization: { id: '1234', name: 'Partner Org' } as OrganizationPayload,
        user: { id: 'user-1', email: 'foo@bar.baz' } as UserPayload,
      });

      // Mock the invite for Phil, Sasha & Boris
      (slackProvider.conversations.invite as jest.Mock).mockResolvedValueOnce({ ok: true });

      // Simulate external user joining
      await underTest.handleExternalUserJoined('channel-id', 'U_EXTERNAL_USER');

      // Phil, Sasha & Boris should now be invited
      expect(slackProvider.conversations.invite).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'channel-id',
          users: 'U_PHIL_123,U_SASHA_456,U_BORIS_789',
        }),
      );

      jest.useRealTimers();
    });

    it('should not invite Phil, Sasha & Boris if any of them joins (not external user)', async () => {
      // First create a channel
      linkupApiClient.findOrganizationsByName.mockResolvedValueOnce({ count: 0 });
      (slackProvider.conversations.create as jest.Mock).mockResolvedValueOnce({
        channel: { id: 'channel-id' },
        ok: true,
      });
      (slackProvider.conversations.inviteShared as jest.Mock).mockResolvedValueOnce({ ok: true });
      (slackProvider.chat.postMessage as jest.Mock).mockResolvedValue({ ok: true });

      await underTest.createSupportChannel({
        organization: { id: '1234', name: 'Partner Org' } as OrganizationPayload,
        user: { id: 'user-1', email: 'foo@bar.baz' } as UserPayload,
      });

      // Simulate Phil joining (should be ignored)
      await underTest.handleExternalUserJoined('channel-id', 'U_PHIL_123');

      // Should NOT trigger invite
      expect(slackProvider.conversations.invite).not.toHaveBeenCalled();
    });

    it('should do nothing if channel is not tracked', async () => {
      // Try to handle join for a channel we never created
      await underTest.handleExternalUserJoined('unknown-channel', 'U_EXTERNAL_USER');

      // Should not crash or call anything
      expect(slackProvider.conversations.invite).not.toHaveBeenCalled();
    });
  });
});
