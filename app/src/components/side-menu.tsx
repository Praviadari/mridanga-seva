// The staff side menu (launch UI, docs/DECISIONS.md #350): the menu button at the left of the staff home
// header and of the tab screens' header bars opens a sheet from the left with every staff screen that is
// neither a bottom tab nor a circle on the home, in groups (components/staff-shortcuts.tsx staffMenuGroups).
// Plain React Native (Modal + Animated), no drawer package, so it reaches installed phones as an update.
//
// Closing: the close button, a tap beside the sheet, Android Back (Modal onRequestClose) and Escape on the web
// (react-native-web's Modal). Focus: the web Modal keeps keyboard focus inside and gives it back to the menu
// button on close; on a phone TalkBack is moved to the sheet's heading on open and back to the button on close.
// Rows are 48 px or taller and wrap at large text; the sheet scrolls.

import { usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type View as ViewType,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-provider';
import { spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Icon, IconBadge } from './icon';
import { Initials } from './list-row';
import { openMenuItem, openMyProfile, staffMenuGroups, type MenuItem } from './staff-shortcuts';

/** Widest the sheet gets; on a phone it leaves a strip of the screen beside it to tap. */
const SHEET_MAX = 340;

/** Props for MenuButton. */
export type MenuButtonProps = {
  /** 'band' = on the home's header band (round, outlined); 'bar' = in a header bar (plain, like Back). */
  place: 'band' | 'bar';
};

/** The button that opens the side menu, with the menu itself. */
export function MenuButton({ place }: MenuButtonProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const button = useRef<ViewType>(null);

  const close = () => {
    setOpen(false);
    // The web Modal gives focus back by itself; on a phone TalkBack is moved back to this button.
    if (Platform.OS !== 'web' && button.current) {
      const target = button.current;
      setTimeout(() => AccessibilityInfo.sendAccessibilityEvent(target, 'focus'), 300);
    }
  };

  return (
    <>
      <Pressable
        ref={button}
        accessibilityRole="button"
        accessibilityLabel={t('menu.open')}
        aria-expanded={open}
        hitSlop={8}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          place === 'band' ? styles.bandButton : styles.barButton,
          place === 'band' && { borderColor: colors.onHeaderMuted },
          pressed && styles.pressed,
        ]}>
        <Icon name="menu" size={26} color={colors.onHeader} />
      </Pressable>
      {open ? <SideMenu onClose={close} /> : null}
    </>
  );
}

