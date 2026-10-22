// Learn more (docs/DECISIONS.md #474; research idea 9): free lessons and pages elsewhere that the Guru trusts, under
// Practice. Each opens in the browser; the site's name is shown under the title, so a child (or a parent) sees where a
// link goes. Nothing is copied into the app. The Guru adds, edits, orders, switches off and deletes the links here
// (data/practice-links.ts, migration 0055). Shown offline from the copy on the phone. Routes: student/learn-more.tsx,
// staff/learn-more.tsx.

import { Stack, useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Checkbox } from '@/components/checkbox';
import { EmptyState } from '@/components/empty-state';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import {
  deletePracticeLink,
  fetchPracticeLinks,
  LINK_NOTE_MAX,
  LINK_TITLE_MAX,
  LINK_URL_MAX,
  linkSite,
  linkUrlOk,
  savePracticeLink,
  type LinkList,
  type PracticeLink,
} from '@/data/practice-links';
import { announce } from '@/lib/announce';
import { confirmReady, confirmShown } from '@/lib/second-tap';
import { cardLook, spacing, useTheme } from '@/theme/use-theme';

/** The list, and the Guru's editor. */
export function LearnMore() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const isGuru = profile?.role === 'guru';
  const [list, setList] = useState<LinkList | undefined>(undefined);
  // The link being edited: 'new', one of the list, or null.
  const [editing, setEditing] = useState<PracticeLink | 'new' | null>(null);
  const [openFailed, setOpenFailed] = useState(false);

  const load = useCallback(async () => {
    setList(await fetchPracticeLinks());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const open = (link: PracticeLink) => {
    setOpenFailed(false);
    WebBrowser.openBrowserAsync(link.url).catch(() => setOpenFailed(true));
  };

  const links = list?.links ?? [];

  return (
    <Screen underHeader onRefresh={load}>
      <Stack.Screen options={{ title: t('learnMore.title') }} />
      <AppText tone="muted">{t('learnMore.intro')}</AppText>
      {list?.saved ? <Notice tone="info">{t('learnMore.saved')}</Notice> : null}
      {openFailed ? <Notice tone="error">{t('learnMore.openFailed')}</Notice> : null}

      {isGuru && editing === null ? (
        <Button variant="secondary" icon="add" label={t('learnMore.add')} onPress={() => setEditing('new')} />
      ) : null}
      {isGuru && editing !== null ? (
        <LinkEditor
          link={editing === 'new' ? null : editing}
          nextSort={(links[links.length - 1]?.sort ?? 0) + 10}
          onDone={() => {
            setEditing(null);
            void load();
          }}
        />
      ) : null}

      {list === undefined ? <LoadingCards /> : null}
      {list && links.length === 0 ? (
        <EmptyState icon="library" title={t('learnMore.none')} body={isGuru ? t('learnMore.noneGuru') : t('learnMore.noneStudent')} />
      ) : null}
      {links.map((link) => (
        <LinkCard key={link.id} link={link} onOpen={() => open(link)} onEdit={isGuru ? () => setEditing(link) : undefined} />
      ))}
    </Screen>
  );
}

/** One link: title, note, the site's name, Open; for the Guru also Edit, and "switched off" when it is. */
function LinkCard({ link, onOpen, onEdit }: { link: PracticeLink; onOpen: () => void; onEdit?: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={[styles.card, cardLook(colors)]}>
      <AppText variant="subtitle">{link.title}</AppText>
      {link.note ? <AppText>{link.note}</AppText> : null}
      <AppText variant="small" tone="muted">
        {t('learnMore.site', { site: linkSite(link.url) })}
        {link.active ? '' : ` · ${t('learnMore.off')}`}
      </AppText>
      <View style={styles.actions}>
        <Button icon="open" label={t('learnMore.open')} accessibilityLabel={t('learnMore.openLabel', { title: link.title })} onPress={onOpen} />
        {onEdit ? <Button variant="secondary" icon="edit" label={t('learnMore.edit')} onPress={onEdit} /> : null}
      </View>
    </View>
  );
}

/** The Guru's form for one link: title, link, note, place in the list, on or off; Save, Cancel, Delete. */
function LinkEditor({ link, nextSort, onDone }: { link: PracticeLink | null; nextSort: number; onDone: () => void }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(link?.title ?? '');
  const [url, setUrl] = useState(link?.url ?? 'https://');
  const [note, setNote] = useState(link?.note ?? '');
  const [sort, setSort] = useState(String(link?.sort ?? nextSort));
  const [active, setActive] = useState(link?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [tried, setTried] = useState(false);

  const titleError = tried && title.trim().length === 0 ? t('learnMore.errors.link_title_invalid') : undefined;
  const urlError = tried && !linkUrlOk(url) ? t('learnMore.errors.link_url_invalid') : undefined;

  const save = async () => {
    setTried(true);
    if (title.trim().length === 0 || !linkUrlOk(url)) return;
    setBusy(true);
    setError(null);
    const order = Number.parseInt(sort, 10);
    const result = await savePracticeLink(link?.id ?? null, {
      title,
      url,
      note: note.trim() || null,
      sort: Number.isFinite(order) ? order : nextSort,
      active,
    });
    setBusy(false);
    if ('errorKey' in result) {
      setError(t(result.errorKey));
      return;
    }
    onDone();
  };

  const remove = async () => {
    if (!link) return;
    setBusy(true);
    const errorKey = await deletePracticeLink(link.id);
    setBusy(false);
    if (errorKey) {
      setError(t(errorKey));
      return;
    }
    onDone();
  };

  return (
    <Section icon="link" title={link ? t('learnMore.editTitle') : t('learnMore.addTitle')} description={t('learnMore.editorHint')}>
      <TextField label={t('learnMore.fieldTitle')} value={title} onChangeText={setTitle} maxLength={LINK_TITLE_MAX} counter={LINK_TITLE_MAX} required error={titleError} />
      <TextField
        label={t('learnMore.fieldUrl')}
        hint={t('learnMore.fieldUrlHint')}
        kind="url"
        value={url}
        onChangeText={setUrl}
        maxLength={LINK_URL_MAX}
        required
        error={urlError}
      />
      <TextField label={t('learnMore.fieldNote')} value={note} onChangeText={setNote} maxLength={LINK_NOTE_MAX} counter={LINK_NOTE_MAX} multiline />
      <TextField label={t('learnMore.fieldSort')} hint={t('learnMore.fieldSortHint')} kind="number" value={sort} onChangeText={setSort} maxLength={6} />
      <Checkbox label={t('learnMore.fieldActive')} checked={active} onChange={setActive} />
      {error ? <Notice tone="error">{error}</Notice> : null}
      <View style={styles.actions}>
        <Button icon="check" label={t('learnMore.save')} loading={busy} onPress={() => void save()} />
        <Button variant="link" label={t('syllabusEditor.cancel')} onPress={onDone} />
      </View>
      {link ? (
        asking ? (
          <View style={styles.actions}>
            {/* Where Delete was: a double tap must not delete unseen (P2-06, #332). */}
            <Button icon="delete" label={t('learnMore.deleteSure')} onPress={() => void (confirmReady() && remove())} />
            <Button variant="link" label={t('syllabusEditor.cancel')} onPress={() => setAsking(false)} />
          </View>
        ) : (
          <Button
            variant="link"
            icon="delete"
            label={t('learnMore.delete')}
            onPress={() => {
              setAsking(true);
              confirmShown();
              announce(t('learnMore.deleteSure'));
            }}
          />
        )
      ) : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
  },
});
