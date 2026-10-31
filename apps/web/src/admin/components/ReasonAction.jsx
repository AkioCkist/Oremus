import React, { useState } from 'react';
import { Box, Button, FormGroup, Input, Label, MessageBox, TextArea } from '@adminjs/design-system';
import { ApiClient, useNotice, useTranslation } from 'adminjs';

const api = new ApiClient();

/**
 * Generic form for record actions that need a written reason, and optionally a duration in days.
 * The action declares which it wants through `custom`: { reasonLabel, days, submitLabel, variant }.
 */
export default function ReasonAction({ action, resource, record, setTag }) {
  const addNotice = useNotice();
  const { translateMessage } = useTranslation();
  const custom = action.custom || {};
  const [reason, setReason] = useState('');
  const [days, setDays] = useState(String(custom.days || ''));
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      const response = await api.recordAction({
        resourceId: resource.id, recordId: record.id, actionName: action.name, method: 'post',
        data: { reason, days, amount }
      });
      const notice = response.data.notice;
      if (notice) addNotice(notice);
      if (notice?.type === 'error') setError(notice.message);
      else window.location.assign(response.data.redirectUrl || `${window.location.pathname.split('/actions/')[0]}/show`);
    } catch {
      setError(translateMessage('errorFetchingRecord', resource.id, { defaultValue: 'That did not work. Try again.' }));
    } finally {
      setSaving(false);
    }
  };

  if (setTag) setTag(action.label);
  return (
    <Box as="form" onSubmit={submit} variant="container" p="xl">
      {custom.warning ? <MessageBox mb="lg" message={custom.warning} variant="warning" /> : null}
      {custom.noReason ? null : (
        <FormGroup>
          <Label required htmlFor="reason">{custom.reasonLabel || 'Reason'}</Label>
          <TextArea id="reason" width={1} rows={4} required maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
        </FormGroup>
      )}
      {custom.days ? (
        <FormGroup>
          <Label required htmlFor="days">Days</Label>
          <Input id="days" type="number" min="1" max="365" required value={days} onChange={(event) => setDays(event.target.value)} />
        </FormGroup>
      ) : null}
      {custom.amount ? (
        <FormGroup>
          <Label required htmlFor="amount">Amount (VND)</Label>
          <Input id="amount" type="number" step="1" required value={amount} onChange={(event) => setAmount(event.target.value)} />
        </FormGroup>
      ) : null}
      {error ? <MessageBox mb="lg" message={error} variant="danger" /> : null}
      <Button type="submit" variant={custom.variant || 'contained'} disabled={saving}>{custom.submitLabel || action.label}</Button>
    </Box>
  );
}
