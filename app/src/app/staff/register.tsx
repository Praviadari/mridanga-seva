// C2 Register a student, with C3 Guardian consent for students under 18.
// A coordinator (or the Guru) fills this in at the desk in about two minutes. When the date of
// birth shows the student is under 18, the parent-and-consent part appears and must be completed
// before anything is saved: a minor's details are never stored without consent
// (docs/DECISIONS.md #8, #16). Saving calls register_student (src/data/students.ts), which
// stores the student, guardian and consent together and gives the roll number. Saving the same
// form again after a lost answer returns the student saved the first time (docs/DECISIONS.md #126).
// Since 0036 (docs/DECISIONS.md #162-#165): the people who signed up and wait for the desk are listed at
// the top and fill the form in one tap (the coordinator checks the name against the ID and takes the
// photo); gender and the optional About-you details are asked here too; the mentor is chosen
// automatically (a coordinator of the same gender) unless the coordinator picks one.
// Since 0046 (docs/DECISIONS.md #263-#264): an adult's sign-up has Accept, which shows what the person gave and asks
// the coordinator to check the name against the government ID, then registers them from it (accept_sign_up)
// without the form; "Fill the form" stays for a change, and is the only way for anyone under 18.
// When the server ends the login while the form is half filled, what was typed is kept for the same login and
// filled in again next time (src/lib/form-drafts.ts, D6-20); the consent ticks must be given again.
// Since #291 (audit R2-01) the whole waiting list can be searched by name, email or phone and is shown ten at a
// time with Show more; it reloads on focus, on pull-down and with Refresh list. A sign-up without the privacy
// tick has no Accept (FF-01): Fill the form, where an adult's notice is shown and ticked (#292).
// After Accept or Save the card's first button checks the new student in (#341, audit U2-01).

import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { MessageKey } from '@/auth/auth-actions';
import { useAuth } from '@/auth/auth-provider';
import { EmergencyPart, HeardPart, OccupationPart, YouPart } from '@/components/about-fields';
import { AppText } from '@/components/app-text';
import { BirthDateField } from '@/components/birth-date-field';
import { Button } from '@/components/button';
import { CheckInNow } from '@/components/check-in-now';
import { Checkbox } from '@/components/checkbox';
import { ListRow } from '@/components/list-row';
import { ChoiceGroup } from '@/components/choice-group';
import { DraftNotice } from '@/components/draft-notice';
import { useFormFocus } from '@/components/form-focus';
import { Notice } from '@/components/notice';
import { PrivacyNoticeLink } from '@/components/privacy-notice-link';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { StatusText } from '@/components/status-text';
import { TextField } from '@/components/text-field';
import {
  aboutFormFrom,
  aboutPatch,
  checkAbout,
  emptyAboutForm,
  fetchReferrers,
  fetchWaitingSignUps,
  formatPhone,
  saveStudentDetails,
  type AboutErrors,
  type AboutForm,
  type AboutPart,
  type Referrer,
  type WaitingSignUp,
} from '@/data/about';
import { activeSets, fetchAllOptions, type OptionSets } from '@/data/options';
import {
  acceptSignUp,
  ageFromForm,
  checkGuardianConsent,
  checkStudentDetails,
  emptyRegistration,
  fetchRegistrationChoices,
  ID_TYPES,
  newRequestId,
  registerStudent,
  RELATIONS,
  repeatedOtherPerson,
  type Accepted,
  type LevelOption,
  type MentorOption,
  type Registered,
  type RegistrationErrors,
  type RegistrationForm,
} from '@/data/students';
import { levelName } from '@/i18n/labels';
import { partsOfTyped, typedOfParts } from '@/lib/birth-date';
import { classLocale } from '@/lib/class-locale';
import { formatDateTime, formatTypedDate } from '@/lib/dates';
import { asciiDigits } from '@/lib/digits';
import { discardDraft, peekDraft, useDraftKeeper } from '@/lib/form-drafts';
import { typedPhone } from '@/lib/phone';
import { PRIVACY_NOTICE_VERSION } from '@/lib/privacy-notice';
import { filterWaiting, WAITING_PAGE, waitingAction } from '@/lib/waiting-list';
import { spacing } from '@/theme/use-theme';

