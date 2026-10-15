// The three steps of joining on the waiting screen (src/app/pending.tsx, docs/DECISIONS.md #380): ✓ account made,
// ● come to the class desk with an ID (the step now), ○ your QR card for the door. Like a delivery tracker: the
// person sees where they are and what comes next. Each step is one item for screen readers ("Step 2 of 3. …").

import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { cardLook, spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Icon } from './icon';

/** Props for JoinSteps. */
export type JoinStepsProps = {
  /** The email signed in with, shown under the first step. */
  email: string | undefined;
};

/** The three steps of joining: the account (done), the class desk (now), the QR card (then). */
export function JoinSteps({ email }: JoinStepsProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const steps = [
    { title: t('pending.stepAccount'), hint: email ? t('pending.signedInAs', { email }) : undefined },
    { title: t('pending.stepDesk'), hint: t('pending.stepDeskHint') },
    { title: t('pending.stepQr'), hint: t('pending.stepQrHint') },
  ];
  return (
    <View style={[styles.steps, cardLook(colors)]}>
      {steps.map((step, index) => {
        const done = index === 0;
        const now = index === 1;
        const last = index === steps.length - 1;
        const state = done ? t('pending.stateDone') : now ? t('pending.stateNow') : undefined;
        return (
          <View
            key={step.title}
            style={styles.step}
            accessible
            accessibilityLabel={[t('about.stepOf', { step: index + 1, total: steps.length }), step.title, state, step.hint]
              .filter(Boolean)
              .join('. ')}>
            <View style={styles.rail}>
              <View
                style={[
                  styles.dot,
                  done && { backgroundColor: colors.success, borderColor: colors.success },
                  now && { backgroundColor: colors.primary, borderColor: colors.primary },
                  !done && !now && { borderColor: colors.border },
                ]}>
                {done ? (
                  <Icon name="tick" size={18} color={colors.onPrimary} />
                ) : (
                  <AppText variant="label" style={{ color: now ? colors.onPrimary : colors.textMuted }}>
                    {index + 1}
                  </AppText>
                )}
              </View>
              {last ? null : <View style={[styles.line, { backgroundColor: done ? colors.success : colors.border }]} />}
            </View>
            <View style={[styles.stepText, last ? null : styles.stepGap]}>
              <AppText variant="label" tone={done || now ? 'default' : 'muted'}>
                {step.title}
              </AppText>
              {step.hint ? (
                <AppText variant="small" tone="muted">
                  {step.hint}
                </AppText>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  steps: {
    padding: spacing.md,
  },
  step: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  rail: {
    alignItems: 'center',
  },
  dot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  line: {
    width: 2,
    flex: 1,
    minHeight: 16,
    marginVertical: spacing.xs,
  },
  stepText: {
    flex: 1,
    gap: 2,
    paddingTop: 4,
  },
  stepGap: {
    paddingBottom: spacing.md,
  },
});
