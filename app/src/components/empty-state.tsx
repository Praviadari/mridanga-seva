// What a list shows when it has nothing in it: an icon, one line saying so (and what happens
// next), and the one action that fills it, e.g. "New announcement". Replaces a lone grey sentence.

import { StyleSheet, View } from 'react-native';

import { spacing } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Button, type ButtonProps } from './button';
import { IconBadge, type IconName } from './icon';

/** Props for EmptyState. */
export type EmptyStateProps = {
  icon: IconName;
  /** The main line, already translated, e.g. "No announcements yet." */
  title: string;
  /** One more line, already translated. */
  body?: string;
  /** The button that fills the list, if the person may do that. */
  action?: Pick<ButtonProps, 'label' | 'onPress' | 'icon'>;
};

/** Centred icon, message and optional button for an empty list. */
export function EmptyState({ icon, title, body, action }: EmptyStateProps) {
  return (
    <View style={styles.box}>
      <IconBadge name={icon} size={56} />
      <AppText variant="label" style={styles.centre}>
        {title}
      </AppText>
      {body ? (
        <AppText tone="muted" style={styles.centre}>
          {body}
        </AppText>
      ) : null}
      {action ? <Button variant="secondary" {...action} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  centre: {
    textAlign: 'center',
  },
});
