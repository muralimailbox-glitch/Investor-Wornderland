import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const ROUTES = ['/', '/ask', '/nda', '/lounge', '/privacy', '/terms', '/cockpit/login'];

for (const path of ROUTES) {
  test(`axe clean: ${path}`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .disableRules(['color-contrast'])
      .analyze();
    const critical = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    if (critical.length > 0) {
      console.error(
        'axe violations on',
        path,
        JSON.stringify(
          critical.map((v) => ({
            id: v.id,
            impact: v.impact,
            help: v.help,
            nodes: v.nodes.length,
          })),
          null,
          2,
        ),
      );
    }
    expect(critical, `serious/critical axe violations on ${path}`).toEqual([]);
  });
}
