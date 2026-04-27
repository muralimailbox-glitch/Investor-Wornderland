import { test } from './helpers/fixtures';

test.describe('Public NDA Initiation', () => {
  test.fixme('public nda initiate creates placeholder investor and lead for unknown email', async () => {
    // TODO
  });

  test.fixme('public nda initiate reuses existing investor if email already exists', async () => {
    // TODO
  });

  test.fixme('repeat nda initiate for same investor reuses active lead on active deal', async () => {
    // TODO
  });

  test.fixme('early stage lead advances to nda_pending during self serve nda', async () => {
    // TODO
  });

  test.fixme('invalid email on nda initiate returns 4xx', async () => {
    // TODO
  });

  test.fixme('nda initiate fails closed when no active deal exists', async () => {
    // TODO
  });

  test.fixme('nda initiate fails closed when founder workspace context is missing', async () => {
    // TODO
  });

  test.fixme('nda initiate normalizes uppercase email to lowercase', async () => {
    // TODO
  });

  test.fixme('nda otp requests are throttled after repeated attempts', async () => {
    // TODO
  });

  test.fixme('nda initiate records outbound otp email in outbox', async () => {
    // TODO
  });
});