/** Longest name, area and email the form takes (FS2-09; the database's bounds are 120, 100, 254). */
const NAME_MAX_LENGTH = 100;
const AREA_MAX_LENGTH = 100;
const EMAIL_MAX_LENGTH = 254;
/** Longest phone as typed ('+91 98765 43210' with spaces; audit F2-16). */
const PHONE_MAX_LENGTH = 16;

type Choices = { levels: LevelOption[]; mentors: MentorOption[] };
/** The 0036 parts: option lists, staff who bring people. Null before 0036 or when not loaded. */
type Extras = { options: OptionSets; referrers: Referrer[] };
/** What is kept of this form when the server ends the login (src/lib/form-drafts.ts). */
type RegisterDraft = { form: RegistrationForm; about: AboutForm };
/** The key of this form's draft. */
const DRAFT_KEY = 'register';
/** The fields in page order (the About-you parts as two blocks): Save goes to the first one with a problem (#268). */
type Field = keyof RegistrationForm | 'aboutYou' | 'aboutMore';
const ORDER: readonly Field[] = ['fullName', 'dob', 'phone', 'email', 'pincode', 'aboutYou', 'guardianName', 'guardianPhone',
  'guardianEmail', 'relation', 'idType', 'writtenConsent', 'aboutMore'];

