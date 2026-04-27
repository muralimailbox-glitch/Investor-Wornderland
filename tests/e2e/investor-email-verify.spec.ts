import { test } from './helpers/fixtures';

test.describe('Investor Email Verification', () => {
  test.fixme('investor can verify matching email with valid otp', async () => {
    // TODO
  });

  test.fixme('investor can update email during verification when email is unique', async () => {
    // TODO
  });

  test.fixme('wrong otp is rejected', async () => {
    // TODO
  });

  test.fixme('expired otp is rejected', async () => {
    // TODO
  });

  test.fixme('otp start endpoint enforces rate limit', async () => {
    // TODO
  });

  test.fixme('otp verify endpoint enforces rate limit', async () => {
    // TODO
  });

  test.fixme('verified state persists after page refresh', async () => {
    // TODO
  });

  test.fixme('verification writes interaction event', async () => {
    // TODO
  });

  test.fixme('email verification is case insensitive', async () => {
    // TODO
  });

  test.fixme('email collision with another investor is rejected', async () => {
    // TODO
  });
});
