import { test } from './helpers/fixtures';

// All tests use test.fixme so the suite runs as "expected-fail / to-implement"
// markers. When Claude fills in a test body, switch the call back to `test`,
// add `expect` to the import, and destructure the fixtures you need (e.g.
// `async ({ founderApi, page, makeEmail }) => { ... }`).

test.describe('Investor Invite', () => {
  test.fixme('founder can create investor and issue invite link', async () => {
    // TODO
  });

  test.fixme('issued invite link redeems into investor cookie session', async () => {
    // TODO
  });

  test.fixme('founder can send invite email from investor detail screen', async () => {
    // TODO
  });

  test.fixme('manual copied invite link works same as emailed link', async () => {
    // TODO
  });

  test.fixme('latest issued invite remains usable for same investor', async () => {
    // TODO
  });

  test.fixme('revoked invite link is rejected', async () => {
    // TODO
  });

  test.fixme('reissued invite after revocation works', async () => {
    // TODO
  });

  test.fixme('csv imported investor can receive and redeem invite', async () => {
    // TODO
  });

  test.fixme('tracxn imported investor can receive and redeem invite', async () => {
    // TODO
  });

  test.fixme('two investors from same firm get distinct correct invite identities', async () => {
    // TODO
  });
});
