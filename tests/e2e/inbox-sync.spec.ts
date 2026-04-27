import { test } from './helpers/fixtures';

test.describe('Inbox Sync', () => {
  test.fixme('inbox sync imports matched investor reply into email_inbox', async () => {
    // TODO
  });

  test.fixme('inbox sync also records email_received interaction', async () => {
    // TODO
  });

  test.fixme('rerunning inbox sync does not duplicate same imap uid', async () => {
    // TODO
  });

  test.fixme('unknown sender is skipped and not attached to lead', async () => {
    // TODO
  });

  test.fixme('matched lead id is written onto email_inbox row', async () => {
    // TODO
  });

  test.fixme('processedAt is set after successful match', async () => {
    // TODO
  });

  test.fixme('inbound reply updates lead lastContactAt', async () => {
    // TODO
  });

  test.fixme('inbound reply auto advances stage when applicable', async () => {
    // TODO
  });

  test.fixme('inbound reply cancels pending cadences for that lead', async () => {
    // TODO
  });

  test.fixme('cockpit inbox screen renders imported inbound message', async () => {
    // TODO
  });
});