/** The sheet with the groups; shown while it is in the tree. */
function SideMenu({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const { profile } = useAuth();
  // Spaced capitals as on the website, in English only: spacing pulls Telugu and Devanagari letters apart.
  const latin = (i18n.resolvedLanguage ?? i18n.language ?? '').startsWith('en');
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const sheetWidth = Math.min(SHEET_MAX, Math.round(width * 0.86));
  const groups = staffMenuGroups(profile?.role === 'guru', t);
  const heading = useRef<ViewType>(null);

  // Slides in from the left on a phone (none with reduced motion); on the web it simply appears, because
  // react-native-web waits for an animation's end, which a background tab never fires (select-field.tsx).
  const [offset] = useState(() => new Animated.Value(Platform.OS === 'web' ? 0 : -sheetWidth));
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      if (reduce) offset.setValue(0);
      else Animated.timing(offset, { toValue: 0, duration: 180, useNativeDriver: true }).start();
      // TalkBack starts on the sheet's heading, not somewhere behind it.
      setTimeout(() => {
        if (!cancelled && heading.current) AccessibilityInfo.sendAccessibilityEvent(heading.current, 'focus');
      }, 250);
    });
    return () => {
      cancelled = true;
    };
  }, [offset]);

  const myName = profile?.full_name.trim() || t('home.greetingNoName');
  const roleLine =
    profile?.role === 'guru' || profile?.role === 'coordinator' ? t('home.role', { role: t(`roles.${profile.role}`) }) : '';

  const open = (item: MenuItem) => {
    onClose();
    openMenuItem(item);
  };

  return (
    <Modal visible transparent animationType={Platform.OS === 'web' ? 'none' : 'fade'} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Animated.View
          role="dialog"
          aria-modal
          accessibilityViewIsModal
          accessibilityLabel={t('menu.title')}
          style={[
            styles.sheet,
            {
              width: sheetWidth,
              backgroundColor: colors.background,
              borderColor: colors.cardBorder,
              transform: [{ translateX: offset }],
            },
          ]}>
          <View style={[styles.top, { paddingTop: insets.top + spacing.md, backgroundColor: colors.headerTop }]}>
            {/* The person's own card, as in LinkedIn (Praveen 14-10-2026, #360): initials, name, role and "View my
                profile", one button that opens My profile; TalkBack starts here when the menu opens. */}
            <Pressable
              ref={heading}
              accessibilityRole="button"
              accessibilityLabel={[myName, roleLine, t('menu.viewProfile')].filter(Boolean).join(', ')}
              onPress={() => {
                onClose();
                openMyProfile();
              }}
              style={({ pressed }) => [styles.me, pressed && styles.pressed]}>
              <Initials name={myName} size={52} onBand />
              <View style={styles.topText}>
                <AppText variant="label" style={[styles.myName, { color: colors.onHeader }]} numberOfLines={2}>
                  {myName}
                </AppText>
                {/* The role left the home band (#352); it is said here. */}
                {roleLine ? (
                  <AppText variant="small" style={{ color: colors.headerGold }}>
                    {roleLine}
                  </AppText>
                ) : null}
                <AppText variant="small" style={{ color: colors.onHeaderMuted }}>
                  {t('menu.viewProfile')} ›
                </AppText>
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('menu.close')}
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [styles.close, { borderColor: colors.onHeaderMuted }, pressed && styles.pressed]}>
              <Icon name="close" size={24} color={colors.onHeader} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.lg }]}>
            {groups.map((group) => (
              <View key={group.key} style={styles.group}>
                <AppText accessibilityRole="header" aria-level={2} variant="small" style={[styles.eyebrow, latin && styles.eyebrowLatin, { color: colors.primary }]}>
                  {group.title}
                </AppText>
                {group.items.map((item) => {
                  const here = typeof item.href === 'string' && pathname === item.href;
                  return (
                    <Pressable
                      key={item.key}
                      accessibilityRole="button"
                      accessibilityLabel={item.label}
                      aria-current={here ? 'page' : undefined}
                      onPress={() => open(item)}
                      style={({ pressed }) => [
                        styles.row,
                        (pressed || here) && { backgroundColor: colors.primarySoft },
                      ]}>
                      <IconBadge name={item.icon} size={36} plain />
                      <AppText variant="label" style={styles.rowLabel}>
                        {item.label}
                      </AppText>
                      <Icon name="chevron" size={18} color={colors.textMuted} />
                    </Pressable>
                  );
                })}
              </View>
            ))}
            {/* The maha-mantra, which left the home header (Praveen 14-10-2026, #352): a quiet line at the foot. */}
            <View style={[styles.mantra, { borderColor: colors.ornament }]}>
              <AppText variant="small" tone="muted" style={styles.mantraText}>
                {t('home.mantraLine1')}
              </AppText>
              <AppText variant="small" tone="muted" style={styles.mantraText}>
                {t('home.mantraLine2')}
              </AppText>
            </View>
          </ScrollView>
        </Animated.View>
        {/* The strip of screen beside the sheet closes it too (screen readers use the close button). */}
        <Pressable
          accessible={false}
          importantForAccessibility="no"
          onPress={onClose}
          style={[styles.scrim, { backgroundColor: colors.overlay }]}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bandButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.xs,
  },
  pressed: {
    opacity: 0.7,
  },
  backdrop: {
    flex: 1,
    flexDirection: 'row',
  },
  sheet: {
    height: '100%',
    borderRightWidth: 1,
    boxShadow: '4px 0 24px rgba(18, 20, 58, 0.25)',
  },
  scrim: {
    flex: 1,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  me: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 56,
  },
  myName: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
  },
  topText: {
    flex: 1,
  },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingTop: spacing.sm,
  },
  group: {
    paddingTop: spacing.md,
  },
  eyebrow: {
    fontWeight: '700',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  eyebrowLatin: {
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  rowLabel: {
    flex: 1,
  },
  mantra: {
    marginTop: spacing.lg,
    marginHorizontal: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  mantraText: {
    fontStyle: 'italic',
    textAlign: 'center',
  },
});
