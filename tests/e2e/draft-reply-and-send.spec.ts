import { test } from './helpers/fixtures';

test.describe('Draft Reply And Send', () => {
  test.fixme('founder can generate ai reply draft from inbox message', async () => {
    // TODO
  });

  test.fixme('generated draft contains subject body and citations', async () => {
    // TODO
  });

  test.fixme('founder can edit draft and send reply', async () => {
    // TODO
  });

  test.fixme('send creates outbox row and marks sent on success', async () => {
    // TODO
  });

  test.fixme('lead bound send records email_sent interaction', async () => {
    // TODO
  });

  test.fixme('lead bound send updates lastContactAt', async () => {
    // TODO
  });

  test.fixme('lead bound send auto advances prospect to contacted', async () => {
    // TODO
  });

  test.fixme('send to known investor without lead is blocked', async () => {
    // TODO
  });

  test.fixme('send to terminal lead is blocked', async () => {
    // TODO
  });

  test.fixme('smtp send failure marks outbox row failed', async () => {
    // TODO
  });
});
