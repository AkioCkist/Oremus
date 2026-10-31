import React, { useEffect, useState } from 'react';
import { Box, H2, H5, Illustration, Loader, Text, MessageBox } from '@adminjs/design-system';
import { ApiClient } from 'adminjs';

const api = new ApiClient();

const number = (value) => (typeof value === 'number' ? value.toLocaleString() : '-');

function Stat({ label, value, hint }) {
  return (
    <Box variant="container" boxShadow="card" flex="1 1 200px" m="sm" p="lg">
      <Text variant="sm" color="grey60">{label}</Text>
      <H2 mb="xs" mt="xs">{number(value)}</H2>
      {hint ? <Text variant="sm" color="grey60">{hint}</Text> : null}
    </Box>
  );
}

function Section({ title, children }) {
  return (
    <Box mb="xl">
      <H5 mx="sm" mb="sm">{title}</H5>
      <Box flex flexWrap="wrap">{children}</Box>
    </Box>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getDashboard().then((response) => setData(response.data)).catch(() => setError('Could not load the metrics.'));
  }, []);

  if (error) return <Box p="xl"><MessageBox message={error} variant="danger" /></Box>;
  if (!data) return <Box p="xl"><Loader /></Box>;

  const queues = Object.entries(data.queues || {});
  return (
    <Box p="xl">
      <Section title="Community">
        <Stat label="Active today" value={data.users.activeToday} hint="Members with at least one signal" />
        <Stat label="New members (7 days)" value={data.users.newThisWeek} />
        <Stat label="Total members" value={data.users.total} />
        <Stat label="Restricted accounts" value={data.users.restricted} />
        <Stat label="New posts today" value={data.content.postsToday} />
        <Stat label="New comments today" value={data.content.commentsToday} />
      </Section>
      <Section title="Safety">
        <Stat label="Open cases" value={data.moderation.openCases} hint="Waiting for a person" />
        <Stat label="Open reports" value={data.moderation.openReports} />
        <Stat label="Open appeals" value={data.moderation.openAppeals} />
        <Stat label="Auto-removed (7 days)" value={data.moderation.removedThisWeek} />
      </Section>
      <Section title="Ads">
        <Stat label="Waiting for review" value={data.ads.pendingReview} />
        <Stat label="Active campaigns" value={data.ads.active} />
        <Stat label="Top-ups (30 days, VND)" value={data.ads.topUps} />
        <Stat label="Ad spend (30 days, VND)" value={data.ads.spend} />
      </Section>
      <Section title="Calls (7 days)">
        <Stat label="Calls" value={data.calls.total} />
        <Stat label="Answered" value={data.calls.answered} />
        <Stat label="Failed" value={data.calls.failed} />
      </Section>
      <Section title="Background jobs">
        {queues.length ? queues.map(([name, counts]) => (
          <Stat key={name} label={name} value={counts.waiting + counts.active} hint={`${number(counts.delayed)} delayed, ${number(counts.failed)} failed`} />
        )) : <Box m="sm"><Illustration variant="NotFound" width={0} height={0} /><Text>Job queue is unavailable.</Text></Box>}
      </Section>
      <Text mx="sm" variant="sm" color="grey60">Updated {new Date(data.generatedAt).toLocaleTimeString()}. Figures are cached for a minute.</Text>
    </Box>
  );
}
