import { test } from './helpers/fixtures';

test.describe('Batch Email', () => {
  test.fixme('founder can create batch email for multiple leads', async () => {
    // TODO
  });

  test.fixme('batch email personalizes firstName firmName and investorLink', async () => {
    // TODO
  });

  test.fixme('batch create writes batch.created audit event', async () => {
    // TODO
  });

  test.fixme('batch dispatch sends queued messages', async () => {
    // TODO
  });

  test.fixme('batch dispatch records email_sent interaction per lead', async () => {
    // TODO
  });

  test.fixme('batch dispatch advances stages based on outbound send', async () => {
    // TODO
  });

  test.fixme('batch create with missing lead returns error', async () => {
    // TODO
  });

  test.fixme('batch create over max size is rejected', async () => {
    // TODO
  });

  test.fixme('redispatch skips already sent rows safely', async () => {
    // TODO
  });

  test.fixme('partial dispatch failure marks failed rows and continues', async () => {
    // TODO
  });
});