/** Registration form, then a confirmation with the new roll number. */
export default function RegisterStudentScreen() {
  const { t } = useTranslation();
  // No mentor picked = a coordinator of the student's gender is given by the database (#165), once
  // the gender is known; a coordinator may still pick themselves or anyone else.
  const defaultMentor: string | null = null;

  // undefined = still loading, null = could not load.
  const [choices, setChoices] = useState<Choices | null | undefined>(undefined);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const owner = useAuth().session?.user.id;
  // A draft kept for this login after a forced sign-out (D6-20): read once, then deleted from the device.
  const [restored] = useState(() => peekDraft<RegisterDraft>(DRAFT_KEY, owner));
  const [showRestored, setShowRestored] = useState(restored !== null);
  useEffect(() => {
    if (restored) discardDraft(DRAFT_KEY);
  }, [restored]);
  // The consent ticks are never brought back: the coordinator confirms them again.
  const [form, setForm] = useState<RegistrationForm>(() =>
    restored ? { ...restored.form, photoConsent: false, writtenConsent: false } : emptyRegistration(defaultMentor),
  );
  const [errors, setErrors] = useState<RegistrationErrors>({});
  const [formError, setFormError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  // True when the database answered that this student is a minor although this phone's date says not (D6-13).
  const [serverMinor, setServerMinor] = useState(false);
  const [saved, setSaved] = useState<{ registered: Registered; name: string; detailsFailed: boolean } | null>(null);
  const [extras, setExtras] = useState<Extras | null>(null);
  const [about, setAbout] = useState<AboutForm>(() => restored?.about ?? emptyAboutForm(classLocale().country));
  const [aboutErrors, setAboutErrors] = useState<AboutErrors>({});
  // The sign-up the form was filled from: its centre goes on the record; it leaves the waiting list.
  const [fromSignUp, setFromSignUp] = useState<WaitingSignUp | null>(null);
  // Accept (0046): the sign-up whose confirm card is open, its error, and the last one accepted.
  const [accepting, setAccepting] = useState<WaitingSignUp | null>(null);
  const [acceptBusy, setAcceptBusy] = useState(false);
  const [acceptError, setAcceptError] = useState<MessageKey | null>(null);
  const [accepted, setAccepted] = useState<Accepted | null>(null);
  // A Save that returned the record of an earlier person (lost answer, then another person typed): shown, not hidden.
  const [otherSaved, setOtherSaved] = useState<Registered | null>(null);
  // An adult filled in by hand: the coordinator showed them the privacy notice (#290, #292).
  const [adultNoticeShown, setAdultNoticeShown] = useState(false);

  // The sign-ups waiting for the desk, kept apart from the option lists so that one failing never hides
  // the other (audit R2-02). undefined = loading, null = the first load failed.
  const [waitingList, setWaitingList] = useState<WaitingSignUp[] | null | undefined>(undefined);
  // True when the last reload failed and the list shown is the one from before.
  const [waitingStale, setWaitingStale] = useState(false);
  const [waitingBusy, setWaitingBusy] = useState(false);
  const [waitingQuery, setWaitingQuery] = useState('');
  const [waitingShown, setWaitingShown] = useState(WAITING_PAGE);
  // Only the newest reload's answer is used (a slow older one must not bring back an accepted person).
  const waitingLoad = useRef(0);

  /** Reloads the waiting sign-ups (other desks accept and register too, audit P1-06); keeps the list when offline. */
  const refreshWaiting = useCallback(async () => {
    const mine = ++waitingLoad.current;
    setWaitingBusy(true);
    const list = await fetchWaitingSignUps();
    if (mine !== waitingLoad.current) return;
    setWaitingBusy(false);
    setWaitingStale(list === null);
    setWaitingList((current) => list ?? current ?? null);
  }, []);
  useFocusEffect(
    useCallback(() => {
      void refreshWaiting();
    }, [refreshWaiting]),
  );
  const { target, focusFirst, focusField } = useFormFocus<Field>();

  useEffect(() => {
    let cancelled = false;
    fetchRegistrationChoices().then((result) => {
      if (!cancelled) setChoices(result);
    });
    // Asked apart: the form still works on a database without 0036 (then without these parts). The waiting
    // list is loaded on focus (refreshWaiting).
    void Promise.all([fetchAllOptions(), fetchReferrers()]).then(([rows, referrers]) => {
      if (cancelled) return;
      setExtras(rows && rows.length > 0 ? { options: activeSets(rows), referrers: referrers ?? [] } : null);
    });
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  // Kept only while something is typed and not saved yet (the requestId keeps a repeated Save single).
  const typed = [form.fullName, form.dob, form.phone, form.email, form.guardianName, form.guardianPhone].some((v) => v.trim() !== '');
  useDraftKeeper(DRAFT_KEY, owner, typed && !saved ? ({ form, about } satisfies RegisterDraft) : null);

  /**
   * Returns a change handler for one form field. Editing a field clears its message (audit F2-16); a
   * new name or date of birth is a new person, so the form gets a new request id (P1-04).
   */
  function field<K extends keyof RegistrationForm>(key: K) {
    return (value: RegistrationForm[K]) => {
      setForm((current) => ({
        ...current,
        [key]: value,
        ...((key === 'fullName' || key === 'dob') && current[key] !== value ? { requestId: newRequestId() } : {}),
      }));
      setErrors((current) => (current[key] ? { ...current, [key]: undefined } : current));
    };
  }
  /** The translated error for one field, if any. */
  function errorFor(key: keyof RegistrationForm): string | undefined {
    const messageKey = errors[key];
    return messageKey ? t(messageKey) : undefined;
  }
  /**
   * Checks one box when it is left (#268): a problem shows at once, a fixed one goes away. An empty box
   * shows nothing until Save, unless it showed a problem already. `next` is the form after a change
   * that is not drawn yet (the date of birth).
   */
  function checkOnLeave(key: keyof RegistrationForm, next: RegistrationForm = form) {
    const typed = next[key];
    if (typeof typed === 'string' && !typed.trim() && !errors[key]) return;
    const minorNow = (ageFromForm(next.dob)?.minor ?? false) || serverMinor;
    const problem = { ...checkStudentDetails(next), ...(minorNow ? checkGuardianConsent(next) : {}) }[key];
    setErrors((current) => ({ ...current, [key]: problem }));
  }

  const age = ageFromForm(form.dob);
  // The database's date decides in the end: when it answered "minor" the parent's part opens (D6-13).
  const minor = (age?.minor ?? false) || serverMinor;
  // A minor's emergency contact is the parent of the guardian part (C3).
  const aboutParts: AboutPart[] = minor ? ['you', 'heard', 'occupation'] : ['you', 'emergency', 'heard', 'occupation'];
  const aboutContext = { minor, hasGuardian: minor, staff: true };
  const setAboutField = <K extends keyof AboutForm>(key: K, value: AboutForm[K]) => setAbout((current) => ({ ...current, [key]: value }));
  const waiting = useMemo(() => (waitingList ?? []).filter((w) => w.id !== fromSignUp?.id), [waitingList, fromSignUp]);
  const waitingMatches = useMemo(() => filterWaiting(waiting, waitingQuery), [waiting, waitingQuery]);

  /** Fills the form from a sign-up waiting for the desk. */
  function fillFrom(person: WaitingSignUp) {
    setForm((current) => ({
      ...current,
      fullName: person.full_name,
      dob: person.dob ? formatTypedDate(person.dob) : current.dob,
      email: person.email ?? current.email,
      phone: person.phone ?? current.phone,
      // A new person: never the id of a Save made for someone else (P1-04).
      requestId: newRequestId(),
    }));
    setAbout(aboutFormFrom(person, classLocale().country));
    setFromSignUp(person);
    setAdultNoticeShown(false);
    setErrors({});
    setAboutErrors({});
    setAccepting(null);
  }

  /** Opens Accept's confirm card for one sign-up. */
  function askAccept(person: WaitingSignUp) {
    setAccepting(person);
    setAcceptError(null);
    setAccepted(null);
  }

  /** Registers the sign-up from its own data (accept_sign_up); it leaves the waiting list. */
  async function confirmAccept(person: WaitingSignUp) {
    setAcceptBusy(true);
    setAcceptError(null);
    const result = await acceptSignUp(person.id);
    setAcceptBusy(false);
    if (!result.accepted) {
      setAcceptError(result.errorKey ?? 'common.genericError');
      return;
    }
    setAccepted(result.accepted);
    setAccepting(null);
    setWaitingList((current) => current?.filter((w) => w.id !== person.id) ?? current);
    void refreshWaiting();
  }

  async function save() {
    const found = { ...checkStudentDetails(form), ...(minor ? checkGuardianConsent(form) : {}) };
    const foundAbout = extras ? checkAbout(about, aboutParts, aboutContext) : {};
    setErrors(found);
    setAboutErrors(foundAbout);
    if (Object.keys(found).length > 0 || Object.keys(foundAbout).length > 0) {
      setFormError('register.errors.fixFields');
      // About you: the gender and Diksha name are in its first block, the rest in "More about the student".
      const youKeys: (keyof AboutForm)[] = ['dikshaName', 'gender'];
      const aboutYou = youKeys.some((k) => foundAbout[k]);
      focusFirst(ORDER, { ...found, aboutYou, aboutMore: !aboutYou && Object.keys(foundAbout).length > 0 });
      return;
    }
    setFormError(null);
    setOtherSaved(null);
    setBusy(true);
    // An adult's privacy notice: the one ticked at sign-up, else the one the desk showed (#290, #292).
    const adultNotice = fromSignUp?.notice_version ?? (adultNoticeShown ? PRIVACY_NOTICE_VERSION : null);
    const result = await registerStudent(form, serverMinor, adultNotice);
    // A repeat that came back with another person's record: this person was not saved (P1-04).
    const otherPerson = !!result.registered && repeatedOtherPerson(result.registered, form.fullName);
    let detailsFailed = false;
    if (result.registered && extras && !otherPerson) {
      // The details go after the record (#165: a gender set here gives the mentor), also on a repeat:
      // the first Save's answer may have been lost before they were sent (audit F2-03; the keys
      // overwrite, so sending them twice is harmless). A failure keeps the student; C8 offers them again.
      const patch = { ...aboutPatch(about, aboutParts, aboutContext), ...(fromSignUp?.centre_id ? { centre: fromSignUp.centre_id } : {}) };
      const details = await saveStudentDetails(result.registered.id, patch);
      detailsFailed = !!details.errorKey;
    }
    setBusy(false);
    if (result.registered && otherPerson) {
      // Keep the form; a new id so the next Save stores this person.
      setForm((current) => ({ ...current, requestId: newRequestId() }));
      setFormError(null);
      setOtherSaved(result.registered);
      return;
    }
    if (result.registered) {
      setSaved({ registered: result.registered, name: result.registered.fullName, detailsFailed });
      void refreshWaiting();
    } else if (result.errorKey === 'register.errors.minorNeedsConsent' && !minor) {
      setServerMinor(true);
      setFormError('register.errors.minorByServer');
    } else setFormError(result.errorKey ?? 'common.genericError');
  }

  function registerAnother() {
    setShowRestored(false);
    setForm(emptyRegistration(defaultMentor));
    setServerMinor(false);
    setAbout(emptyAboutForm(classLocale().country));
    setErrors({});
    setAboutErrors({});
    setAdultNoticeShown(false);
    if (fromSignUp) setWaitingList((current) => current?.filter((w) => w.id !== fromSignUp.id) ?? current);
    setFromSignUp(null);
    setSaved(null);
    setOtherSaved(null);
  }

  const header = <Stack.Screen options={{ title: t('register.title') }} />;

  if (saved) {
    return (
      <Screen underHeader>
        {header}
        <Notice tone="success" title={t('register.doneTitle')}>
          {t('register.doneBody', { name: saved.name, rollNo: saved.registered.rollNo })}
        </Notice>
        {saved.registered.repeated ? <AppText>{t('register.alreadySaved')}</AppText> : null}
        {saved.registered.linked ? <AppText>{t('register.linked')}</AppText> : null}
        {saved.detailsFailed ? <Notice tone="error">{t('register.detailsFailed')}</Notice> : null}
        {/* The new student is at the desk: their first visit, now (#341). */}
        <CheckInNow studentId={saved.registered.id} name={saved.name} />
        <Button variant="secondary" icon="add" label={t('register.another')} onPress={registerAnother} />
        <Button
          variant="link"
          icon="person"
          label={t('register.openStudent')}
          onPress={() => router.push({ pathname: '/staff/students/[id]', params: { id: saved.registered.id } })}
        />
        <Button
          variant="link"
          label={t('register.done')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      </Screen>
    );
  }

  if (choices === null) {
    return (
      <Screen underHeader centred>
        {header}
        <Notice tone="error" title={t('register.loadFailed')}>
          {t('common.networkError')}
        </Notice>
        <Button icon="refresh" label={t('common.tryAgain')} onPress={() => setLoadAttempt(loadAttempt + 1)} />
      </Screen>
    );
  }

  return (
    <Screen underHeader onRefresh={refreshWaiting}>
      {header}
      <AppText tone="muted">{t('register.intro')}</AppText>
      {showRestored ? (
        <DraftNotice
          notes={restored?.form.writtenConsent || restored?.form.photoConsent ? [t('drafts.consentAgain')] : []}
          discardLabel={t('drafts.startEmpty')}
          onDiscard={registerAnother}
        />
      ) : null}

      {accepted ? (
        <>
          <Notice tone="success" title={t('register.doneTitle')}>
            {[
              t('register.doneBody', { name: accepted.fullName, rollNo: accepted.rollNo }),
              t(accepted.repeated ? 'register.acceptedRepeated' : accepted.existing ? 'register.acceptedExisting' : 'register.acceptedLogin'),
            ].join('\n')}
          </Notice>
          <CheckInNow key={accepted.id} studentId={accepted.id} name={accepted.fullName} />
          <Button
            variant="link"
            icon="person"
            label={t('register.openStudent')}
            onPress={() => router.push({ pathname: '/staff/students/[id]', params: { id: accepted.id } })}
          />
        </>
      ) : null}
      {waitingList === null ? (
        // The first load failed: say so, so the desk does not think nobody is waiting (R2-02).
        <>
          <Notice tone="error" title={t('register.waitingLoadFailed')}>
            {t('common.networkError')}
          </Notice>
          <Button variant="secondary" icon="refresh" label={t('common.tryAgain')} loading={waitingBusy} onPress={() => void refreshWaiting()} />
        </>
      ) : null}
      {waiting.length > 0 ? (
        <Section icon="newJoiner" title={t('register.waitingTitle', { count: waiting.length })} description={t('register.waitingHint')}>
          <Button variant="secondary" icon="refresh" label={t('register.waitingRefresh')} loading={waitingBusy} onPress={() => void refreshWaiting()} />
          {waitingStale ? <Notice tone="info">{t('register.waitingStale')}</Notice> : null}
          <TextField
            label={t('register.waitingSearch')}
            hint={t('register.waitingSearchHint')}
            value={waitingQuery}
            onChangeText={(text) => {
              setWaitingQuery(text);
              setWaitingShown(WAITING_PAGE);
            }}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {waitingMatches.length === 0 ? <AppText tone="muted">{t('register.waitingNoMatch')}</AppText> : null}
          {/* Spoken by TalkBack as the search narrows the list (P2-03, #314). */}
          {waitingQuery.trim() !== '' && waitingMatches.length > 0 ? (
            <StatusText tone="muted">{t('common.foundCount', { count: waitingMatches.length })}</StatusText>
          ) : null}
          {waitingMatches.slice(0, waitingShown).map((w) => {
            // Accept for an adult with a date of birth, a name that passes and the privacy tick; otherwise the
            // form only: under 18 (the desk with a parent), no date, a name from before #267 (Save says what to
            // correct), or no privacy tick (FF-01: the form shows the notice).
            const age = w.dob ? ageFromForm(formatTypedDate(w.dob)) : null;
            const action = waitingAction(w);
            const canAccept = action === 'accept';
            if (age && accepting?.id === w.id) {
              return (
                <View key={w.id} style={styles.confirm}>
                  <Notice tone="info" title={t('register.acceptTitle', { name: w.full_name })} announced>
                    {[
                      t('register.acceptName', { value: w.full_name }),
                      t('register.acceptDob', { date: formatTypedDate(w.dob ?? ''), age: age.age }),
                      w.centre_name ? t('register.acceptCentre', { value: w.centre_name }) : '',
                      w.phone ? t('register.acceptPhone', { value: formatPhone(w.phone) }) : '',
                      w.email ? t('register.acceptEmail', { value: w.email }) : '',
                    ]
                      .filter(Boolean)
                      .join('\n')}
                  </Notice>
                  <AppText variant="label">{t('register.acceptCheckId')}</AppText>
                  {acceptError ? <Notice tone="error">{t(acceptError)}</Notice> : null}
                  <Button icon="check" label={t('register.accept')} loading={acceptBusy} onPress={() => void confirmAccept(w)} />
                  {/* No privacy tick at sign-up: Fill the form is the way through, so it comes first (R2-03). */}
                  <Button
                    variant={acceptError === 'register.acceptErrors.noNotice' ? 'primary' : 'secondary'}
                    label={t('register.acceptChange')}
                    disabled={acceptBusy}
                    onPress={() => fillFrom(w)}
                  />
                  <Button variant="link" label={t('register.cancel')} disabled={acceptBusy} onPress={() => setAccepting(null)} />
                </View>
              );
            }
            return (
              <ListRow
                key={w.id}
                leading="person"
                title={w.full_name || w.email || ''}
                details={[
                  w.email ?? '',
                  w.phone ? formatPhone(w.phone) : '',
                  t('register.signedUpOn', { when: formatDateTime(w.created_at) }),
                  action === 'noNotice' ? t('register.waitingNoNotice') : '',
                ].filter(Boolean)}
                action={
                  canAccept
                    ? { label: t('register.accept'), onPress: () => askAccept(w) }
                    : { label: t('register.fillFrom'), variant: 'secondary', onPress: () => fillFrom(w) }
                }
              />
            );
          })}
          {waitingMatches.length > waitingShown ? (
            <Button
              variant="secondary"
              label={t('register.waitingMore', { shown: waitingShown, total: waitingMatches.length })}
              onPress={() => setWaitingShown((n) => n + WAITING_PAGE)}
            />
          ) : null}
        </Section>
      ) : null}
      {fromSignUp ? (
        <Notice tone="info" title={t('register.filledTitle', { name: fromSignUp.full_name })}>
          {t('register.filledBody')}
        </Notice>
      ) : null}

      <Section icon="person" title={t('register.studentSection')}>
        <TextField
          ref={target('fullName')}
          label={t('register.fullName')}
          value={form.fullName}
          onChangeText={field('fullName')}
          onBlur={() => checkOnLeave('fullName')}
          error={errorFor('fullName')}
          maxLength={NAME_MAX_LENGTH}
          autoComplete="off"
          autoCapitalize="words"
          autoCorrect={false}
          hint={t('register.fullNameHint')}
          // The date of birth is a tap on the calendar; Next goes on to the phone.
          returnKeyType="next"
          onSubmitEditing={() => focusField('phone')}
          submitBehavior="submit"
        />
        <BirthDateField
          ref={target('dob')}
          label={t('register.dob')}
          // The form keeps the date as typed text (drafts, filled from a sign-up): '15-6-2012'.
          value={partsOfTyped(form.dob)}
          onChange={(parts) => {
            const next = { ...form, dob: typedOfParts(parts) };
            setForm(next);
            setServerMinor(false);
            if (errors.dob) checkOnLeave('dob', next);
          }}
          error={errorFor('dob')}
          // Once a real date is picked, the hint shows the age, so the coordinator sees at once
          // whether the parent's consent will be needed.
          hint={
            age
              ? t(age.minor ? 'register.ageMinor' : 'register.age', { age: age.age })
              : t('register.dobHint')
          }
        />
        <TextField
          ref={target('phone')}
          label={t('register.phone')}
          value={form.phone}
          onChangeText={(text) => field('phone')(typedPhone(text))}
          onBlur={() => checkOnLeave('phone')}
          error={errorFor('phone')}
          keyboardType="phone-pad"
          inputMode="tel"
          maxLength={PHONE_MAX_LENGTH}
          autoComplete="off"
          returnKeyType="next"
          onSubmitEditing={() => focusField('email')}
          submitBehavior="submit"
        />
        <TextField
          ref={target('email')}
          label={t('register.email')}
          // A child's record is never linked to a login by itself (#276): children use the printed QR card (R1-01).
          hint={t(minor ? 'register.emailHintMinor' : 'register.emailHint')}
          value={form.email}
          onChangeText={field('email')}
          onBlur={() => checkOnLeave('email')}
          error={errorFor('email')}
          maxLength={EMAIL_MAX_LENGTH}
          keyboardType="email-address"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          returnKeyType="next"
          onSubmitEditing={() => focusField('area')}
          submitBehavior="submit"
        />
        <TextField
          ref={target('area')}
          label={t('register.area')}
          hint={t('register.areaHint')}
          value={form.area}
          onChangeText={field('area')}
          maxLength={AREA_MAX_LENGTH}
          autoComplete="off"
          returnKeyType="next"
          onSubmitEditing={() => focusField('pincode')}
          submitBehavior="submit"
        />
        <TextField
          ref={target('pincode')}
          label={t('register.pincode')}
          value={form.pincode}
          onChangeText={(text) => field('pincode')(asciiDigits(text).replace(/\D/g, ''))}
          onBlur={() => checkOnLeave('pincode')}
          error={errorFor('pincode')}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={6}
        />
        {choices ? (
          <>
            <ChoiceGroup
              label={t('register.level')}
              choices={choices.levels.map((level) => ({
                value: level.id,
                label: levelName(t, level.id, level.name),
              }))}
              value={form.levelId}
              onChange={field('levelId')}
            />
            {extras ? (
              <View ref={target('aboutYou')} collapsable={false} style={styles.part}>
                <YouPart form={about} set={setAboutField} errors={aboutErrors} options={extras.options} context={aboutContext} />
              </View>
            ) : null}
            <ChoiceGroup<string>
              label={t('register.mentor')}
              choices={[
                // Empty string stands for "no mentor yet" inside the picker only; since 0036 the database
                // then gives a coordinator of the student's gender (#165).
                { value: '', label: extras ? t('register.mentorAuto') : t('register.noMentor') },
                ...choices.mentors.map((m) => ({ value: m.id, label: m.fullName })),
              ]}
              value={form.mentorId ?? ''}
              onChange={(id) => field('mentorId')(id || null)}
            />
          </>
        ) : (
          <AppText tone="muted">{t('common.loading')}</AppText>
        )}
        {/* An adult's privacy notice (#290, #292): ticked at sign-up, or shown here and kept on the record. A
            minor's is on the parent's consent below. */}
        {minor ? null : fromSignUp?.notice_version ? (
          <AppText variant="small" tone="muted">
            {t('register.adultNoticeFromSignUp')}
          </AppText>
        ) : (
          <>
            <PrivacyNoticeLink label={t('signUp.privacyNotice')} />
            <Checkbox label={t('register.adultNoticeShown')} checked={adultNoticeShown} onChange={setAdultNoticeShown} />
          </>
        )}
      </Section>

      {minor ? (
        <Section icon="guardian" title={t('register.guardianSection')} description={t('register.guardianIntro')}>
          <TextField
            ref={target('guardianName')}
            label={t('register.guardianName')}
            value={form.guardianName}
            onChangeText={field('guardianName')}
            onBlur={() => checkOnLeave('guardianName')}
            error={errorFor('guardianName')}
            maxLength={NAME_MAX_LENGTH}
            autoComplete="off"
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="next"
            onSubmitEditing={() => focusField('guardianPhone')}
            submitBehavior="submit"
          />
          <TextField
            ref={target('guardianPhone')}
            label={t('register.guardianPhone')}
            value={form.guardianPhone}
            onChangeText={(text) => field('guardianPhone')(typedPhone(text))}
            onBlur={() => checkOnLeave('guardianPhone')}
            error={errorFor('guardianPhone')}
            keyboardType="phone-pad"
            inputMode="tel"
            maxLength={PHONE_MAX_LENGTH}
            autoComplete="off"
            returnKeyType="next"
            onSubmitEditing={() => focusField('guardianEmail')}
            submitBehavior="submit"
          />
          <TextField
            ref={target('guardianEmail')}
            label={t('register.guardianEmail')}
            value={form.guardianEmail}
            onChangeText={field('guardianEmail')}
            onBlur={() => checkOnLeave('guardianEmail')}
            error={errorFor('guardianEmail')}
            maxLength={EMAIL_MAX_LENGTH}
            keyboardType="email-address"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
          />
          <View ref={target('relation')} collapsable={false}>
            <ChoiceGroup
              label={t('register.relation')}
              choices={RELATIONS.map((r) => ({ value: r, label: t(`relations.${r}`) }))}
              value={form.relation}
              onChange={field('relation')}
              error={errorFor('relation')}
            />
          </View>
          <View ref={target('idType')} collapsable={false}>
            <ChoiceGroup
              label={t('register.idChecked')}
              choices={ID_TYPES.map((id) => ({ value: id, label: t(`idTypes.${id}`) }))}
              value={form.idType}
              onChange={field('idType')}
              error={errorFor('idType')}
            />
          </View>
          <AppText variant="small" tone="muted">
            {t('register.idCheckedHint')}
          </AppText>
          <PrivacyNoticeLink label={t('register.privacyNotice')} />
          <AppText variant="small" tone="muted">
            {t('register.privacyNoticeHint')}
          </AppText>
          <Checkbox
            label={t('register.photoConsent')}
            checked={form.photoConsent}
            onChange={field('photoConsent')}
          />
          <View ref={target('writtenConsent')} collapsable={false}>
            <Checkbox
              label={t('register.writtenConsent')}
              checked={form.writtenConsent}
              onChange={field('writtenConsent')}
              error={errorFor('writtenConsent')}
            />
          </View>
        </Section>
      ) : null}

      {extras ? (
        <View ref={target('aboutMore')} collapsable={false}>
          <Section icon="about" title={t('register.moreTitle')} description={t('register.moreHint')}>
            {minor ? null : (
              <>
                <AppText variant="label">{t('about.stepEmergency')}</AppText>
                <EmergencyPart form={about} set={setAboutField} errors={aboutErrors} options={extras.options} context={aboutContext} />
              </>
            )}
            <HeardPart form={about} set={setAboutField} errors={aboutErrors} options={extras.options} context={aboutContext}
              referrers={extras.referrers} />
            <OccupationPart form={about} set={setAboutField} errors={aboutErrors} options={extras.options} context={aboutContext} />
          </Section>
        </View>
      ) : null}

      {otherSaved ? (
        <Notice tone="error" title={t('register.otherSavedTitle', { name: form.fullName.trim() })}>
          {t('register.otherSavedBody', { other: otherSaved.fullName, rollNo: otherSaved.rollNo })}
        </Notice>
      ) : null}
      {formError ? <Notice tone="error">{t(formError)}</Notice> : null}
      <Button icon="register" label={t('register.submit')} onPress={save} loading={busy} disabled={!choices} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Accept's confirm card, in place of the sign-up's row.
  confirm: {
    gap: spacing.sm,
  },
  // About you's fields keep the Section's space between them inside their wrapper.
  part: {
    gap: spacing.md,
  },
});
