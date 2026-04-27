import { test } from './helpers/fixtures';

test.describe('NDA Signing', () => {
  test.fixme('valid nda otp verify returns signing token', async () => {
    // TODO
  });

  test.fixme('investor can sign nda and receive nda session', async () => {
    // TODO
  });

  test.fixme('signed nda creates sealed pdf metadata record', async () => {
    // TODO
  });

  test.fixme('placeholder investor identity is enriched after nda sign', async () => {
    // TODO
  });

  test.fixme('placeholder firm is replaced or reused from signer entered firm', async () => {
    // TODO
  });

  test.fixme('lead auto advances to nda_signed on successful sign', async () => {
    // TODO
  });

  test.fixme('founder notification is emitted after nda sign', async () => {
    // TODO
  });

  test.fixme('expired signing token is rejected', async () => {
    // TODO
  });

  test.fixme('tampered signing token is rejected', async () => {
    // TODO
  });

  test.fixme('duplicate nda sign submit does not create corrupt duplicate state', async () => {
    // TODO
  });
});
