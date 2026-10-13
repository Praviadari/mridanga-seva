// A row of one-tap dates and times above typed date and time fields (audit phase 5 U4-05, docs/DECISIONS.md
// #343): "Tonight 19:00", "Tomorrow 07:00", "In 3 days", "This Sunday" ... A tap fills the fields, which stay
// editable. The choices come from lib/quick-times.ts.

import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { QuickLabel, QuickTime } from '@/lib/quick-times';
import { spacing } from '@/theme/use-theme';

import { Button } from './button';

/** Props for QuickTimes. */
export type QuickTimesProps = {
  choices: QuickTime[];
  /** Fills the form's fields: the date, and the time when the choice has one. */
  onPick: (choice: QuickTime) => void;
};

/** The quick buttons, wrapping onto more lines on a narrow phone. */
export function QuickTimes({ choices, onPick }: QuickTimesProps) {
  const { t } = useTranslation();
  const text = (label: QuickLabel) => {
    switch (label.kind) {
      case 'tonight':
        return t('quickTime.tonight', { time: label.time });
      case 'tomorrow':
        return t('quickTime.tomorrow', { time: label.time });
      case 'sunday':
        return t('quickTime.sunday', { time: label.time });
      case 'inDays':
        return t('quickTime.inDays', { count: label.count });
      case 'thisSunday':
        return t('quickTime.thisSunday');
      case 'nextSunday':
        return t('quickTime.nextSunday');
    }
  };
  return (
    <View style={styles.row}>
      {choices.map((choice) => (
        <Button key={choice.key} variant="secondary" icon="time" label={text(choice.label)} onPress={() => onPick(choice)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
