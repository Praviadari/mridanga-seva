// What a list shows when it has nothing in it: an icon, one line saying so (and what happens
// next), and the one action that fills it, e.g. "New announcement". Replaces a lone grey sentence. Since the launch
// UI (#355) a line-drawn lotus sits above the icon, in the module's colour, like the website's lotus dividers.

import { StyleSheet, View } from 'react-native';

import { useModuleTone } from '@/theme/module-tone';
import { spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Button, type ButtonProps } from './button';
import { LotusLine } from './home-art';
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
  const { colors } = useTheme();
  const tone = useModuleTone();
  return (
    <View style={styles.box}>
      <LotusLine size={72} color={tone ? colors.modules[tone].icon : colors.ornament} />
      <IconBadge name={icon} size={48} />
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
