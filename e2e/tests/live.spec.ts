import type { Page } from '@playwright/test';

import {
  type ConsoleViolation,
  formatViolations,
  settle,
  watchConsole,
} from '../support/console-guard';
import { liveConnection } from '../support/live';
import { expect, placeCourse, SECOND_COURSE, test } from '../support/session';

const course = `/en/learn/${SECOND_COURSE.lang}`;

/**
 * Opens the course in a second tab of the same context (same session, so the
 * same user room) and waits until its socket is in that room: a write made
 * before then could send its event to nobody.
 */
async function openOtherTab(first: Page): Promise<{ other: Page; violations: ConsoleViolation[] }> {
  const other = await first.context().newPage();
  const violations = watchConsole(other);
  const live = liveConnection(other);
  await other.goto(course);
  await live;
  return { other, violations };
}

/**
 * A course write in one tab reaches the account's other open tabs over the
 * gateway, which re-render the page from the server. SECOND_COURSE, since
 * placeCourse re-pins its goal and level for every test.
 */
test.describe('live course updates', () => {
  test('a goal changed in one tab shows in the other', async ({ onboarded }) => {
    await placeCourse(onboarded, SECOND_COURSE);
    const { other, violations } = await openOtherTab(onboarded);
    try {
      await onboarded.goto(course);
      await onboarded.getByRole('combobox', { name: 'Daily goal' }).selectOption('60');

      await expect(other.getByRole('combobox', { name: 'Daily goal' })).toHaveValue('60');
      await settle(other);
      expect(violations, `the other tab logged:\n${formatViolations(violations)}\n`).toEqual([]);
    } finally {
      await other.close();
    }
  });

  test('a level changed in one tab shows in the other', async ({ onboarded }) => {
    await placeCourse(onboarded, SECOND_COURSE);
    const { other, violations } = await openOtherTab(onboarded);
    try {
      await expect(other.getByRole('status')).toContainText(SECOND_COURSE.level);

      await onboarded.goto(course);
      await onboarded.getByRole('button', { name: 'Change level' }).click();
      // The radio is sr-only, so its own label takes the click. B1 mastered: lessons at B2.
      await onboarded
        .getByRole('group', { name: 'Your level' })
        .getByText('B1', { exact: true })
        .click();
      await onboarded.getByRole('button', { name: 'Save' }).click();

      await expect(other.getByRole('status')).toContainText('B2');
      await settle(other);
      expect(violations, `the other tab logged:\n${formatViolations(violations)}\n`).toEqual([]);
    } finally {
      await other.close();
    }
  });
});
