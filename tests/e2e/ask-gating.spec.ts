import { test } from './helpers/fixtures';

test.describe('Ask Gating', () => {
  test.fixme('anonymous user is redirected away from ask page', async () => {
    // TODO
  });

  test.fixme('invite validated investor can load ask page', async () => {
    // TODO
  });

  test.fixme('ask api rejects request without investor context', async () => {
    // TODO
  });

  test.fixme('verified pre nda investor can ask benign question', async () => {
    // TODO
  });

  test.fixme('pre nda sensitive question returns nda gate metadata', async () => {
    // TODO
  });

  test.fixme('nda signed investor can ask deeper diligence question', async () => {
    // TODO
  });

  test.fixme('concierge feedback rejects anonymous request', async () => {
    // TODO
  });

  test.fixme('concierge feedback accepts investor session request', async () => {
    // TODO
  });

  test.fixme('concierge feedback accepts nda backed session request when applicable', async () => {
    // TODO
  });

  test.fixme('ask api rate limits repeated investor requests', async () => {
    // TODO
  });
});
