// G9 one centre, the Guru only ('new' = add one): name, address, the GPS point typed as
// "17.3850, 78.4867" or pasted as a Google Maps link, the radius of the attendance area, the open
// window; "Check on Google Maps" opens the point; switch off or on, asking first. The area is
// checked at each check-in against the marking phone's position (lib/attendance-location.ts, #70).
// Data: src/data/centres.ts.

import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { GuruOnly } from '@/components/guru-only';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { RouteIdGuard } from '@/components/route-id-guard';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import {
  checkCentre,
  fetchCentres,
  formOf,
  RADIUS,
  saveCentre,
  setCentreActive,
  type Centre,
  type CentreErrors,
  type CentreForm,
} from '@/data/centres';
import { mapUrl, readPoint } from '@/lib/map-link';

/** Add or edit a centre. */
function CentreScreenContent() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  // undefined = loading, null = could not load or not found.
  const [centre, setCentre] = useState<Centre | null | undefined>(isNew ? null : undefined);
  const [form, setForm] = useState<CentreForm>(formOf(null));
  const [errors, setErrors] = useState<CentreErrors>({});
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    if (isNew) return;
    const all = await fetchCentres();
    const found = all?.find((c) => String(c.id) === id) ?? null;
    setCentre(found);
    if (found) setForm(formOf(found));
  }, [id, isNew]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (profile?.role !== 'guru') return <GuruOnly title={t('centres.title')} />;
  const title = isNew ? t('centres.addTitle') : (centre?.name ?? t('centres.title'));
  const header = <Stack.Screen options={{ title }} />;

  if (!isNew && centre === undefined) {
    return (
      <Screen underHeader>
        {header}
        <LoadingCards />
      </Screen>
    );
  }
  if (!isNew && centre === null) {
    return (
      <Screen underHeader centred>
        {header}
        <Notice tone="error" title={t('centres.loadFailed')}>
          {t('common.networkError')}
        </Notice>
        <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
      </Screen>
    );
  }

  const point = form.location.trim() ? readPoint(form.location) : null;
  const goodPoint = point && point !== 'short_link' ? point : null;

  async function save() {
    const found = checkCentre(form);
    setErrors(found);
    setMessage(null);
    if (Object.keys(found).length > 0) {
      setMessage({ tone: 'error', text: t('settings.fixFirst') });
      return;
    }
    setBusy(true);
    const result = await saveCentre(isNew ? null : (centre?.id ?? null), form);
    setBusy(false);
    if (result.errorKey) {
      setMessage({ tone: 'error', text: t(result.errorKey) });
      return;
    }
    if (isNew && result.id !== undefined) {
      router.replace({ pathname: '/staff/centres/[id]', params: { id: String(result.id) } });
      return;
    }
    setMessage({ tone: 'success', text: t('centres.saved') });
    await load();
  }

  async function toggleActive() {
    if (!centre) return;
    setBusy(true);
    const result = await setCentreActive(centre.id, !centre.active);
    setBusy(false);
    setConfirming(false);
    setMessage(
      result.errorKey
        ? { tone: 'error', text: t(result.errorKey) }
        : { tone: 'success', text: t(centre.active ? 'centres.switchedOff' : 'centres.switchedOn') },
    );
    if (!result.errorKey) await load();
  }

  return (
    <Screen underHeader>
      {header}
      {centre && !centre.active ? <Notice tone="info">{t('centres.isOff')}</Notice> : null}

      <Section icon="location" title={t('centres.detailsTitle')}>
        <TextField
          label={t('centres.name')}
          value={form.name}
          onChangeText={(name) => setForm({ ...form, name })}
          maxLength={60}
          error={errors.name ? t(errors.name) : undefined}
        />
        <TextField
          label={t('centres.address')}
          value={form.address}
          onChangeText={(address) => setForm({ ...form, address })}
          maxLength={300}
          multiline
          error={errors.address ? t(errors.address) : undefined}
        />
        <TextField
          label={t('centres.city')}
          hint={t('centres.cityHint')}
          value={form.city}
          onChangeText={(city) => setForm({ ...form, city })}
          maxLength={60}
          error={errors.city ? t(errors.city) : undefined}
        />
        <TextField
          label={t('centres.opensAt')}
          hint={t('settings.timeHint')}
          value={form.opensAt}
          onChangeText={(opensAt) => setForm({ ...form, opensAt })}
          maxLength={5}
          error={errors.opensAt ? t(errors.opensAt) : undefined}
        />
        <TextField
          label={t('centres.closesAt')}
          hint={t('settings.timeHint')}
          value={form.closesAt}
          onChangeText={(closesAt) => setForm({ ...form, closesAt })}
          maxLength={5}
          error={errors.closesAt ? t(errors.closesAt) : undefined}
        />
      </Section>

      <Section icon="location" title={t('centres.areaTitle')} description={t('centres.areaHint')}>
        <TextField
          label={t('centres.location')}
          hint={t('centres.locationHint')}
          value={form.location}
          onChangeText={(location) => setForm({ ...form, location })}
          autoCapitalize="none"
          autoCorrect={false}
          error={errors.location ? t(errors.location) : undefined}
        />
        {goodPoint ? (
          <>
            <AppText variant="small" tone="muted">
              {t('centres.pointRead', { latitude: goodPoint.lat, longitude: goodPoint.lng })}
            </AppText>
            <Button variant="link" icon="open" label={t('centres.checkOnMap')} onPress={() => void Linking.openURL(mapUrl(goodPoint))} />
          </>
        ) : null}
        <TextField
          label={t('centres.radius')}
          hint={t('centres.radiusHint', RADIUS)}
          value={form.radius}
          onChangeText={(radius) => setForm({ ...form, radius: radius.replace(/[^0-9]/g, '') })}
          keyboardType="number-pad"
          maxLength={4}
          error={errors.radius ? t(errors.radius, RADIUS) : undefined}
        />
        <Notice tone="info">{t('centres.phoneCheckLater')}</Notice>
      </Section>

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <Button icon="check" label={isNew ? t('centres.addButton') : t('centres.save')} loading={busy && !confirming} onPress={() => void save()} />

      {centre ? (
        <Section icon="status" title={centre.active ? t('centres.offTitle') : t('centres.onTitle')}>
          <AppText tone="muted">
            {centre.active ? t('centres.offHint', { count: centre.students }) : t('centres.onHint')}
          </AppText>
          {confirming ? (
            <>
              <Notice tone="info">{t(centre.active ? 'centres.confirmOff' : 'centres.confirmOn', { name: centre.name })}</Notice>
              <Button
                label={centre.active ? t('centres.switchOff') : t('centres.switchOn')}
                loading={busy}
                onPress={() => void toggleActive()}
              />
              <Button variant="link" label={t('centres.cancel')} onPress={() => setConfirming(false)} />
            </>
          ) : (
            <Button
              variant="secondary"
              icon={centre.active ? 'retire' : 'restore'}
              label={centre.active ? t('centres.switchOff') : t('centres.switchOn')}
              onPress={() => setConfirming(true)}
            />
          )}
        </Section>
      ) : null}
    </Screen>
  );
}

/** Checks the address's id before the screen loads anything (D6-07). */
export default function CentreScreen() {
  return (
    <RouteIdGuard kind="number" allowNew>
      <CentreScreenContent />
    </RouteIdGuard>
  );
}
