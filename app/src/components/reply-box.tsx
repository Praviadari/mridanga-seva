// The "Reply to <author>" box under an announcement (S10 for students, C15 for staff reading
// someone else's): a text box, a note on who will read the reply, and a Send button. The reply is
// private: only the author and the Guru see it (docs/DECISIONS.md #29). The screen does the
// sending and reloads its list of replies; this keeps the typed text and the messages.

import type { ParseKeys } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { checkReply, REPLY_MAX_LENGTH } from '@/data/announcements';

import { Button } from './button';
import { Notice } from './notice';
import { Section } from './section';
import { TextField } from './text-field';

/** Props for ReplyBox. */
export type ReplyBoxProps = {
  /** Heading, already translated, e.g. "Reply to Radha". */
  title: string;
  /** Who will read it, already translated, e.g. "Only Radha and the Guru see your reply." */
  note: string;
  /**
   * Sends the reply (already checked). Resolves to the key of an error message, or undefined
   * when it was sent.
   */
  onSend: (body: string) => Promise<ParseKeys | undefined>;
};

/** A reply form in a titled card. Empties itself and says "Sent" after a reply goes out. */
export function ReplyBox({ title, note, onSend }: ReplyBoxProps) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [error, setError] = useState<ParseKeys | undefined>(undefined);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function send() {
    const problem = checkReply(text);
    setError(problem);
    setSent(false);
    if (problem) return;
    setSending(true);
    const failed = await onSend(text);
    setSending(false);
    if (failed) {
      setError(failed);
      return;
    }
    setText('');
    setSent(true);
  }

  return (
    <Section title={title} description={note}>
      <TextField
        label={t('announcements.replies.yourReply')}
        hint={t('announcements.replies.hint', { max: REPLY_MAX_LENGTH })}
        value={text}
        onChangeText={(value) => {
          setText(value);
          setError(undefined);
          setSent(false);
        }}
        error={error ? t(error) : undefined}
        maxLength={REPLY_MAX_LENGTH}
        multiline
        numberOfLines={3}
        style={{ minHeight: 80, textAlignVertical: 'top' }}
      />
      {sent ? <Notice tone="success">{t('announcements.replies.sent')}</Notice> : null}
      <Button label={t('announcements.replies.send')} loading={sending} onPress={() => void send()} />
    </Section>
  );
}
