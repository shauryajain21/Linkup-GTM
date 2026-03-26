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
      info: jest.fn(),
      invite: jest.fn(),
      inviteShared: jest.fn(),
      members: jest.fn(),
    },
  });

  const philConfig: InternalUserConfig = {
    userId: 'U_PHIL_123',
    token: 'xoxp-phil-token',
    message: 'Hi {{user}} nice to meet you!',
    threadMessage1: 'You have my direct line here',
    threadMessage2: 'Feel free to ping @Sacha and @Shaurya if you need help with anything',
  };

  const sashaConfig: InternalUserConfig = {
    userId: 'U_SASHA_456',
    token: 'xoxp-sasha-token',
    message: 'Hello from Sacha!',
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
    'U_SHAURYA_101',
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createSupportChannel', () => {
    it('should create a welcome channel and send a welcome message (without inviting Phil, Sacha & Boris yet)', async () => {
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
      // Phil, Sacha & Boris should NOT be invited yet
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
    it('should invite Phil, Sacha & Boris and schedule messages when external user joins', async () => {
      jest.useFakeTimers();

      // Mock conversations.info to return a -linkup channel
      (slackProvider.conversations.info as jest.Mock).mockResolvedValueOnce({
        channel: { name: 'partner-org-linkup' },
      });
      // Mock conversations.members to return no internal users yet
      (slackProvider.conversations.members as jest.Mock).mockResolvedValueOnce({
        members: ['U_BOT', 'U_EXTERNAL_USER'],
      });

      // Mock the invite for Phil, Sacha & Boris
      (slackProvider.conversations.invite as jest.Mock).mockResolvedValueOnce({ ok: true });

      // Simulate external user joining
      await underTest.handleExternalUserJoined('channel-id', 'U_EXTERNAL_USER');

      // Phil, Sacha & Boris should now be invited
      expect(slackProvider.conversations.invite).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'channel-id',
          users: 'U_PHIL_123,U_SASHA_456,U_BORIS_789,U_SHAURYA_101',
        }),
      );

      jest.useRealTimers();
    });

    it('should not invite Phil, Sacha & Boris if any of them joins (not external user)', async () => {
      // Simulate Phil joining (should be ignored before any API call)
      await underTest.handleExternalUserJoined('channel-id', 'U_PHIL_123');

      // Should NOT trigger invite or any API calls
      expect(slackProvider.conversations.info).not.toHaveBeenCalled();
      expect(slackProvider.conversations.invite).not.toHaveBeenCalled();
    });

    it('should do nothing if channel is not a -linkup channel', async () => {
      // Mock conversations.info to return a non-linkup channel
      (slackProvider.conversations.info as jest.Mock).mockResolvedValueOnce({
        channel: { name: 'random-channel' },
      });

      await underTest.handleExternalUserJoined('unknown-channel', 'U_EXTERNAL_USER');

      // Should not invite anyone
      expect(slackProvider.conversations.invite).not.toHaveBeenCalled();
    });

    it('should not invite if internal users are already in the channel', async () => {
      // Mock conversations.info to return a -linkup channel
      (slackProvider.conversations.info as jest.Mock).mockResolvedValueOnce({
        channel: { name: 'partner-org-linkup' },
      });
      // Mock conversations.members to return Phil already in channel
      (slackProvider.conversations.members as jest.Mock).mockResolvedValueOnce({
        members: ['U_BOT', 'U_EXTERNAL_USER', 'U_PHIL_123'],
      });

      await underTest.handleExternalUserJoined('channel-id', 'U_EXTERNAL_USER');

      // Should NOT invite since Phil is already there
      expect(slackProvider.conversations.invite).not.toHaveBeenCalled();
    });
  });
});
