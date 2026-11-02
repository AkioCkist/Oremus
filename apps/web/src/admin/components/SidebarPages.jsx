import React from 'react';
import { Navigation } from '@adminjs/design-system';
import { ViewHelpers, useCurrentAdmin } from 'adminjs';
import { useSelector } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';

/*
 * The sidebar's page list (overrides AdminJS's SidebarPages) as one "System" group: Monitoring, whose sections are tabs
 * inside the page rather than nine sidebar entries, and the audit log, which reads as a system record rather than a
 * moderation tool.
 */

const h = new ViewHelpers();
const MONITORING = ['monitoring', 'servers', 'requests', 'exceptions', 'database', 'cache', 'queues', 'outgoing', 'usage'];

export default function SidebarPages({ pages }) {
  const [admin] = useCurrentAdmin();
  const resources = useSelector((state) => state.resources) || [];
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const go = (event, element) => { event.preventDefault(); if (element.href) navigate(element.href); };

  const elements = [];
  if (admin?.role === 'admin' && (pages || []).some((page) => page.name === 'monitoring')) {
    elements.push({ id: 'monitoring', label: 'Monitoring', icon: 'Activity', href: h.pageUrl('monitoring'), isSelected: MONITORING.some((name) => pathname.endsWith(`/pages/${name}`)), onClick: go });
  }
  const audit = resources.find((resource) => resource.id === 'AuditLog');
  if (audit) {
    const href = h.resourceUrl({ resourceId: audit.id });
    elements.push({ id: 'audit', label: 'Audit log', icon: 'List', href, isSelected: pathname.startsWith(href), onClick: go });
  }
  return elements.length ? <Navigation label="System" elements={elements} /> : null;
}
